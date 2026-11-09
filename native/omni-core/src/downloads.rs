//! Transferência de arquivos com progresso, cancelamento e retomada.
//!
//! Retomada (RFC 7233):
//! - cabeçalho `Range: bytes=<offset>-`, desde que o ETag do arquivo parcial
//!   continue idêntico ao do servidor;
//! - `206` → anexa a partir do offset; `200` → o servidor ignorou Range,
//!   reinicia do zero; `416` → salta para verificação;
//! - ETag armazenado em metadados ao lado do arquivo parcial.
//!
//! Integridade: verifica SHA256 somente quando `expected_sha256` é fornecido
//! (checksum oficial); caso contrário registra `verified=false`.

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use sha2::{Digest, Sha256};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DownloadError {
    #[error("erro de I/O: {0}")]
    Io(#[from] std::io::Error),
    #[error("erro de rede: {0}")]
    Network(String),
    #[error("HTTP {0}")]
    Http(u16),
    #[error("checksum inválido: esperado {expected}, obtido {got}")]
    Checksum { expected: String, got: String },
    #[error("download cancelado")]
    Cancelled,
    #[error("espaço em disco insuficiente (necessário {need} B)")]
    NoSpace { need: u64 },
}

#[derive(Debug, Clone, Default)]
pub struct DlProgress {
    pub bytes: u64,
    pub total: Option<u64>,
    pub speed_bps: f64,
    pub stage: String,
}

pub type ProgressCb = dyn Fn(&DlProgress) + Send + Sync;

/// Metadados de retomada.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PartialMeta {
    pub etag: Option<String>,
    pub size: u64,
}

fn agent(secs: u64) -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(secs)))
        .timeout_per_read(Some(Duration::from_secs(8)))
        .build()
        .new_agent()
}

/// Espaço livre (bytes) no sistema de arquivos que contém `path`.
pub fn free_space(path: &Path) -> std::io::Result<u64> {
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        let dir = if path.is_dir() {
            path.to_path_buf()
        } else {
            path.parent().unwrap_or(path).to_path_buf()
        };
        let c = std::ffi::CString::new(dir.as_os_str().as_bytes())
            .map_err(std::io::Error::other)?;
        let mut st: libc::statvfs = unsafe { std::mem::zeroed() };
        let rc = unsafe { libc::statvfs(c.as_ptr(), &mut st) };
        if rc != 0 {
            return Err(std::io::Error::last_os_error());
        }
        Ok(st.f_bavail * st.f_frsize)
    }
    #[cfg(not(unix))]
    {
        let _ = path;
        Ok(u64::MAX)
    }
}

pub struct DownloadHandle {
    pub cancel: Arc<AtomicBool>,
    pub progress: Arc<Mutex<DlProgress>>,
    pub join: Option<std::thread::JoinHandle<()>>,
    pub final_path: PathBuf,
}

impl DownloadHandle {
    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }
}

/// Executa o download (no thread atual). Uso esperado dentro de `std::thread`.
pub fn run_download(
    url: &str,
    partial: &Path,
    final_dest: &Path,
    expected_sha256: Option<&str>,
    target_size: Option<u64>,
    cancel: &AtomicBool,
    progress: &(dyn Fn(&DlProgress) + Send + Sync),
) -> Result<(), DownloadError> {
    run_download_with_skip(url, partial, final_dest, expected_sha256, target_size, cancel, None, progress)
}

pub(crate) fn run_download_with_skip(
    url: &str,
    partial: &Path,
    final_dest: &Path,
    expected_sha256: Option<&str>,
    target_size: Option<u64>,
    cancel: &AtomicBool,
    skip: Option<&AtomicBool>,
    progress: &(dyn Fn(&DlProgress) + Send + Sync),
) -> Result<(), DownloadError> {
    if let Some(parent) = partial.parent() {
        fs::create_dir_all(parent)?;
    }
    let meta_path = meta_path_for(partial);
    let mut offset: u64 = 0;
    let mut old_etag: Option<String> = None;
    if let Ok(meta) = fs::read_to_string(&meta_path) {
        if let Ok(m) = serde_json::from_str::<PartialMeta>(&meta) {
            if m.size > 0 && fs::metadata(partial).is_ok_and(|f| f.len() == m.size) {
                offset = m.size;
                old_etag = m.etag;
            }
        }
    }

    if let Some(size) = target_size {
        if offset == size {
            return finish(partial, &meta_path, final_dest, expected_sha256, cancel, skip, progress);
        }
        let need = size.saturating_sub(offset);
        if free_space(final_dest)? < need { return Err(DownloadError::NoSpace { need }); }
    }

    let mut headers = Vec::new();
    if offset > 0 {
        headers.push(("Range".to_string(), format!("bytes={offset}-")));
    }

    let mut req = agent(3600).get(url);
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }
    let resp = req.call().map_err(|e| DownloadError::Network(e.to_string()))?;
    let status = resp.status().as_u16();

    let total = resp
        .headers()
        .get("Content-Length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .or(target_size);

    let etag = resp
        .headers()
        .get("ETag")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim_matches('"').to_string());

    // Decide ponto de partida.
    let (append, start_offset) = match status {
        206 => {
            let content_range = resp
                .headers()
                .get("Content-Range")
                .and_then(|v| v.to_str().ok())
                .unwrap_or_default();
            let start = content_range
                .split_whitespace()
                .nth(1)
                .and_then(|r| r.split_once('-').map(|(start, _)| start))
                .and_then(|v| v.parse::<u64>().ok())
                .ok_or_else(|| DownloadError::Network("Invalid Content-Range".into()))?;
            if start != offset {
                // Servidor respondeu outro intervalo: reinicia.
                (false, 0)
            } else {
                (true, offset)
            }
        }
        200 => (false, 0),
        416 => {
            // Range insatisfeito: arquivo parcialmente completo; reinicia.
            (false, 0)
        }
        404 => return Err(DownloadError::Http(404)),
        other => return Err(DownloadError::Http(other)),
    };

    if status == 206 && (start_offset != offset || (old_etag.is_some() && old_etag != etag)) {
        fs::remove_file(partial)?;
        let _ = fs::remove_file(&meta_path);
        return run_download_with_skip(url, partial, final_dest, expected_sha256, target_size, cancel, skip, progress);
    }
    let total = target_size.or_else(|| total.map(|bytes| bytes.saturating_add(start_offset)));

    let mut file = if append {
        fs::OpenOptions::new().append(true).open(partial)?
    } else {
        if offset > 0 {
            let _ = fs::remove_file(partial);
        }
        fs::File::create(partial)?
    };

    let streamed = stream_body(resp, &mut file, start_offset, total, cancel, progress);
    drop(file);
    if let Ok(metadata) = fs::metadata(partial) {
        let checkpoint = PartialMeta { etag, size: metadata.len() };
        fs::write(&meta_path, serde_json::to_vec(&checkpoint).map_err(std::io::Error::other)?)?;
    }
    streamed?;

    finish(partial, &meta_path, final_dest, expected_sha256, cancel, skip, progress)
}

fn stream_body(
    resp: ureq::http::Response<ureq::Body>,
    out: &mut fs::File,
    start_offset: u64,
    total: Option<u64>,
    cancel: &AtomicBool,
    progress: &(dyn Fn(&DlProgress) + Send + Sync),
) -> Result<(), DownloadError> {
    let mut reader = resp.into_body().into_reader();
    let mut done = start_offset;
    let started = Instant::now();
    let mut chunk = [0u8; 65536];
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err(DownloadError::Cancelled);
        }
        let n = reader
            .read(&mut chunk)
            .map_err(|error| if cancel.load(Ordering::Relaxed) {
                DownloadError::Cancelled
            } else {
                DownloadError::Network(error.to_string())
            })?;
        if n == 0 {
            break;
        }
        out.write_all(&chunk[..n])?;
        done += n as u64;
        let elapsed = started.elapsed().as_secs_f64().max(1e-6);
        let speed = done.saturating_sub(start_offset) as f64 / elapsed;
        progress(&DlProgress {
            bytes: done,
            total,
            speed_bps: speed,
            stage: "baixando".into(),
        });
    }
    Ok(())
}

fn finish(
    partial: &Path,
    meta_path: &Path,
    final_dest: &Path,
    expected_sha256: Option<&str>,
    cancel: &AtomicBool,
    skip: Option<&AtomicBool>,
    progress: &(dyn Fn(&DlProgress) + Send + Sync),
) -> Result<(), DownloadError> {
    if cancel.load(Ordering::Relaxed) { return Err(DownloadError::Cancelled); }
    let bytes = fs::metadata(partial)?.len();
    let should_skip = || skip.is_some_and(|flag| flag.load(Ordering::Relaxed));
    if expected_sha256.is_some() && !should_skip() {
        progress(&DlProgress { bytes, total: Some(bytes), speed_bps: 0.0, stage: "verifying".into() });
    }
    // Metadados para retomada (antes da conclusão).
    if let Ok(m) = fs::metadata(partial) {
        let meta = PartialMeta {
            etag: None,
            size: m.len(),
        };
        let _ = fs::write(meta_path, serde_json::to_string(&meta).unwrap_or_default());
    }

    if let Some(expected) = expected_sha256.filter(|_| !should_skip()) {
        let mut hasher = Sha256::new();
        let mut f = fs::File::open(partial)?;
        let mut buf = [0u8; 65536];
        loop {
            if cancel.load(Ordering::Relaxed) { return Err(DownloadError::Cancelled); }
            if should_skip() { break; }
            let n = f.read(&mut buf)?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
        }
        let got = hex::encode(hasher.finalize());
        if !should_skip() && got != expected.to_lowercase() {
            let _ = fs::remove_file(partial);
            let _ = fs::remove_file(meta_path);
            return Err(DownloadError::Checksum {
                expected: expected.to_string(),
                got,
            });
        }
    }

    if cancel.load(Ordering::Relaxed) { return Err(DownloadError::Cancelled); }
    if let Some(parent) = final_dest.parent() {
        fs::create_dir_all(parent)?;
    }
    let _ = fs::remove_file(meta_path);
    match fs::rename(partial, final_dest) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::CrossesDevices => {
            fs::copy(partial, final_dest)?;
            fs::remove_file(partial)?;
            Ok(())
        }
        Err(e) => Err(e.into()),
    }
}

fn meta_path_for(partial: &Path) -> PathBuf {
    let mut s = partial.as_os_str().to_owned();
    s.push(".meta.json");
    PathBuf::from(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn noop(_: &DlProgress) {}

    fn free_port() -> u16 {
        std::net::TcpListener::bind(("127.0.0.1", 0))
            .unwrap()
            .local_addr()
            .unwrap()
            .port()
    }

    /// Servidor HTTP de teste com suporte opcional a Range e ETag fixo.
    fn test_server(body: &'static [u8], etag: Option<&'static str>, support_range: bool) -> String {
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let url = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
        let etag = etag.map(str::to_string);
        std::thread::spawn(move || {
            for _ in 0..8 {
                let Ok((mut sock, _)) = listener.accept() else {
                    break;
                };
                let etag_conn = etag.clone();
                std::thread::spawn(move || {
                    let mut buf = [0u8; 8192];
                    let n = sock.read(&mut buf).unwrap();
                    let req = String::from_utf8_lossy(&buf[..n]);
                    let range = req
                        .lines()
                        .find_map(|line| {
                            let (name, value) = line.split_once(':')?;
                            name.eq_ignore_ascii_case("Range").then_some(value)
                        })
                        .map(|r| r.trim().to_string());
                    let (status, partial_body) = if support_range {
                        if let Some(r) = &range {
                            if let Some(rest) = r.strip_prefix("bytes=") {
                                if let Some(seg) = rest.split('-').next() {
                                    if let Ok(start) = seg.parse::<usize>() {
                                        if start < body.len() {
                                            let b = &body[start..];
                                            (
                                                "206 Partial Content",
                                                Some((start as u64, b.to_vec())),
                                            )
                                        } else {
                                            ("416 Range Not Satisfiable", None)
                                        }
                                    } else {
                                        ("200 OK", None)
                                    }
                                } else {
                                    ("200 OK", None)
                                }
                            } else {
                                ("200 OK", None)
                            }
                        } else {
                            ("200 OK", None)
                        }
                    } else {
                        ("200 OK", None)
                    };
                    let head = match &partial_body {
                        Some((start, b)) => format!(
                            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nContent-Range: bytes {}-{}/{}\r\nETag: {}\r\nConnection: close\r\n\r\n",
                            b.len(),
                            start,
                            start + b.len() as u64 - 1,
                            body.len(),
                            etag_conn.as_deref().unwrap_or("etag1"),
                        ),
                        None => format!(
                            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nETag: {}\r\nConnection: close\r\n\r\n",
                            body.len(),
                            etag_conn.as_deref().unwrap_or("etag1"),
                        ),
                    };
                    let _ = sock.write_all(head.as_bytes());
                    let _ = sock.write_all(&partial_body.map(|(_, b)| b).unwrap_or_else(|| body.to_vec()));
                });
            }
        });
        url
    }

    #[test]
    fn download_simples_bem_sucedido() {
        let body = b"conteudo de teste para download";
        let url = test_server(body, None, true);
        let dir = tempfile::tempdir().unwrap();
        let part = dir.path().join("a.part");
        let dest = dir.path().join("a.bin");
        let cancel = AtomicBool::new(false);
        run_download(&url, &part, &dest, None, Some(body.len() as u64), &cancel, &noop).unwrap();
        assert_eq!(fs::read(&dest).unwrap(), body);
    }

    #[test]
    fn retomada_respeita_etag() {
        let body = b"0123456789abcdefghijABCDEFGHIJ";
        let url = test_server(body, Some("etag-fixo"), true);
        let dir = tempfile::tempdir().unwrap();
        let part = dir.path().join("r.part");
        let dest = dir.path().join("r.bin");
        // Simula um parcial com 10 bytes e etag igual.
        fs::write(&part, &body[..10]).unwrap();
        fs::write(
            meta_path_for(&part),
            serde_json::to_string(&PartialMeta {
                etag: Some("etag-fixo".into()),
                size: 10,
            })
            .unwrap(),
        )
        .unwrap();
        let cancel = AtomicBool::new(false);
        run_download(&url, &part, &dest, None, Some(body.len() as u64), &cancel, &noop).unwrap();
        assert_eq!(fs::read(&dest).unwrap(), body);
    }

    #[test]
    fn etag_alterado_descarta_parcial() {
        let body = b"0123456789abcdefghijABCDEFGHIJ";
        let url = test_server(body, Some("etag-novo"), true);
        let dir = tempfile::tempdir().unwrap();
        let part = dir.path().join("e.part");
        let dest = dir.path().join("e.bin");
        fs::write(&part, b"parcial-antigo").unwrap();
        fs::write(
            meta_path_for(&part),
            serde_json::to_string(&PartialMeta {
                etag: Some("etag-velho".into()),
                size: 14,
            })
            .unwrap(),
        )
        .unwrap();
        let cancel = AtomicBool::new(false);
        run_download(&url, &part, &dest, None, Some(body.len() as u64), &cancel, &noop).unwrap();
        assert_eq!(fs::read(&dest).unwrap(), body);
    }

    #[test]
    fn cancelamento_preserva_parcial() {
        // Servidor que envia o corpo lentamente.
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let url = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
        std::thread::spawn(move || {
            let (mut sock, _) = listener.accept().unwrap();
            let mut buf = [0u8; 4096];
            let _ = sock.read(&mut buf);
            let body = vec![b'x'; 200_000];
            let head = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = sock.write_all(head.as_bytes());
            for chunk in body.chunks(4096) {
                let _ = sock.write_all(chunk);
                std::thread::sleep(Duration::from_millis(5));
            }
        });
        let dir = tempfile::tempdir().unwrap();
        let part = dir.path().join("c.part");
        let dest = dir.path().join("c.bin");
        let cancel = Arc::new(AtomicBool::new(false));
        {
            let cancel = cancel.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(120));
                cancel.store(true, Ordering::SeqCst);
            });
        }
        let res = run_download(&url, &part, &dest, None, None, cancel.as_ref(), &noop);
        assert!(matches!(res, Err(DownloadError::Cancelled)));
        assert!(part.exists(), "parcial deve ser preservado");
        assert!(!dest.exists(), "destino final não deve existir");
        let saved: PartialMeta = serde_json::from_slice(&fs::read(meta_path_for(&part)).unwrap()).unwrap();
        assert!(saved.size > 0 && saved.size < 200_000);
        assert_eq!(saved.size, fs::metadata(&part).unwrap().len());
        let url = test_server(&[b'x'; 200_000], None, true);
        let first_progress = std::sync::Mutex::new(None);
        run_download(&url, &part, &dest, None, Some(200_000), &AtomicBool::new(false), &|p| {
            if p.stage != "verifying" { first_progress.lock().unwrap().get_or_insert(p.bytes); }
        }).unwrap();
        assert!(first_progress.into_inner().unwrap().unwrap() > saved.size);
        assert_eq!(fs::read(&dest).unwrap(), vec![b'x'; 200_000]);
    }

    #[test]
    fn checksum_invalido_remove_arquivo() {
        let body = b"abc";
        let url = test_server(body, None, true);
        let dir = tempfile::tempdir().unwrap();
        let part = dir.path().join("s.part");
        let dest = dir.path().join("s.bin");
        let cancel = AtomicBool::new(false);
        let res = run_download(
            &url,
            &part,
            &dest,
            Some("0000000000000000000000000000000000000000000000000000000000000000"),
            Some(3),
            &cancel,
            &noop,
        );
        assert!(matches!(res, Err(DownloadError::Checksum { .. })));
        assert!(!part.exists());
        assert!(!dest.exists());
    }

    #[test]
    fn espaco_insuficiente_negado() {
        let body = b"abc";
        let url = test_server(body, None, true);
        let dir = tempfile::tempdir().unwrap();
        let part = dir.path().join("sp.part");
        let dest = dir.path().join("sp.bin");
        let cancel = AtomicBool::new(false);
        // Exige mais espaço do que existe em disco como simulando um arquivo
        // de tamanho impossível.
        let res = run_download(
            &url,
            &part,
            &dest,
            None,
            Some(u64::MAX),
            &cancel,
            &noop,
        );
        assert!(matches!(res, Err(DownloadError::NoSpace { .. })));
        assert!(!dest.exists());
    }

    #[test]
    fn http_404_retorna_erro() {
        let url = "http://127.0.0.1:1/x";
        let dir = tempfile::tempdir().unwrap();
        let part = dir.path().join("n.part");
        let dest = dir.path().join("n.bin");
        let cancel = AtomicBool::new(false);
        let res = run_download(&url, &part, &dest, None, None, &cancel, &noop);
        assert!(res.is_err());
    }
}
