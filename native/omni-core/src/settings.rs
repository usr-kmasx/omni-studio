//! Configurações persistidas do Omni Studio.
//!
//! Arquivo: `$XDG_CONFIG_HOME/omni-studio/config.json`
//! Gravação atômica: escreve em arquivo temporário no mesmo diretório e
//! renomeia por cima do destino (evita corromper o arquivo em caso de
//! encerramento inesperado).

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::paths;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum BackendKind {
    #[default]
    Managed,
    External,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManagedMeta {
    pub version: String,
    pub commit: String,
    pub variant: String,
    pub sha256: String,
    pub dir: String,
}

/// Metadados da instalação do backend integrado (b12202).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegratedMeta {
    pub version: String,
    pub variant: String,
    pub checksum: String,
    pub dir: String,
}

impl Default for IntegratedMeta {
    fn default() -> Self {
        Self {
            version: crate::paths::BACKEND_VERSION.to_string(),
            variant: crate::paths::BACKEND_VARIANT.to_string(),
            checksum: crate::paths::BACKEND_SHA256.to_string(),
            dir: crate::paths::backend_version_dir().display().to_string(),
        }
    }
}

/// Parâmetros de inicialização do backend integrado (`llama serve`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegratedParams {
    /// `-m` — caminho do modelo GGUF (segue o modelo selecionado).
    pub model: Option<String>,
    /// `-mm` — projetor multimodal opcional.
    pub mmproj: Option<String>,
    /// `-ngl` — camadas na GPU (auto|all|<n>).
    pub ngl: String,
    /// `-ctk`.
    pub cache_type_k: String,
    /// `-ctv`.
    pub cache_type_v: String,
    /// `-c` — contexto.
    pub ctx_size: u32,
    /// `-t` — threads CPU (None = padrão interno).
    pub threads: Option<u32>,
    /// `-tb` — threads de batch.
    pub threads_batch: Option<u32>,
    /// `-b` — batch lógico.
    pub batch_size: Option<u32>,
    /// `-ub` — ubatch físico.
    pub ubatch_size: Option<u32>,
    /// `-np` — slots paralelos (None = auto).
    pub slots: Option<u32>,
    /// `-fa` — flash attention on|off|auto.
    pub flash_attn: String,
    /// `--reasoning` — on|off|auto.
    pub reasoning: String,
    /// `--host` (padrão 127.0.0.1).
    pub host: String,
    /// Porta configurada (None = porta livre dinâmica).
    pub port: Option<u16>,
    /// `--cors-origins` (origem local do site).
    pub cors_origins: String,
    /// `--no-webui`.
    pub no_webui: bool,
}

impl Default for IntegratedParams {
    fn default() -> Self {
        Self {
            model: None,
            mmproj: None,
            ngl: "all".into(),
            cache_type_k: "q4_0".into(),
            cache_type_v: "q4_0".into(),
            ctx_size: 32768,
            threads: None,
            threads_batch: None,
            batch_size: None,
            ubatch_size: None,
            slots: None,
            flash_attn: "auto".into(),
            reasoning: "off".into(),
            host: "127.0.0.1".into(),
            port: None,
            cors_origins: String::new(),
            no_webui: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Settings {
    /// Backend selecionado.
    pub backend_kind: BackendKind,
    /// Caminho manual do executável externo (quando informado pelo usuário).
    pub external_path: Option<String>,
    /// URL de um servidor externo já em execução (para detecção/probe).
    pub external_url: Option<String>,
    /// Metadados da instalação gerenciada (presentes somente quando instalada).
    pub managed: Option<ManagedMeta>,
    /// Pasta de modelos (override XDG) — vazio = padrão XDG.
    pub models_dir: Option<String>,
    #[serde(default)]
    pub hf_download_dir: Option<String>,
    /// Limite de tokens por resposta (interface).
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    /// Caminho do modelo GGUF selecionado.
    pub model_gguf: Option<String>,
    /// Caminho do projetor multimodal (`mmproj`), quando aplicável.
    pub model_mmproj: Option<String>,
    /// Backend integrado habilitado (switch).
    #[serde(default)]
    pub integrated_enabled: bool,
    /// Parada manual do servidor integrado (impede reinício automático).
    #[serde(default)]
    pub manual_stop: bool,
    /// Metadados da instalação do backend integrado (quando instalado).
    #[serde(default)]
    pub integrated: Option<IntegratedMeta>,
    /// Parâmetros de inicialização do backend integrado.
    #[serde(default)]
    pub integrated_params: IntegratedParams,
}

impl Default for ManagedMeta {
    fn default() -> Self {
        Self {
            version: paths::RUNTIME_VERSION.to_string(),
            commit: paths::RUNTIME_COMMIT.to_string(),
            variant: paths::RUNTIME_VARIANT.to_string(),
            sha256: paths::RUNTIME_SHA256.to_string(),
            dir: paths::managed_runtime_dir().display().to_string(),
        }
    }
}

impl Settings {
    pub fn load() -> Self {
        let file = paths::config_file();
        match std::fs::read_to_string(&file) {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or_default(),
            Err(_) => Self::default(),
        }
    }

    /// Salva de forma atômica.
    pub fn save(&self) -> std::io::Result<()> {
        let path = paths::config_file();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(self).map_err(std::io::Error::other)?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, json)?;
        std::fs::rename(&tmp, &path)
    }

    /// Aplica uma mutação e salva.
    pub fn update<F>(&mut self, f: F) -> std::io::Result<()>
    where
        F: FnOnce(&mut Self),
    {
        f(self);
        self.save()
    }
}

fn default_max_tokens() -> u32 {
    2048
}

/// `~` e variáveis de ambiente em caminhos digitados (uso em testes/UIs).
pub fn expand_path(raw: &str) -> PathBuf {
    let s = if let Some(rest) = raw.strip_prefix("~/") {
        dirs::home_dir()
            .map(|h| h.join(rest).display().to_string())
            .unwrap_or_else(|| raw.to_string())
    } else {
        raw.to_string()
    };
    PathBuf::from(s)
}

pub fn path_exists(p: &Path) -> bool {
    p.is_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn salva_e_recarrega_atomicamente() {
        let _g = crate::paths::ENV_TEST_LOCK.lock().unwrap();
        let base = std::env::temp_dir().join("omni_settings_test");
        let _ = std::fs::remove_dir_all(&base);
        std::env::set_var("XDG_CONFIG_HOME", base.join("config"));

        let mut s = Settings::load();
        s.backend_kind = BackendKind::External;
        s.external_path = Some("/usr/bin/llama-server".into());
        s.managed = Some(ManagedMeta::default());
        s.save().unwrap();

        let s2 = Settings::load();
        assert_eq!(s2.backend_kind, BackendKind::External);
        assert_eq!(s2.external_path.as_deref(), Some("/usr/bin/llama-server"));
        assert!(s2.managed.is_some());
        assert!(paths::config_file().exists());
    }

    #[test]
    fn json_antigo_com_response_lang_carrega_sem_erro() {
        let _g = crate::paths::ENV_TEST_LOCK.lock().unwrap();
        let base = std::env::temp_dir().join("omni_settings_legacy_test");
        let _ = std::fs::remove_dir_all(&base);
        std::env::set_var("XDG_CONFIG_HOME", base.join("config"));

        // JSON legado (antes da remoção do idioma de resposta): contém o
        // campo `response_lang`, que deve ser ignorado sem erro, preservando
        // os demais campos.
        let legacy = r#"{
            "backend_kind": "External",
            "external_url": "http://127.0.0.1:8080",
            "response_lang": "pt",
            "max_tokens": 4096,
            "model_gguf": "/tmp/modelo.gguf"
        }"#;
        let cfg_dir = paths::config_file().parent().unwrap().to_path_buf();
        std::fs::create_dir_all(&cfg_dir).unwrap();
        std::fs::write(paths::config_file(), legacy).unwrap();

        let s = Settings::load();
        assert_eq!(s.backend_kind, BackendKind::External);
        assert_eq!(s.external_url.as_deref(), Some("http://127.0.0.1:8080"));
        assert_eq!(s.max_tokens, 4096);
        assert_eq!(s.model_gguf.as_deref(), Some("/tmp/modelo.gguf"));
        // Campo removido: nem existe mais nem provoca erro.
        assert!(!serde_json::to_string(&s).unwrap().contains("response_lang"));
    }

    #[test]
    fn expande_til() {
        let p = expand_path("~/algum/caminho");
        assert!(p.is_absolute());
    }
}
