//! Cliente da API pública do Hugging Face (sem autenticação).
//!
//! Endpoints utilizados (todos públicos, confirmados por requisições reais):
//! - `GET https://huggingface.co/api/models?search=...&filter=gguf&limit=20`
//! - `GET https://huggingface.co/api/models/{repo_id}`
//! - tamanho/etag por arquivo: GET com `Range: bytes=0-0` (206) no endpoint
//!   `https://huggingface.co/{repo_id}/resolve/{revision}/{filename}`
//! - README bruto: `.../raw/{revision}/README.md`

use std::time::Duration;

use serde::Deserialize;
use thiserror::Error;

const API_BASE: &str = "https://huggingface.co/api";
const RESOLVE_BASE: &str = "https://huggingface.co";

#[derive(Debug, Error)]
pub enum HfError {
    #[error("erro de rede: {0}")]
    Network(String),
    #[error("erro HTTP {0}")]
    Http(u16),
    #[error("resposta inesperada: {0}")]
    Invalid(String),
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(60)))
        .timeout_per_read(Some(Duration::from_secs(8)))
        .build()
        .new_agent()
}

#[derive(Debug, Clone, Deserialize)]
pub struct RepoSummary {
    pub id: String,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub pipeline_tag: Option<String>,
    #[serde(default)]
    pub library_name: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub downloads: Option<i64>,
    #[serde(default)]
    pub likes: Option<i64>,
    #[serde(default)]
    pub gated: bool,
    #[serde(default)]
    pub private: bool,
}

impl RepoSummary {
    pub fn is_gguf(&self) -> bool {
        self.tags.iter().any(|t| t.eq_ignore_ascii_case("gguf"))
    }
    pub fn description(&self) -> String {
        self.tags
            .iter()
            .filter(|t| {
                !t.starts_with("base_model:")
                    && !t.starts_with("license:")
                    && t.len() < 90
            })
            .take(6)
            .cloned()
            .collect::<Vec<_>>()
            .join(" · ")
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Sibling {
    pub rfilename: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GgufMeta {
    #[serde(default)]
    pub total: Option<u64>,
    #[serde(default)]
    pub architecture: Option<String>,
    #[serde(default)]
    pub context_length: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RepoDetail {
    pub id: String,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub pipeline_tag: Option<String>,
    #[serde(default)]
    pub library_name: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub gated: bool,
    #[serde(default)]
    pub private: bool,
    #[serde(default)]
    pub downloads: Option<i64>,
    #[serde(default)]
    pub likes: Option<i64>,
    #[serde(default, rename = "cardData")]
    pub card_data: Option<serde_json::Value>,
    #[serde(default)]
    pub gguf: Option<GgufMeta>,
    #[serde(default)]
    pub siblings: Vec<Sibling>,
}

#[derive(Debug, Clone)]
pub struct FileInfo {
    pub name: String,
    pub size: Option<u64>,
    pub etag: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RepoDetails {
    pub detail: RepoDetail,
    pub files: Vec<FileInfo>,
    pub readme: Option<String>,
}

impl RepoDetails {
    pub fn license(&self) -> Option<String> {
        self.detail
            .card_data
            .as_ref()
            .and_then(|c| c.get("license"))
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .or_else(|| {
                self.detail
                    .tags
                    .iter()
                    .find_map(|t| t.strip_prefix("license:"))
                    .map(str::to_string)
            })
    }
}

fn get_json(url: &str) -> Result<serde_json::Value, HfError> {
    let resp = agent()
        .get(url)
        .call()
        .map_err(|e| HfError::Network(e.to_string()))?;
    if resp.status() != 200 {
        return Err(HfError::Http(resp.status().as_u16()));
    }
    let mut s = String::new();
    use std::io::Read;
    resp.into_body()
        .into_reader()
        .read_to_string(&mut s)
        .map_err(|e| HfError::Network(e.to_string()))?;
    serde_json::from_str(&s).map_err(|e| HfError::Invalid(e.to_string()))
}

/// Percent-encoding mínimo (para o parâmetro `search`).
fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 2);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Modelos públicos populares (GGUF, ordenados por downloads).
pub fn popular() -> Result<Vec<RepoSummary>, HfError> {
    let url = format!("{API_BASE}/models?filter=gguf&sort=downloads&direction=-1&limit=12");
    let v = get_json(&url)?;
    serde_json::from_value(v).map_err(|e| HfError::Invalid(e.to_string()))
}

/// Pesquisa pública com filtro GGUF.
pub fn search(query: &str) -> Result<Vec<RepoSummary>, HfError> {    let q = query.trim();
    let url = if q.is_empty() {
        format!("{API_BASE}/models?filter=gguf&limit=20")
    } else {
        let enc = urlencode(q);
        format!("{API_BASE}/models?search={enc}&filter=gguf&limit=20")
    };
    let v = get_json(&url)?;
    serde_json::from_value(v).map_err(|e| HfError::Invalid(e.to_string()))
}

/// Detalhes do repositório (metadados + arquivos com tamanho/etag).
pub fn repo_details(repo_id: &str, revision: &str) -> Result<RepoDetails, HfError> {
    let url = format!("{API_BASE}/models/{repo_id}");
    let v = get_json(&url)?;
    let detail: RepoDetail =
        serde_json::from_value(v).map_err(|e| HfError::Invalid(e.to_string()))?;

    let mut files = Vec::with_capacity(detail.siblings.len());
    for sib in &detail.siblings {
        let (size, etag) = file_meta(repo_id, revision, &sib.rfilename);
        files.push(FileInfo {
            name: sib.rfilename.clone(),
            size,
            etag,
        });
    }
    files.sort_by(|a, b| a.name.cmp(&b.name));

    let readme = fetch_readme(repo_id, revision);

    Ok(RepoDetails {
        detail,
        files,
        readme,
    })
}

/// Sonda tamanho e ETag sem baixar o arquivo (Range bytes=0-0).
pub fn file_meta(repo_id: &str, revision: &str, filename: &str) -> (Option<u64>, Option<String>) {
    let url = format!("{RESOLVE_BASE}/{repo_id}/resolve/{revision}/{filename}");
    let resp = match agent().get(&url).header("Range", "bytes=0-0").call() {
        Ok(r) => r,
        Err(_) => return (None, None),
    };
    let size = if resp.status() == 206 {
        resp.headers()
            .get("Content-Range")
            .and_then(|v| v.to_str().ok())
            .and_then(|cr| {
                cr.split('/').nth(1).and_then(|total| total.parse::<u64>().ok())
            })
            .or_else(|| {
                resp.headers()
                    .get("Content-Length")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse::<u64>().ok())
            })
    } else {
        resp.headers()
            .get("Content-Length")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok())
    };
    let etag = resp
        .headers()
        .get("ETag")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim_matches('"').to_string());
    (size, etag)
}

/// README bruto (limitado) para descrição útil no painel de detalhes.
pub fn fetch_readme(repo_id: &str, revision: &str) -> Option<String> {
    let url = format!("{RESOLVE_BASE}/{repo_id}/raw/{revision}/README.md");
    let resp = agent().get(&url).call().ok()?;
    if resp.status() != 200 {
        return None;
    }
    let mut s = String::new();
    use std::io::Read;
    resp.into_body().into_reader().read_to_string(&mut s).ok()?;
    let s = s.trim();
    if s.len() > 4000 {
        Some(format!("{}…", &s[..4000]))
    } else {
        Some(s.to_string())
    }
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct GgufFile {
    pub path: String,
    pub size: Option<u64>,
    #[serde(skip)]
    pub sha256: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct GgufVariant {
    pub name: String,
    pub projector: bool,
    pub files: Vec<GgufFile>,
    pub size: Option<u64>,
}

fn visible_model(model: &serde_json::Value) -> bool {
    model.get("private").and_then(|v| v.as_bool()) != Some(true)
        && model.get("disabled").and_then(|v| v.as_bool()) != Some(true)
}

fn gated_model(model: &serde_json::Value) -> bool {
    model.get("gated").is_some_and(|value| !value.is_null() && value.as_bool() != Some(false))
}

pub fn model_catalog(query: &str, format: &str, sort: &str) -> Result<Vec<serde_json::Value>, HfError> {
    let format = match format {
        "safetensors" => "safetensors",
        "pytorch" => "pytorch",
        _ => "gguf",
    };
    let (key, direction) = match sort {
        "downloads" => ("downloads", -1),
        "likes" => ("likes", -1),
        "createdAt" => ("createdAt", -1),
        "lastModified" => ("lastModified", -1),
        "id" => ("id", 1),
        _ => ("trendingScore", -1),
    };
    let search = urlencode(query);
    catalog_models(&format!("{API_BASE}/models?filter={format}&sort={key}&direction={direction}&search={search}&limit=50"))
}

fn catalog_models(url: &str) -> Result<Vec<serde_json::Value>, HfError> {
    let models: Vec<serde_json::Value> = serde_json::from_value(get_json(url)?)
        .map_err(|e| HfError::Invalid(e.to_string()))?;
    Ok(models.into_iter().filter(visible_model).filter_map(|model| {
        let id = model["id"].as_str()?;
        let (author, name) = id.split_once('/')?;
        Some(serde_json::json!({ "id": id, "author": author, "name": name }))
    }).take(30).collect())
}

fn encoded_path(path: &str) -> Option<String> {
    let parts: Vec<_> = path.split('/').collect();
    if parts.iter().any(|p| p.is_empty() || matches!(*p, "." | "..") || p.contains(['\\', '\0'])) {
        return None;
    }
    Some(parts.into_iter().map(urlencode).collect::<Vec<_>>().join("/"))
}

fn shard(path: &str) -> Option<(&str, usize, usize)> {
    let (stem, _) = path.rsplit_once('.')?;
    let (stem, total) = stem.rsplit_once("-of-")?;
    let (base, index) = stem.rsplit_once('-')?;
    if index.len() != 5 || total.len() != 5 { return None; }
    Some((base, index.parse().ok()?, total.parse().ok()?))
}

pub fn catalog_variants(repo: &str) -> Result<(String, Vec<GgufVariant>, bool), HfError> {
    variants_at(repo, None)
}

pub fn gguf_variants_at(repo: &str, revision: Option<&str>) -> Result<(String, Vec<GgufVariant>), HfError> {
    let (revision, variants, gated) = variants_at(repo, revision)?;
    if gated { return Err(HfError::Http(403)); }
    Ok((revision, variants))
}

fn variants_at(repo: &str, revision: Option<&str>) -> Result<(String, Vec<GgufVariant>, bool), HfError> {
    let invalid = || HfError::Invalid("Invalid model repository or metadata".into());
    if repo.split('/').count() != 2 { return Err(invalid()); }
    let repo = encoded_path(repo).ok_or_else(invalid)?;
    let endpoint = match revision {
        Some(sha) if valid_revision(sha) => format!("{API_BASE}/models/{repo}/revision/{sha}?blobs=true"),
        Some(_) => return Err(invalid()),
        None => format!("{API_BASE}/models/{repo}?blobs=true"),
    };
    let info = get_json(&endpoint)?;
    if !visible_model(&info) { return Err(invalid()); }
    let revision = info["sha"].as_str().filter(|s| s.len() == 40 && s.bytes().all(|b| b.is_ascii_hexdigit()))
        .ok_or_else(invalid)?.to_owned();
    let siblings = info["siblings"].as_array().ok_or_else(invalid)?;
    Ok((revision, group_gguf_files(siblings), gated_model(&info)))
}

fn valid_revision(sha: &str) -> bool {
    sha.len() == 40 && sha.bytes().all(|b| b.is_ascii_hexdigit())
}

pub fn catalog_readme(repo: &str, revision: &str) -> Option<String> {
    use std::io::Read;
    if repo.split('/').count() != 2 || !valid_revision(revision) { return None; }
    let repo = encoded_path(repo)?;
    let response = agent().get(&format!("{RESOLVE_BASE}/{repo}/resolve/{revision}/README.md")).call().ok()?;
    let mut text = String::new();
    response.into_body().into_reader().read_to_string(&mut text).ok()?;
    (!text.trim().is_empty()).then_some(text)
}

fn group_gguf_files(siblings: &[serde_json::Value]) -> Vec<GgufVariant> {
    let mut groups = std::collections::BTreeMap::<String, Vec<GgufFile>>::new();
    for item in siblings {
        let Some(path) = item["rfilename"].as_str() else { continue; };
        let Some((_, extension)) = path.rsplit_once('.') else { continue; };
        let format = extension.to_ascii_lowercase();
        if !matches!(format.as_str(), "gguf" | "safetensors" | "sft" | "ckpt" | "pt" | "pth" | "bin")
            || encoded_path(path).is_none() { continue; }
        let key = shard(path).map_or_else(|| path.to_owned(), |(base, _, total)| {
            format!("{base}-of-{total:05}.{extension}")
        });
        groups.entry(key).or_default().push(GgufFile {
            path: path.to_owned(),
            size: item["size"].as_u64(),
            sha256: item["lfs"]["sha256"].as_str().filter(|s| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())).map(str::to_owned),
        });
    }
    groups.into_iter().filter_map(|(name, mut files)| {
        files.sort_by(|a, b| a.path.cmp(&b.path));
        if let Some((_, _, total)) = shard(&files[0].path) {
            if files.len() != total || !files.iter().enumerate().all(|(i, f)| {
                shard(&f.path).is_some_and(|(_, index, count)| index == i + 1 && count == total)
            }) { return None; }
        }
        Some(GgufVariant {
            projector: name.rsplit('/').next()?.to_ascii_lowercase().starts_with("mmproj"),
            size: files.iter().try_fold(0u64, |sum, f| sum.checked_add(f.size?)),
            name,
            files,
        })
    }).collect()
}

pub fn download_gguf(
    repo: &str,
    revision: &str,
    variant: &GgufVariant,
    folder: &std::path::Path,
    cancel: &std::sync::atomic::AtomicBool,
    progress: &(dyn Fn(&crate::downloads::DlProgress) + Send + Sync),
) -> Result<(), crate::downloads::DownloadError> {
    download_gguf_from(RESOLVE_BASE, repo, revision, variant, folder, cancel, progress)
}

fn download_gguf_from(
    resolve_base: &str,
    repo: &str,
    revision: &str,
    variant: &GgufVariant,
    folder: &std::path::Path,
    cancel: &std::sync::atomic::AtomicBool,
    progress: &(dyn Fn(&crate::downloads::DlProgress) + Send + Sync),
) -> Result<(), crate::downloads::DownloadError> {
    let staging = tempfile::Builder::new().prefix(".omni-gguf-").tempdir_in(folder)?;
    download_gguf_staged(resolve_base, repo, revision, variant, folder, staging.path(), cancel, None, progress)
}

pub fn new_download_staging(folder: &std::path::Path) -> std::io::Result<std::path::PathBuf> {
    Ok(tempfile::Builder::new().prefix(".omni-gguf-").tempdir_in(folder)?.keep())
}

pub fn download_gguf_resumable(
    repo: &str,
    revision: &str,
    variant: &GgufVariant,
    folder: &std::path::Path,
    staging: &std::path::Path,
    cancel: &std::sync::atomic::AtomicBool,
    skip: Option<&std::sync::atomic::AtomicBool>,
    progress: &(dyn Fn(&crate::downloads::DlProgress) + Send + Sync),
) -> Result<(), crate::downloads::DownloadError> {
    download_gguf_staged(RESOLVE_BASE, repo, revision, variant, folder, staging, cancel, skip, progress)
}

fn download_gguf_staged(
    resolve_base: &str,
    repo: &str,
    revision: &str,
    variant: &GgufVariant,
    folder: &std::path::Path,
    staging: &std::path::Path,
    cancel: &std::sync::atomic::AtomicBool,
    skip: Option<&std::sync::atomic::AtomicBool>,
    progress: &(dyn Fn(&crate::downloads::DlProgress) + Send + Sync),
) -> Result<(), crate::downloads::DownloadError> {
    use std::{fs, io, sync::atomic::Ordering};
    use crate::downloads::{self, DownloadError};
    let invalid = || io::Error::new(io::ErrorKind::InvalidInput, "Invalid model file path");
    let repo = encoded_path(repo).ok_or_else(invalid)?;
    let revision = encoded_path(revision).ok_or_else(invalid)?;
    fs::create_dir_all(staging)?;
    let destinations = variant.files.iter().map(|file| {
        encoded_path(&file.path).ok_or_else(invalid)?;
        let name = file.path.rsplit('/').next().ok_or_else(invalid)?;
        let dest = folder.join(name);
        match fs::symlink_metadata(&dest) {
            Ok(_) => return Err(io::Error::new(io::ErrorKind::AlreadyExists, "Model file already exists")),
            Err(e) if e.kind() != io::ErrorKind::NotFound => return Err(e),
            _ => {}
        }
        Ok(dest)
    }).collect::<Result<Vec<_>, io::Error>>()?;
    let mut completed = 0u64;
    for (i, file) in variant.files.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) { return Err(DownloadError::Cancelled); }
        let path = encoded_path(&file.path).ok_or_else(invalid)?;
        let url = format!("{resolve_base}/{repo}/resolve/{revision}/{path}");
        let staged = staging.join(i.to_string());
        let bytes_before = completed;
        let total = variant.size;
        if !staged.is_file() { downloads::run_download_with_skip(
            &url, &staged.with_extension("part"), &staged, file.sha256.as_deref(),
            file.size, cancel, skip, &|p| progress(&downloads::DlProgress {
                bytes: bytes_before.saturating_add(p.bytes), total, ..p.clone()
            }),
        )?; }
        let size = fs::metadata(&staged)?.len();
        if file.size.is_some_and(|expected| expected != size) {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "Incomplete model file").into());
        }
        completed = completed.saturating_add(size);
    }
    if cancel.load(Ordering::Relaxed) { return Err(DownloadError::Cancelled); }
    for (i, dest) in destinations.iter().enumerate() {
        if let Err(error) = move_without_overwrite(&staging.join(i.to_string()), dest) {
            for published in &destinations[..i] { let _ = fs::remove_file(published); }
            return Err(error.into());
        }
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn move_without_overwrite(source: &std::path::Path, dest: &std::path::Path) -> std::io::Result<()> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    let source = CString::new(source.as_os_str().as_bytes())?;
    let dest = CString::new(dest.as_os_str().as_bytes())?;
    let result = unsafe {
        libc::renameat2(libc::AT_FDCWD, source.as_ptr(), libc::AT_FDCWD, dest.as_ptr(), libc::RENAME_NOREPLACE)
    };
    if result == 0 { Ok(()) } else { Err(std::io::Error::last_os_error()) }
}

#[cfg(not(target_os = "linux"))]
fn move_without_overwrite(source: &std::path::Path, dest: &std::path::Path) -> std::io::Result<()> {
    std::fs::hard_link(source, dest)
}

#[cfg(test)]
mod catalog_tests {
    use super::*;

    #[test]
    fn lists_multiple_weight_formats_and_groups_safetensors_shards() {
        let files = serde_json::json!([
            {"rfilename":"model-00001-of-00002.safetensors","size":10},
            {"rfilename":"model-00002-of-00002.safetensors","size":20},
            {"rfilename":"vae/model.safetensors","size":5},
            {"rfilename":"diffusion-Q4_0.gguf","size":15},
            {"rfilename":"weights.ckpt","size":25},
            {"rfilename":"README.md","size":1}
        ]);
        let variants = group_gguf_files(files.as_array().unwrap());
        assert_eq!(variants.len(), 4);
        let split = variants.iter().find(|v| v.files.len() == 2).unwrap();
        assert_eq!(split.size, Some(30));
        assert!(split.name.ends_with(".safetensors"));
    }

    #[test]
    fn groups_only_complete_variants_and_marks_projectors() {
        let files = serde_json::json!([
            {"rfilename":"q4/model-00002-of-00002.gguf", "size":20},
            {"rfilename":"q4/model-00001-of-00002.gguf", "size":10},
            {"rfilename":"q8/model-00001-of-00002.gguf", "size":40},
            {"rfilename":"single.gguf", "size":50},
            {"rfilename":"mmproj-model.gguf"},
            {"rfilename":"../unsafe.gguf"},
            {"rfilename":"README.md"}
        ]);
        let variants = group_gguf_files(files.as_array().unwrap());
        assert_eq!(variants.len(), 3);
        assert!(variants[0].projector);
        assert_eq!(variants[1].size, Some(30));
        assert!(variants[1].files[0].path.ends_with("00001-of-00002.gguf"));
        assert_eq!(variants[2].files.len(), 1);
    }

    #[test]
    fn ignores_models_requiring_account_or_approval() {
        assert!(!gated_model(&serde_json::json!({"gated":false})));
        assert!(visible_model(&serde_json::json!({"gated":"manual"})));
        assert!(gated_model(&serde_json::json!({"gated":"auto"})));
        assert!(!visible_model(&serde_json::json!({"private":true})));
    }

    #[test]
    fn downloads_single_and_split_variants_to_the_chosen_folder() {
        use std::io::{BufRead, BufReader, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let filenames = ["single.gguf", "split-00001-of-00002.gguf", "split-00002-of-00002.gguf", "vae.safetensors"];
        let server = std::thread::spawn(move || {
            for name in filenames {
                let (mut stream, _) = listener.accept().unwrap();
                stream.set_read_timeout(Some(std::time::Duration::from_secs(3))).unwrap();
                let mut reader = BufReader::new(&mut stream);
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                assert!(line.starts_with(&format!("GET /owner/repo/resolve/revision/{name} ")));
                loop {
                    line.clear();
                    if reader.read_line(&mut line).unwrap() == 0 || line == "\r\n" { break; }
                }
                write!(stream, "HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\nGGUF").unwrap();
            }
        });
        let files: Vec<_> = filenames.iter().map(|name| serde_json::json!({
            "rfilename": name, "size": 4,
        })).collect();
        let dir = tempfile::tempdir().unwrap();
        for variant in group_gguf_files(&files) {
            download_gguf_from(&base, "owner/repo", "revision", &variant, dir.path(), &std::sync::atomic::AtomicBool::new(false), &|_| {}).unwrap();
        }
        server.join().unwrap();
        for name in filenames {
            assert_eq!(std::fs::read(dir.path().join(name)).unwrap(), b"GGUF");
        }
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), filenames.len());
    }

    #[test]
    fn final_move_preserves_an_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let partial = dir.path().join("pending");
        let final_path = dir.path().join("model.gguf");
        std::fs::write(&partial, "new").unwrap();
        std::fs::write(&final_path, "existing").unwrap();
        let error = move_without_overwrite(&partial, &final_path).unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::AlreadyExists);
        assert_eq!(std::fs::read_to_string(&final_path).unwrap(), "existing");
        assert_eq!(std::fs::read_to_string(&partial).unwrap(), "new");
    }
}
