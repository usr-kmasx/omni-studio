//! Catálogo local de modelos baixados pelo Omni Studio.
//!
//! Persistência separada da configuração do runtime:
//! `$XDG_CONFIG_HOME/omni-studio/catalog.json`
//! Modelos ficam em `$XDG_DATA_HOME/omni-studio/models/<repo>/...`

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::compatibility::{classify_file, quant_label, FileKind};
use crate::paths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalFileRecord {
    pub name: String,
    pub size: u64,
    /// Caminho absoluto dentro do diretório gerenciado.
    pub path: String,
    pub kind: FileKind,
    #[serde(default)]
    pub quant: Option<String>,
    /// `true` somente quando um SHA256 oficial foi conferido.
    #[serde(default)]
    pub verified: bool,
    pub downloaded_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledModel {
    pub repo_id: String,
    pub revision: String,
    #[serde(default)]
    pub license: Option<String>,
    pub files: Vec<LocalFileRecord>,
    #[serde(default)]
    pub total_size: u64,
}

pub fn catalog_file() -> PathBuf {
    paths::config_dir().join("catalog.json")
}

pub fn models_root() -> PathBuf {
    if let Some(dir) = crate::settings::Settings::load().models_dir {
        let p = PathBuf::from(dir);
        if !p.as_os_str().is_empty() {
            return p;
        }
    }
    paths::data_dir().join("models")
}

pub fn load_catalog() -> Vec<InstalledModel> {
    match fs::read_to_string(catalog_file()) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn save_catalog(catalog: &[InstalledModel]) -> std::io::Result<()> {
    let path = catalog_file();
    if let Some(p) = path.parent() {
        fs::create_dir_all(p)?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(catalog).map_err(std::io::Error::other)?)?;
    fs::rename(&tmp, &path)
}

/// Registra um arquivo baixado no catálogo (cria/atualiza o modelo).
pub fn register_download(
    repo_id: &str,
    revision: &str,
    license: Option<&str>,
    file_path: &Path,
    file_size: u64,
    verified: bool,
) -> std::io::Result<()> {
    let mut catalog = load_catalog();
    let name = file_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let kind = classify_file(&name);
    let quant = quant_label(&name);
    let record = LocalFileRecord {
        name,
        size: file_size,
        path: file_path.display().to_string(),
        kind,
        quant,
        verified,
        downloaded_at: chrono_like_now(),
    };

    if let Some(model) = catalog.iter_mut().find(|m| m.repo_id == repo_id) {
        model.revision = revision.to_string();
        if license.is_some() {
            model.license = license.map(str::to_string);
        }
        model.files.retain(|f| f.name != record.name);
        model.files.push(record.clone());
        model.total_size = model.files.iter().map(|f| f.size).sum();
    } else {
        let model = InstalledModel {
            repo_id: repo_id.to_string(),
            revision: revision.to_string(),
            license: license.map(str::to_string),
            files: vec![record.clone()],
            total_size: record.size,
        };
        catalog.push(model);
    }
    save_catalog(&catalog)
}

pub fn installed_models() -> Vec<InstalledModel> {
    load_catalog()
}

/// Remove um modelo registrado — apenas os arquivos registrados e desde que
/// todos estejam dentro do diretório gerenciado.
pub fn remove_model(repo_id: &str) -> std::io::Result<()> {
    let mut catalog = load_catalog();
    let Some(idx) = catalog.iter().position(|m| m.repo_id == repo_id) else {
        return Ok(());
    };
    let model = catalog.remove(idx);
    let root_canon = models_root().canonicalize().unwrap_or_else(|_| models_root());
    for f in &model.files {
        let p = PathBuf::from(&f.path);
        let ok = p
            .canonicalize()
            .map(|c| c.starts_with(&root_canon))
            .unwrap_or(false);
        if !ok {
            return Err(std::io::Error::other(format!(
                "recusa remover arquivo fora do diretório gerenciado: {}",
                f.path
            )));
        }
        let _ = fs::remove_file(&p);
    }
    // Remove o diretório do modelo se ficar vazio.
    if let Some(parent) = model
        .files
        .first()
        .map(|f| PathBuf::from(&f.path).parent().map(|p| p.to_path_buf()))
        .flatten()
    {
        if parent.starts_with(&root_canon) {
            let _ = fs::remove_dir_all(&parent);
        }
    }
    save_catalog(&catalog)
}

fn chrono_like_now() -> String {
    // Sem dependência de chrono: usa UNIX timestamp (legível o suficiente).
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registro_e_remocao_gerenciada() {
        let _g = crate::paths::ENV_TEST_LOCK.lock().unwrap();
        let base = std::env::temp_dir().join("omni_catalog_test");
        let _ = fs::remove_dir_all(&base);
        std::env::set_var("XDG_CONFIG_HOME", base.join("config"));
        std::env::set_var("XDG_DATA_HOME", base.join("data"));

        let root = models_root().join("LiquidAI/LFM3-Omni-2B-GGUF");
        fs::create_dir_all(&root).unwrap();
        let file = root.join("LFM3-Omni-2B-Q4_K_M.gguf");
        fs::write(&file, b"dados-fake").unwrap();

        register_download(
            "LiquidAI/LFM3-Omni-2B-GGUF",
            "main",
            Some("other"),
            &file,
            10,
            false,
        )
        .unwrap();
        let models = installed_models();
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].files.len(), 1);
        assert_eq!(models[0].files[0].kind, FileKind::Main);
        assert_eq!(models[0].files[0].quant.as_deref(), Some("Q4_K_M"));

        remove_model("LiquidAI/LFM3-Omni-2B-GGUF").unwrap();
        assert!(installed_models().is_empty());
        assert!(!file.exists());
    }

    #[test]
    fn recusa_remocao_fora_do_gerenciado() {
        let _g = crate::paths::ENV_TEST_LOCK.lock().unwrap();
        let base = std::env::temp_dir().join("omni_catalog_test2");
        let _ = fs::remove_dir_all(&base);
        std::env::set_var("XDG_CONFIG_HOME", base.join("config"));
        std::env::set_var("XDG_DATA_HOME", base.join("data"));

        let outside = std::env::temp_dir().join("omni_catalog_outside");
        fs::write(&outside, b"x").unwrap();
        register_download("repo/fake", "main", None, &outside, 1, false).unwrap();
        let res = remove_model("repo/fake");
        assert!(res.is_err(), "deve recusar caminho fora do root");
        assert!(outside.exists());
        let _ = fs::remove_file(&outside);
    }
}
