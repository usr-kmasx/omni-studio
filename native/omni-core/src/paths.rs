//! Caminhos baseados em XDG para dados, configuração e cache do Omni Studio.
//!
//! - Configuração: `$XDG_CONFIG_HOME/omni-studio/config.json`
//! - Dados (runtime + futuro catálogo): `$XDG_DATA_HOME/omni-studio/...`
//! - Cache: `$XDG_CACHE_HOME/omni-studio/...`

use std::path::PathBuf;

pub const APP_DIR_NAME: &str = "omni-studio";

/// Variante do runtime gerenciado (linhas de construição oficial).
pub const RUNTIME_VARIANT: &str = "linux-x64-vulkan";

/// Versão do runtime gerenciado fixada nesta etapa.
pub const RUNTIME_VERSION: &str = "b12110";

/// Commit associado à release v0.9.0 / b12110.
pub const RUNTIME_COMMIT: &str = "cd959bae99ff4bed22bef2604f45241c09bbb8c8";

/// SHA256 do artefato oficial (`llama-b12110-bin-ubuntu-vulkan-x64.tar.gz`).
pub const RUNTIME_SHA256: &str = "a5d741940956ec62e8783aee7e5a4c7c761af867d6f027c3277a51e1a3ac59b0";

/// URL oficial do artefato.
pub const RUNTIME_URL: &str =
    "https://github.com/ggml-org/llama.cpp/releases/download/b12110/llama-b12110-bin-ubuntu-vulkan-x64.tar.gz";

// ---------------------------------------------------------------------------
// Backend integrado (novo isolamento b12202) — independente do runtime legado.
// ---------------------------------------------------------------------------

/// Versão fixada do backend integrado (pré-compilado oficial b12202).
pub const BACKEND_VERSION: &str = "b12202";

/// Variante do pacote (Linux x86_64 Vulkan).
pub const BACKEND_VARIANT: &str = "linux-x64-vulkan";

/// SHA256 oficial do pacote `llama-b12202-bin-ubuntu-vulkan-x64.tar.gz`.
pub const BACKEND_SHA256: &str =
    "c1eaf8fcaf0b17c1fe9097f7ff08bad484cd451533e7f2075381d18d220694e7";

/// URL oficial do artefato (fixada, pre-release; sem `latest` dinâmico).
pub const BACKEND_URL: &str =
    "https://github.com/ggml-org/llama.cpp/releases/download/b12202/llama-b12202-bin-ubuntu-vulkan-x64.tar.gz";

/// Diretório raiz do backend integrado (`.../omni-studio/backends/llama.cpp`).
pub fn backend_root_dir() -> PathBuf {
    data_dir().join("backends").join("llama.cpp")
}

/// Diretório da versão instalada (`.../backends/llama.cpp/b12202`).
pub fn backend_version_dir() -> PathBuf {
    backend_root_dir().join(BACKEND_VERSION)
}

/// Executável moderno (`bin/llama`).
pub fn backend_bin() -> PathBuf {
    backend_version_dir().join("bin").join("llama")
}

/// Diretório de bibliotecas distribuídas pelo pacote.
pub fn backend_lib_dir() -> PathBuf {
    backend_version_dir().join("lib")
}

/// Arquivo de metadados da instalação.
pub fn backend_version_file() -> PathBuf {
    backend_version_dir().join("version.json")
}

/// Nome do arquivo do pacote no cache próprio.
pub fn backend_archive_name() -> String {
    "llama-b12202-bin-ubuntu-vulkan-x64.tar.gz".to_string()
}

pub fn config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("~/.config"))
        .join(APP_DIR_NAME)
}

/// Serializa testes que alteram as variáveis de ambiente XDG (processo único).
#[cfg(test)]
pub(crate) static ENV_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

pub fn config_file() -> PathBuf {
    config_dir().join("config.json")
}

pub fn data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("~/.local/share"))
        .join(APP_DIR_NAME)
}

/// Diretório definitivo da instalação gerenciada.
pub fn managed_runtime_dir() -> PathBuf {
    data_dir()
        .join("runtimes")
        .join(RUNTIME_VARIANT)
        .join(RUNTIME_VERSION)
}

pub fn cache_dir() -> PathBuf {
    dirs::cache_dir()
        .unwrap_or_else(|| std::env::temp_dir())
        .join(APP_DIR_NAME)
}

/// Identidade do processo integrado, usada para recuperar sobras de uma
/// sessão encerrada abruptamente sem tocar em servidores externos.
pub fn integrated_session_file() -> PathBuf {
    data_dir().join("runtime").join("integrated-server.session")
}
