//! Omni Studio — núcleo independente de interface.
//!
//! Contém a lógica de aplicação que NÃO depende da camada gráfica:
//! configurações persistentes (XDG), gerenciamento do motor llama.cpp
//! (instalação gerenciada sob demanda, detecção externa, processo e
//! cliente HTTP mínimo). As próximas etapas adicionarão o cliente
//! SSE/WebSocket completo, camadas de áudio/mídia e o catálogo de modelos.

pub mod archive;
pub mod client;
pub mod compatibility;
pub mod downloads;
pub mod engine;
pub mod guards;
pub mod huggingface;
pub mod model_manager;
pub mod paths;
pub mod process;
pub mod prompts;
pub mod settings;

/// Nome do produto, exibido na interface.
pub const APP_NAME: &str = "Omni Studio";
