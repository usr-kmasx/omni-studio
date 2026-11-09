//! Gerenciador do motor llama.cpp (runtime gerenciado + detecção externa).

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use sha2::{Digest, Sha256};
use thiserror::Error;

use crate::archive;
use crate::paths;
use crate::settings::{IntegratedMeta, IntegratedParams, ManagedMeta, Settings};

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("erro de I/O: {0}")]
    Io(#[from] std::io::Error),
    #[error("erro de rede: {0}")]
    Network(String),
    #[error("pacote inválido: {0}")]
    Extract(#[from] crate::archive::ExtractError),
    #[error("checksum inválido: esperado {expected}, obtido {got}")]
    Checksum { expected: String, got: String },
    #[error("pacote inválido: {0}")]
    InvalidPackage(String),
    #[error("instalação cancelada pelo usuário")]
    Cancelled,
    #[error("runtime externo não encontrado")]
    ExternalNotFound,
    #[error("não foi possível executar o executável: {0}")]
    Probe(String),
}

#[derive(Debug, Clone)]
pub struct DownloadProgress {
    pub done: u64,
    pub total: Option<u64>,
}

pub type ProgressFn = dyn Fn(&DownloadProgress) + Send + Sync;

/// Noventa o arquivo de `url`, calcula SHA256 e compara com `expected_sha`.
pub fn download_file_verified(
    url: &str,
    expected_sha: &str,
    dest: &Path,
    cancel: &AtomicBool,
    progress: &ProgressFn,
) -> Result<(), EngineError> {
    if let Some(p) = dest.parent() {
        fs::create_dir_all(p)?;
    }
    let resp = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(300)))
        .build()
        .new_agent()
        .get(url)
        .call()
        .map_err(|e| EngineError::Network(e.to_string()))?;
    let total = resp
        .headers()
        .get("Content-Length")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok());
    let mut reader = resp.into_body().into_reader();
    let mut file = fs::File::create(dest)?;
    let mut hasher = Sha256::new();
    let mut done: u64 = 0;
    let mut chunk = [0u8; 65536];
    loop {
        if cancel.load(Ordering::Relaxed) {
            drop(file);
            let _ = fs::remove_file(dest);
            return Err(EngineError::Cancelled);
        }
        let n = reader
            .read(&mut chunk)
            .map_err(|e| EngineError::Network(e.to_string()))?;
        if n == 0 {
            break;
        }
        hasher.update(&chunk[..n]);
        file.write_all(&chunk[..n])?;
        done += n as u64;
        progress(&DownloadProgress { done, total });
    }
    let got = hex::encode(hasher.finalize());
    if got != expected_sha.to_lowercase() {
        drop(file);
        let _ = fs::remove_file(dest);
        return Err(EngineError::Checksum {
            expected: expected_sha.to_string(),
            got,
        });
    }
    Ok(())
}

fn validate_runtime_dir(dir: &Path) -> Result<(), EngineError> {
    use std::os::unix::fs::PermissionsExt;
    let server = dir.join("llama-server");
    if !server.is_file() {
        return Err(EngineError::InvalidPackage(
            "llama-server não encontrado no pacote".into(),
        ));
    }
    if std::fs::metadata(&server)?.permissions().mode() & 0o111 == 0 {
        return Err(EngineError::InvalidPackage(
            "llama-server sem permissão de execução".into(),
        ));
    }
    for required in [
        "libllama.so",
        "libggml.so",
        "libmtmd.so",
        "libggml-vulkan.so",
    ] {
        let found = dir.read_dir()?.any(|e| {
            let Ok(e) = e else { return false };
            let fname = e.file_name();
            let name = fname.to_string_lossy();
            if !name.starts_with(required) {
                return false;
            }
            // Segue symlinks; exige arquivo real com conteúdo.
            std::fs::metadata(e.path())
                .map(|m| m.is_file() && m.len() > 0)
                .unwrap_or(false)
        });
        if !found {
            return Err(EngineError::InvalidPackage(format!(
                "biblioteca necessária ausente: {required}"
            )));
        }
    }
    Ok(())
}

fn find_runtime_root(staging: &Path) -> Result<PathBuf, EngineError> {
    for entry in fs::read_dir(staging)? {
        let entry = entry?;
        let p = entry.path();
        if p.is_dir() && p.join("llama-server").is_file() {
            return Ok(p);
        }
    }
    if staging.join("llama-server").is_file() {
        return Ok(staging.to_path_buf());
    }
    Err(EngineError::InvalidPackage(
        "estrutura do pacote não reconhecida".into(),
    ))
}

/// Instala o runtime gerenciado sob demanda (download → verify → extract →
/// validar → mover para o diretório definitivo).
pub fn install_managed(
    cancel: &AtomicBool,
    progress: &ProgressFn,
) -> Result<ManagedMeta, EngineError> {
    let final_dir = paths::managed_runtime_dir();
    if final_dir.join("llama-server").is_file() {
        // Instalação existente: mantém apenas se válida; caso contrário,
        // descarta para refazer do zero.
        if validate_runtime_dir(&final_dir).is_ok() {
            return Ok(ManagedMeta::default());
        }
        let _ = fs::remove_dir_all(&final_dir);
    }

    let cache = paths::cache_dir();
    fs::create_dir_all(&cache)?;
    let archive_path = cache.join(format!(
        "llama-{}-{}-x64.tar.gz",
        paths::RUNTIME_VERSION,
        paths::RUNTIME_VARIANT.replace("linux-x64-", "")
    ));

    download_file_verified(
        paths::RUNTIME_URL,
        paths::RUNTIME_SHA256,
        &archive_path,
        cancel,
        progress,
    )?;

    let staging = tempfile::tempdir_in(&cache)?;
    archive::extract_tar_gz(&archive_path, staging.path())?;
    let root = find_runtime_root(staging.path())?;
    validate_runtime_dir(&root)?;

    if let Some(parent) = final_dir.parent() {
        fs::create_dir_all(parent)?;
    }
    if final_dir.exists() {
        return Err(EngineError::InvalidPackage(format!(
            "diretório definitivo já existe e não é uma instalação válida: {}",
            final_dir.display()
        )));
    }
    fs::rename(&root, &final_dir)?;
    validate_runtime_dir(&final_dir)?;

    Ok(ManagedMeta::default())
}

// ---------------------------------------------------------------------------
// Backend integrado (b12202, pré-compilado oficial, isolado).
// ---------------------------------------------------------------------------

/// Nome do executável moderno no pacote (novo CLI `llama serve`).
const BACKEND_BIN_NAME: &str = "llama";

/// Valida a instalação isolada do backend integrado.
/// Valida uma instalação do backend num diretório específico.
pub fn validate_backend_dir(dir: &Path) -> Result<(), EngineError> {
    use std::os::unix::fs::PermissionsExt;
    let bin = dir.join("bin").join(BACKEND_BIN_NAME);
    if !bin.is_file() {
        return Err(EngineError::InvalidPackage(format!(
            "backend integrado não encontrado: {}",
            bin.display()
        )));
    }
    if std::fs::metadata(&bin)?.permissions().mode() & 0o111 == 0 {
        return Err(EngineError::InvalidPackage(
            "backend integrado sem permissão de execução".into(),
        ));
    }
    for required in [
        "libggml-vulkan.so",
        "libggml.so",
        "libggml-base.so.0",
        "libllama-common.so.0",
    ] {
        let found = dir
            .join("lib")
            .join(required)
            .is_file();
        if !found {
            return Err(EngineError::InvalidPackage(format!(
                "biblioteca do backend ausente ou link quebrado: {required}"
            )));
        }
    }

    // Confirma que o executável realmente carrega suas dependências.
    // A checagem anterior só verificava duas bibliotecas e aceitava pacotes
    // sem SONAMEs necessários, que falhavam ao iniciar com erro 127.
    let probe = std::process::Command::new(&bin)
        .arg("--version")
        .env("LD_LIBRARY_PATH", dir.join("lib"))
        .output()?;
    if !probe.status.success() {
        let detail = String::from_utf8_lossy(&probe.stderr);
        return Err(EngineError::InvalidPackage(format!(
            "executável não consegue carregar as bibliotecas: {}",
            detail.trim()
        )));
    }

    Ok(())
}

pub fn validate_backend_install() -> Result<(), EngineError> {
    validate_backend_dir(&paths::backend_version_dir())
}

/// `true` se a instalação integrada existe e é válida.
pub fn is_backend_installed() -> bool {
    validate_backend_install().is_ok()
}

fn find_backend_root(staging: &Path) -> Result<PathBuf, EngineError> {
    for entry in fs::read_dir(staging)? {
        let entry = entry?;
        let p = entry.path();
        if p.is_dir() && p.join(BACKEND_BIN_NAME).is_file() {
            return Ok(p);
        }
    }
    if staging.join(BACKEND_BIN_NAME).is_file() {
        return Ok(staging.to_path_buf());
    }
    Err(EngineError::InvalidPackage(
        "estrutura do pacote do backend não reconhecida".into(),
    ))
}

/// Instala o backend integrado isolado (download → verify → extract → validar →
/// organizar `bin/`+`lib/` → `version.json`).
pub fn install_backend_managed(
    cancel: &AtomicBool,
    progress: &ProgressFn,
) -> Result<IntegratedMeta, EngineError> {
    install_backend_from(None, cancel, progress)
}

pub fn verify_sha256(path: &Path, expected: &str) -> Result<(), EngineError> {
    let mut file = fs::File::open(path)?;
    let mut hash = Sha256::new();
    std::io::copy(&mut file, &mut hash)?;
    let got = format!("{:x}", hash.finalize());
    if got != expected {
        return Err(EngineError::Checksum { expected: expected.into(), got });
    }
    Ok(())
}

pub fn install_backend_from(
    bundled_archive: Option<&Path>,
    cancel: &AtomicBool,
    progress: &ProgressFn,
) -> Result<IntegratedMeta, EngineError> {
    static INSTALL_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = INSTALL_LOCK.lock().map_err(|_| std::io::Error::other("backend installation lock poisoned"))?;
    let final_dir = paths::backend_version_dir();
    match validate_backend_install() {
        Ok(()) => {
            log::info!("Backend instalado e íntegro; reutilizando instalação.");
            return Ok(IntegratedMeta::default());
        }
        Err(e) => {
            log::warn!("Validação falhou: {e}");
        }
    }

    let archive_path = if let Some(path) = bundled_archive {
        verify_sha256(path, paths::BACKEND_SHA256)?;
        path.to_path_buf()
    } else {
        let path = paths::cache_dir().join(paths::backend_archive_name());
        download_file_verified(
            paths::BACKEND_URL,
            paths::BACKEND_SHA256,
            &path,
            cancel,
            progress,
        )?;
        path
    };

    let parent = final_dir.parent().unwrap();
    fs::create_dir_all(parent)?;
    let staging = tempfile::tempdir_in(parent)?;
    let unpacked = staging.path().join("unpacked");
    fs::create_dir(&unpacked)?;
    archive::extract_tar_gz(&archive_path, &unpacked)?;
    let root = find_backend_root(&unpacked)?;

    let staging_final = staging.path().join("install");
    fs::create_dir_all(staging_final.join("bin"))?;
    fs::create_dir_all(staging_final.join("lib"))?;
    let bin_src = root.join(BACKEND_BIN_NAME);
    fs::rename(&bin_src, staging_final.join("bin").join(BACKEND_BIN_NAME))?;

    for entry in fs::read_dir(&root)? {
        let entry = entry?;
        let p = entry.path();
        // file_type() não segue symlinks. Isso é necessário porque o alvo
        // pode já ter sido movido para lib/ numa iteração anterior.
        let file_type = entry.file_type()?;
        if !file_type.is_file() && !file_type.is_symlink() {
            continue;
        }

        let name = p
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        if name.contains(".so") {
            // Preserva inclusive links SONAME como libggml-base.so.0 e
            // libllama-common.so.0, mesmo que estejam temporariamente dangling.
            fs::rename(&p, staging_final.join("lib").join(&name))?;
        } else if name != BACKEND_BIN_NAME {
            fs::rename(&p, staging_final.join("bin").join(&name))?;
        }
    }

    // Symlinks em bin/ → lib/ (o binário usa $ORIGIN para carregar backends).
    for entry in fs::read_dir(staging_final.join("lib"))? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let link = staging_final.join("bin").join(&name);
        if link.exists() {
            continue;
        }
        let _ = std::os::unix::fs::symlink(
            PathBuf::from("../lib").join(&name),
            &link,
        );
    }

    // version.json (no staging)
    let vj = serde_json::json!({
        "version": paths::BACKEND_VERSION,
        "architecture": "x86_64",
        "variant": paths::BACKEND_VARIANT,
        "checksum_sha256": paths::BACKEND_SHA256,
        "origin": paths::BACKEND_URL,
        "executable": "bin/llama",
        "subcommand": "serve"
    });
    let vj_str = serde_json::to_string_pretty(&vj)
        .map_err(|e| EngineError::Io(std::io::Error::other(e)))?;
    fs::write(staging_final.join("version.json"), vj_str)?;

    validate_backend_dir(&staging_final)?;

    // Publicação atômica com backup: só substitui quando o staging é válido.
    let old_dir = final_dir.parent().unwrap().join(format!("{}.old", paths::BACKEND_VERSION));
    if final_dir.exists() {
        let _ = fs::remove_dir_all(&old_dir);
        fs::rename(&final_dir, &old_dir)?;
    }
    if let Err(e) = fs::rename(&staging_final, &final_dir) {
        let _ = fs::rename(&old_dir, &final_dir);
        return Err(EngineError::Io(e));
    }
    let _ = fs::remove_dir_all(&old_dir);

    validate_backend_install()?;
    log::info!("Backend b12202 instalado e validado (asset pré-compilado).");

    Ok(IntegratedMeta::default())
}

/// Remove exclusivamente a instalação isolada do backend integrado.
pub fn uninstall_backend_managed() -> Result<(), EngineError> {
    let expected = paths::backend_version_dir();
    if !expected.exists() {
        return Ok(());
    }
    fs::remove_dir_all(&expected)?;
    Ok(())
}

fn push_opt(args: &mut Vec<String>, flag: &str, value: &str) {
    args.push(flag.to_string());
    args.push(value.to_string());
}

/// Constrói os argumentos do novo CLI `llama serve` (b12202).
pub fn backend_serve_args(
    model: &Path,
    mmproj: Option<&Path>,
    port: u16,
    params: &IntegratedParams,
    cors_origin: &str,
) -> Vec<String> {
    let mut args = vec!["serve".to_string()];
    push_opt(&mut args, "-m", &model.display().to_string());
    if let Some(mm) = mmproj {
        push_opt(&mut args, "-mm", &mm.display().to_string());
    }
    push_opt(&mut args, "-c", &params.ctx_size.to_string());
    push_opt(&mut args, "-ngl", &params.ngl);
    push_opt(&mut args, "-ctk", &params.cache_type_k);
    push_opt(&mut args, "-ctv", &params.cache_type_v);
    push_opt(&mut args, "-fa", &params.flash_attn);
    push_opt(&mut args, "--reasoning", &params.reasoning);
    if let Some(t) = params.threads {
        push_opt(&mut args, "-t", &t.to_string());
    }
    if let Some(tb) = params.threads_batch {
        push_opt(&mut args, "-tb", &tb.to_string());
    }
    if let Some(b) = params.batch_size {
        push_opt(&mut args, "-b", &b.to_string());
    }
    if let Some(ub) = params.ubatch_size {
        push_opt(&mut args, "-ub", &ub.to_string());
    }
    if let Some(np) = params.slots {
        push_opt(&mut args, "-np", &np.to_string());
    }
    push_opt(&mut args, "--host", &params.host);
    push_opt(&mut args, "--port", &port.to_string());
    if !cors_origin.is_empty() {
        push_opt(&mut args, "--cors-origins", cors_origin);
    }
    if params.no_webui {
        args.push("--no-webui".to_string());
    }
    args
}

/// Remove exclusivamente a instalação gerenciada registrada.
pub fn uninstall_managed(settings: &Settings) -> Result<(), EngineError> {
    let Some(meta) = &settings.managed else {
        return Ok(());
    };
    let expected = paths::managed_runtime_dir();
    if PathBuf::from(&meta.dir).canonicalize().ok() != expected.canonicalize().ok()
        && meta.dir != expected.display().to_string()
    {
        return Err(EngineError::InvalidPackage(format!(
            "recusa remover diretório não registrado: {}",
            meta.dir
        )));
    }
    if expected.exists() {
        fs::remove_dir_all(&expected)?;
    }
    Ok(())
}

#[derive(Debug, Clone)]
pub struct ExternalInfo {
    pub path: PathBuf,
    pub version: Option<String>,
    pub env_available: bool,
}

/// Tenta localizar `llama-server` (PATH ou caminho manual) e obter a versão.
pub fn detect_external(manual: Option<&str>) -> Option<ExternalInfo> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(m) = manual {
        candidates.push(PathBuf::from(m));
    }
    if let Some(path_var) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path_var) {
            candidates.push(dir.join("llama-server"));
        }
    }
    for c in candidates {
        if !c.is_file() {
            continue;
        }
        let version = probe_version(&c);
        return Some(ExternalInfo {
            path: c,
            version,
            env_available: true,
        });
    }
    None
}

/// Executa `llama-server --version` com limite de tempo.
pub fn probe_version(bin: &Path) -> Option<String> {
    use std::process::{Command, Stdio};
    let mut child = Command::new(bin)
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .ok()?;
    let stdout = child.stdout.take()?;
    let stderr = child.stderr.take()?;
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut out = String::new();
        let _ = std::io::Read::read_to_string(&mut std::io::BufReader::new(stdout), &mut out);
        let mut err = String::new();
        let _ = std::io::Read::read_to_string(&mut std::io::BufReader::new(stderr), &mut err);
        let _ = tx.send(out.trim().to_string() + "\n" + err.trim());
    });
    let deadline = Instant::now() + Duration::from_secs(4);
    while Instant::now() < deadline {
        if let Ok(Some(_)) = child.try_wait() {
            let version = rx.recv_timeout(Duration::from_secs(1)).unwrap_or_default();
            return Some(version);
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let _ = child.kill();
    let _ = child.wait();
    rx.recv_timeout(Duration::from_secs(1)).ok()
}

/// Constrói os argumentos do `llama-server` para o modelo selecionado.
pub fn server_args(
    model: &Path,
    mmproj: Option<&Path>,
    port: u16,
) -> Vec<String> {
    let mut args = vec![
        "-m".into(),
        model.display().to_string(),
        "--host".into(),
        "127.0.0.1".into(),
        "--port".into(),
        port.to_string(),
        "--reasoning".into(),
        "off".into(),
        "--temp".into(),
        "0".into(),
        "-ngl".into(),
        "99".into(),
        "-c".into(),
        "8192".into(),
        "--verbose".into(),
    ];
    if let Some(m) = mmproj {
        args.push("--mmproj".into());
        args.push(m.display().to_string());
    }
    args
}

#[cfg(test)]
mod tests {
    use super::*;

    fn noop(_: &DownloadProgress) {}

    #[test]
    fn backend_serve_args_modernos() {
        let params = IntegratedParams::default();
        let args = super::backend_serve_args(
            Path::new("/m/modelo.gguf"),
            Some(Path::new("/m/mmproj.gguf")),
            12345,
            &params,
            "http://127.0.0.1:9999",
        );
        assert_eq!(args[0], "serve");
        assert!(args.windows(2).any(|w| w == ["-m", "/m/modelo.gguf"]));
        assert!(args.windows(2).any(|w| w == ["-mm", "/m/mmproj.gguf"]));
        assert!(args.windows(2).any(|w| w == ["-ngl", "all"]));
        assert!(args.windows(2).any(|w| w == ["-ctk", "q4_0"]));
        assert!(args.windows(2).any(|w| w == ["--reasoning", "off"]));
        assert!(args.windows(2).any(|w| w == ["--host", "127.0.0.1"]));
        assert!(args.windows(2).any(|w| w == ["--port", "12345"]));
        assert!(args.windows(2).any(|w| w == ["--cors-origins", "http://127.0.0.1:9999"]));
        assert!(args.contains(&"--no-webui".to_string()));
        assert!(!args.iter().any(|a| a == "--cors"), "sem --cors legado");
    }

    /// Mini servidor HTTP de uma única resposta (para teste de checksum).
    fn tiny_http(body: &'static [u8]) -> String {
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let url = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
        std::thread::spawn(move || {
            if let Ok((mut sock, _)) = listener.accept() {
                let mut buf = [0u8; 4096];
                let _ = sock.read(&mut buf);
                let head = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = sock.write_all(head.as_bytes());
                let _ = sock.write_all(body);
            }
        });
        url
    }

    #[test]
    fn checksum_incorreto_e_rejeitado() {
        let url = tiny_http(b"conteudo de teste");
        let dest = std::env::temp_dir().join("omni_bad_sha.bin");
        let _ = std::fs::remove_file(&dest);
        let cancel = AtomicBool::new(false);
        let err = download_file_verified(&url, "0000000000000000000000000000000000000000000000000000000000000000", &dest, &cancel, &noop);
        assert!(matches!(err, Err(EngineError::Checksum { .. })));
        assert!(!dest.exists(), "arquivo inválido deve ser removido");
    }

    #[test]
    fn checksum_correto_pass() {
        let url = tiny_http(b"conteudo de teste");
        let dest = std::env::temp_dir().join("omni_good_sha.bin");
        let _ = std::fs::remove_file(&dest);
        let cancel = AtomicBool::new(false);
        let expected = "9a62d4a5d8a6e2d7c4e2c0f8a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8";
        // sha256("conteudo de teste") — calculado abaixo em runtime para evitar erro de digitação
        let mut h = Sha256::new();
        h.update(b"conteudo de teste");
        let expected = hex::encode(h.finalize());
        download_file_verified(&url, &expected, &dest, &cancel, &noop).unwrap();
        assert!(dest.exists());
        let _ = std::fs::remove_file(&dest);
    }
}
