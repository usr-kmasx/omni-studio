//! Gerenciador de backends: servidor externo (prioridade) + llama.cpp
//! integrado isolado (fallback). Processos gerenciados ficam aqui.
//!
//! O campo canônico `kind` descreve exclusivamente o backend
//! efetivamente selecionado para atender o chat naquele momento:
//!   - "external":    servidor externo validado;
//!   - "integrated":  servidor integrado iniciado, saudável;
//!   - "none":        nenhum backend disponível.

use crate::bundle::{self, Bundle};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use omni_core::client;
use omni_core::engine;
use omni_core::paths;
use omni_core::process::{self, pick_free_port, ProcessIdentity, RunningServer};
use omni_core::settings::{IntegratedMeta, Settings};

pub const DEFAULT_EXTERNAL_URL: &str = "http://127.0.0.1:8080";

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum BackendKind {
    External,
    Integrated,
    None_,
}

impl BackendKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            BackendKind::External => "external",
            BackendKind::Integrated => "integrated",
            BackendKind::None_ => "none",
        }
    }
}

#[derive(Debug)]
pub enum BackendError {
    ExternalUnavailable,
    IntegratedNotInstalled,
    IntegratedDisabled,
    NoModelSelected,
    ExternalBackendActive,
    AlreadyRunning,
    OperationInProgress,
    Start(String),
    Process(String),
}

impl BackendError {
    pub fn code(&self) -> &'static str {
        match self {
            BackendError::ExternalUnavailable => "external_unavailable",
            BackendError::IntegratedNotInstalled => "not_installed",
            BackendError::IntegratedDisabled => "backend_disabled",
            BackendError::NoModelSelected => "no_model_selected",
            BackendError::ExternalBackendActive => "external_backend_active",
            BackendError::AlreadyRunning => "already_running",
            BackendError::OperationInProgress => "operation_in_progress",
            BackendError::Start(_) => "spawn_failed",
            BackendError::Process(_) => "internal_error",
        }
    }
}

impl std::fmt::Display for BackendError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BackendError::ExternalUnavailable => write!(f, "servidor externo indisponível"),
            BackendError::IntegratedNotInstalled => write!(f, "O backend integrado não está instalado."),
            BackendError::IntegratedDisabled => write!(f, "O backend integrado está desabilitado."),
            BackendError::NoModelSelected => write!(f, "Nenhum modelo selecionado."),
            BackendError::ExternalBackendActive => {
                write!(f, "Servidor externo válido em uso; o integrado não foi iniciado.")
            }
            BackendError::AlreadyRunning => write!(f, "O servidor integrado já está em execução."),
            BackendError::OperationInProgress => write!(f, "Outra operação está em andamento."),
            BackendError::Start(e) => write!(f, "Falha ao iniciar o backend integrado: {e}"),
            BackendError::Process(e) => write!(f, "Erro de processo: {e}"),
        }
    }
}

/// Decisão pura de `kind` (invariantes):
/// - externo válido ⇒ External (independente do integrado);
/// - senão, integrado **rodando** ⇒ Integrated;
/// - senão ⇒ None (nunca "integrated" apenas por estar instalado/habilitado).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KindDecision {
    External,
    Integrated,
    None_,
}

/// Bloco canônico `kind`/`activeUrl`/`activeBackend` (puro, testável).
pub(crate) fn selection_json(kind: &BackendKind, active_url: &Option<String>) -> serde_json::Value {
    let k = kind.as_str();
    serde_json::json!({
        "kind": k,
        "activeUrl": active_url,
        "state": { "activeBackend": k },
    })
}

pub fn compute_kind(external_online: bool, integrated_running: bool) -> KindDecision {
    if external_online {
        KindDecision::External
    } else if integrated_running {
        KindDecision::Integrated
    } else {
        KindDecision::None_
    }
}

struct Inner {
    active_url: Option<String>,
    process: Option<RunningServer>,
    revision: u64,
    start_error: Option<String>,
    op: &'static str, // stopped | starting | running | stopping | error
}

pub struct BackendManager {
    inner: Mutex<Inner>,
    cors_origin: String,
    bundle: Option<Bundle>,
    shutdown_requested: AtomicBool,
}

impl BackendManager {
    pub fn with_bundle(cors_origin: &str, bundle: Option<Bundle>) -> Self {
        if let Some(pack) = &bundle {
            if let Err(error) = pack.seed_new_profile() {
                log::warn!("Bundled model defaults: {error}");
            }
        }
        Self::recover_previous_server();
        Self {
            inner: Mutex::new(Inner {
                active_url: None,
                process: None,
                revision: 0,
                op: "stopped",
                start_error: None,
            }),
            cors_origin: cors_origin.to_string(),
            bundle,
            shutdown_requested: AtomicBool::new(false),
        }
    }

    fn recover_previous_server() {
        let marker = paths::integrated_session_file();
        let executable = paths::backend_bin();
        match std::fs::read_to_string(&marker) {
            Ok(raw) => {
                let mut lines = raw.lines();
                let identity = lines
                    .next().and_then(|v| v.parse::<u32>().ok())
                    .zip(lines.next().and_then(|v| v.parse::<u64>().ok()))
                    .zip(lines.next().map(PathBuf::from))
                    .map(|((pid, start_time), executable)| ProcessIdentity { pid, start_time, executable });
                if let Some(identity) = identity {
                    match process::stop_process_if_matches(&identity, &executable) {
                        Ok(true) => log::warn!("servidor integrado órfão encerrado (PID {}).", identity.pid),
                        Ok(false) => log::info!("registro de sessão antigo ignorado; processo não corresponde mais."),
                        Err(e) => log::warn!("não foi possível recuperar a sessão anterior do servidor: {e}"),
                    }
                } else {
                    log::warn!("registro de sessão do servidor inválido; verificando processos integrados antigos.");
                    Self::recover_legacy_server(&executable);
                }
                let _ = std::fs::remove_file(&marker);
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                // Compatibilidade com versões anteriores, que não gravavam PID.
                Self::recover_legacy_server(&executable);
            }
            Err(e) => log::warn!("não foi possível ler o registro de sessão do servidor: {e}"),
        }
    }

    fn recover_legacy_server(executable: &Path) {
        let settings = Settings::load();
        let model = settings.model_gguf.or(settings.integrated_params.model);
        let Some(model) = model else { return; };
        match process::find_managed_server_processes(executable, Path::new(&model)) {
            Ok(processes) => {
                for identity in processes {
                    match process::stop_process_if_matches(&identity, executable) {
                        Ok(true) => log::warn!("servidor integrado órfão de versão anterior encerrado (PID {}).", identity.pid),
                        Ok(false) => log::info!("processo candidato mudou antes da recuperação; ignorado."),
                        Err(e) => log::warn!("falha ao encerrar processo integrado antigo (PID {}): {e}", identity.pid),
                    }
                }
            }
            Err(e) => log::warn!("falha ao procurar processo integrado antigo: {e}"),
        }
    }

    fn write_session_marker(server: &RunningServer) -> Result<(), String> {
        let path = paths::integrated_session_file();
        let executable = paths::backend_bin()
            .canonicalize()
            .map_err(|e| format!("não foi possível resolver o executável: {e}"))?;
        let identity = process::inspect_process(server.pid)
            .map_err(|e| format!("não foi possível identificar o processo: {e}"))?;
        if identity.executable.canonicalize().ok().as_ref() != Some(&executable) {
            return Err("o executável do processo iniciado não corresponde ao backend integrado".into());
        }
        let parent = path.parent().ok_or("diretório de sessão inválido")?;
        std::fs::create_dir_all(parent).map_err(|e| format!("falha ao criar diretório de sessão: {e}"))?;
        let temporary = path.with_extension("session.tmp");
        let contents = format!("{}\n{}\n{}\n", identity.pid, identity.start_time, executable.display());
        std::fs::write(&temporary, contents).map_err(|e| format!("falha ao salvar sessão do servidor: {e}"))?;
        std::fs::rename(&temporary, &path).map_err(|e| format!("falha ao ativar sessão do servidor: {e}"))
    }

    fn remove_session_marker() {
        if let Err(e) = std::fs::remove_file(paths::integrated_session_file()) {
            if e.kind() != std::io::ErrorKind::NotFound {
                log::warn!("não foi possível remover o registro de sessão do servidor: {e}");
            }
        }
    }

    /// Fecha o backend pertencente ao app sem alterar a preferência de início automático.
    pub fn shutdown(&self) {
        self.shutdown_requested.store(true, Ordering::SeqCst);
        self.stop_integrated();
    }

    fn external_online(url: &str) -> bool {
        // Timeouts curtos: decisões de backend nunca devem travar a UI.
        client::health_timeout(url, std::time::Duration::from_secs(2))
            && client::first_model_id_timeout(url, std::time::Duration::from_secs(2)).is_some()
    }

    /// URL externa a verificar: parâmetro explícito (do JS) > Settings > padrão.
    fn external_candidate(explicit: Option<String>) -> String {
        explicit
            .or_else(|| {
                let path = paths::config_dir().join("ui-settings.json");
                crate::ui_settings::read(&path).ok()
                    .and_then(|settings| settings["serverUrl"].as_str().map(str::to_owned))
            })
            .or_else(|| Settings::load().external_url)
            .filter(|u| !u.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_EXTERNAL_URL.to_string())
    }

    fn bump_revision(&self) -> u64 {
        let mut i = self.inner.lock().unwrap();
        i.revision += 1;
        i.revision
    }

    /// Estado real do processo a partir de um lock já adquirido.
    fn process_state(inner: &Inner) -> &'static str {
        if inner.op != "stopped" {
            inner.op
        } else if inner.process.is_some() {
            "running"
        } else {
            "stopped"
        }
    }

    /// `(kind, activeUrl)` derivados de uma única decisão de resolução
    /// (nunca calculados separadamente).
    pub(crate) fn current_selection(&self) -> (BackendKind, Option<String>) {
        let external = Self::external_candidate(None);
        let external_online = Self::external_online(&external);
        let integrated_running = self.inner.lock().unwrap().process.is_some();
        match compute_kind(external_online, integrated_running) {
            KindDecision::External => (BackendKind::External, Some(external)),
            KindDecision::Integrated => {
                let i = self.inner.lock().unwrap();
                (BackendKind::Integrated, i.active_url.clone())
            }
            KindDecision::None_ => (BackendKind::None_, None),
        }
    }

    /// Resolve o backend ativo seguindo a prioridade aprovada, respeitando
    /// a parada manual (nunca reinicia automaticamente após `Parar`).
    pub fn resolve(
        &self,
        external_explicit: Option<String>,
        on_starting: impl FnOnce(),
    ) -> Result<(String, BackendKind), BackendError> {
        let external = Self::external_candidate(external_explicit);
        if Self::external_online(&external) {
            return Ok((external, BackendKind::External));
        }

        let settings = Settings::load();
        if !settings.integrated_enabled {
            return Err(BackendError::IntegratedDisabled);
        }
        if settings.manual_stop {
            return Err(BackendError::ExternalUnavailable);
        }
        if settings.model_gguf.is_none() && settings.integrated_params.model.is_none() {
            return Err(BackendError::NoModelSelected);
        }
        if self.bundle.is_none() && !engine::is_backend_installed() {
            return Err(BackendError::IntegratedNotInstalled);
        }
        {
            let mut inner = self.inner.lock().unwrap();
            if matches!(inner.op, "starting" | "stopping") {
                return Err(BackendError::OperationInProgress);
            }
            if let Some(url) = inner.active_url.as_ref().filter(|_| inner.process.is_some()) {
                return Ok((url.clone(), BackendKind::Integrated));
            }
            // A parada manual pode ter sido gravada enquanto a sondagem externa rodava.
            if Settings::load().manual_stop {
                return Err(BackendError::ExternalUnavailable);
            }
            inner.op = "starting";
            inner.revision += 1;
        }
        on_starting();
        let result = self.start_integrated();
        if let Err(error) = &result {
            if !self.shutdown_requested.load(Ordering::SeqCst) {
                let _ = Settings::load().update(|s| s.manual_stop = true);
                let mut inner = self.inner.lock().unwrap();
                inner.op = "error";
                inner.start_error = Some(error.to_string());
            }
        }
        self.bump_revision();
        result
    }

    /// Inicia (ou reutiliza) o processo integrado `llama serve`.
    pub fn start_integrated(&self) -> Result<(String, BackendKind), BackendError> {
        if self.shutdown_requested.load(Ordering::SeqCst) {
            return Err(BackendError::Process("o aplicativo está encerrando".into()));
        }
        {
            let inner = self.inner.lock().unwrap();
            if let Some(url) = &inner.active_url {
                if inner.process.is_some() {
                    return Ok((url.clone(), BackendKind::Integrated));
                }
            }
        }

        let settings = Settings::load();
        let model = settings
            .model_gguf
            .or_else(|| settings.integrated_params.model.clone())
            .ok_or(BackendError::NoModelSelected)?;
        let mmproj = settings
            .model_mmproj
            .clone()
            .or_else(|| settings.integrated_params.mmproj.clone());
        let bundled_projector = mmproj.as_ref().is_some_and(|reference| reference == &Bundle::projector_ref());
        let model = bundle::model_path(self.bundle.as_ref(), &model, true)
            .map_err(BackendError::Start)?;
        let mmproj = mmproj.as_deref()
            .map(|reference| bundle::model_path(self.bundle.as_ref(), reference, true))
            .transpose()
            .map_err(BackendError::Start)?;
        if !engine::is_backend_installed() {
            if self.bundle.is_none() {
                return Err(BackendError::IntegratedNotInstalled);
            }
            self.install_integrated(&AtomicBool::new(false), &|_| {})?;
        }
        let port = match settings.integrated_params.port {
            Some(p) => p,
            None => pick_free_port().map_err(|e| BackendError::Process(e.to_string()))?,
        };

        let mut args = engine::backend_serve_args(
            &model,
            mmproj.as_deref(),
            port,
            &settings.integrated_params,
            &self.cors_origin,
        );

        if bundled_projector && settings.integrated_params.ngl == "0" {
            args.push("--no-mmproj-offload".into());
        }

        let lib_env = paths::backend_lib_dir().display().to_string();
        let server = RunningServer::start_with_env(
            &paths::backend_bin(),
            &args,
            true,
            &[("LD_LIBRARY_PATH", &lib_env)],
        )
        .map_err(|e| BackendError::Start(format!("{e}")))?;

        if let Err(e) = Self::write_session_marker(&server) {
            let mut server = server;
            server.stop();
            return Err(BackendError::Process(e));
        }

        let endpoint = server.endpoint.clone();
        let mut inner = self.inner.lock().unwrap();
        if self.shutdown_requested.load(Ordering::SeqCst) {
            let mut server = server;
            server.stop();
            Self::remove_session_marker();
            inner.op = "stopped";
            return Err(BackendError::Process("o aplicativo está encerrando".into()));
        }
        if let Some(mut prev) = inner.process.take() {
            prev.stop();
        }
        inner.process = Some(server);
        inner.active_url = Some(endpoint.clone());
        inner.op = "running";
        inner.start_error = None;
        Ok((endpoint, BackendKind::Integrated))
    }

    /// Encerra somente o processo filho gerenciado.
    pub fn stop_integrated(&self) {
        let mut inner = self.inner.lock().unwrap();
        if let Some(mut p) = inner.process.take() {
            p.stop();
        }
        Self::remove_session_marker();
        inner.active_url = None;
        inner.op = "stopped";
        inner.start_error = None;
    }

    /// Persiste a ativação do backend. Desabilitar também encerra apenas
    /// o processo filho gerenciado; falhas de gravação não alteram o processo.
    pub fn set_integrated_enabled(&self, enabled: bool) -> Result<(), BackendError> {
        Settings::load()
            .update(|s| s.integrated_enabled = enabled)
            .map_err(|e| BackendError::Process(format!("falha ao salvar ativação: {e}")))?;

        if !enabled {
            self.stop_integrated();
        }
        self.bump_revision();
        Ok(())
    }

    /// Operação `Parar servidor`: persiste `manualStop`, encerra o filho,
    /// recalculap `kind`/`activeUrl`.
    pub fn stop_integrated_manual(&self) -> Result<(BackendKind, Option<String>), BackendError> {
        {
            let mut inner = self.inner.lock().unwrap();
            if inner.op == "starting" || inner.op == "stopping" {
                return Err(BackendError::OperationInProgress);
            }
            inner.op = "stopping";
        }
        let _ = Settings::load().update(|s| s.manual_stop = true);
        self.stop_integrated();
        self.bump_revision();
        Ok(self.current_selection())
    }

    /// Operação `Iniciar servidor`: valida, limpa `manualStop` e inicia.
    pub fn start_integrated_manual(&self, activate: bool, external_url: Option<String>) -> Result<(BackendKind, Option<String>), BackendError> {
        {
            let mut inner = self.inner.lock().unwrap();
            if inner.op == "starting" || inner.op == "stopping" {
                return Err(BackendError::OperationInProgress);
            }
            if inner.process.is_some() {
                return Err(BackendError::AlreadyRunning);
            }
            inner.op = "starting";
            inner.revision += 1;
        }

        let settings = Settings::load();
        if !settings.integrated_enabled && !activate {
            self.inner.lock().unwrap().op = "stopped";
            return Err(BackendError::IntegratedDisabled);
        }
        if self.bundle.is_none() && !engine::is_backend_installed() {
            self.inner.lock().unwrap().op = "stopped";
            return Err(BackendError::IntegratedNotInstalled);
        }

        // Prioridade externa: não inicia o integrado se o externo estiver válido.
        let external = Self::external_candidate(external_url);
        if Self::external_online(&external) {
            self.inner.lock().unwrap().op = "stopped";
            return Err(BackendError::ExternalBackendActive);
        }

        if activate && !settings.model_gguf.as_ref().or(settings.integrated_params.model.as_ref())
            .is_some_and(|path| path == &Bundle::model_ref() || Path::new(path).is_file())
        {
            self.inner.lock().unwrap().op = "stopped";
            return Err(BackendError::NoModelSelected);
        }

        if let Err(error) = Settings::load().update(|s| {
            if activate { s.integrated_enabled = true; }
            s.manual_stop = false;
        }) {
            self.inner.lock().unwrap().op = "stopped";
            return Err(BackendError::Process(error.to_string()));
        }

        match self.start_integrated() {
            Ok((url, kind)) => {
                self.bump_revision();
                Ok((kind, Some(url)))
            }
            Err(e) => {
                if self.shutdown_requested.load(Ordering::SeqCst) {
                    self.inner.lock().unwrap().op = "stopped";
                } else {
                    // Falha: restaura condição persistente anti-reinício automático.
                    let _ = Settings::load().update(|s| s.manual_stop = true);
                    self.inner.lock().unwrap().op = "error";
                }
                Err(e)
            }
        }
    }

    /// Persiste os parâmetros juntos e reinicia somente um processo integrado ativo.
    pub fn save_integrated_params(
        &self,
        apply: impl FnOnce(&mut Settings),
    ) -> Result<Option<Result<(), BackendError>>, BackendError> {
        {
            let mut inner = self.inner.lock().unwrap();
            if matches!(inner.op, "starting" | "stopping") {
                return Err(BackendError::OperationInProgress);
            }
            let mut settings = Settings::load();
            settings.update(apply)
                .map_err(|e| BackendError::Process(e.to_string()))?;
            inner.revision += 1;
            let Some(mut process) = inner.process.take() else { return Ok(None); };
            inner.op = "starting";
            inner.active_url = None;
            process.stop();
            Self::remove_session_marker();
            if settings.model_gguf.is_none() && settings.integrated_params.model.is_none() {
                inner.op = "stopped";
                return Ok(None);
            }
        }

        if Self::external_online(&Self::external_candidate(None)) {
            self.inner.lock().unwrap().op = "stopped";
            return Ok(None);
        }
        let restart = self.start_integrated().map(|_| ());
        if restart.is_err() {
            let _ = Settings::load().update(|s| s.manual_stop = true);
            self.inner.lock().unwrap().op = "error";
        }
        self.bump_revision();
        Ok(Some(restart))
    }

    /// Remove somente a instalação isolada (exige processo parado).
    pub fn delete_integrated(&self) -> Result<(), BackendError> {
        self.stop_integrated();
        engine::uninstall_backend_managed().map_err(|e| BackendError::Process(e.to_string()))?;
        Settings::load()
            .update(|s| s.integrated = None)
            .map_err(|e| BackendError::Process(format!("falha ao limpar versão instalada: {e}")))
    }

    pub fn install_integrated(
        &self,
        cancel: &std::sync::atomic::AtomicBool,
        progress: &engine::ProgressFn,
    ) -> Result<omni_core::settings::IntegratedMeta, BackendError> {
        let archive = self.bundle.as_ref().map(Bundle::runtime);
        let meta = engine::install_backend_from(archive.as_deref(), cancel, progress)
            .map_err(|e| BackendError::Process(match &archive {
                Some(path) => format!("{}: {e}", path.file_name().unwrap_or_default().to_string_lossy()),
                None => e.to_string(),
            }))?;
        Settings::load()
            .update(|s| s.integrated = Some(meta.clone()))
            .map_err(|e| BackendError::Process(format!("falha ao salvar versão instalada: {e}")))?;
        Ok(meta)
    }

    fn model_exists(&self, reference: &str) -> bool {
        bundle::model_path(self.bundle.as_ref(), reference, false).is_ok_and(|path| path.is_file())
    }

    /// Snapshot oficial publicado no WebView (fonte única de verdade).
    pub fn snapshot(&self) -> serde_json::Value {
        let mut settings = Settings::load();
        let external = Self::external_candidate(None);
        // Fazer a verificação externa apenas uma vez por snapshot. Antes,
        // current_selection() e este método repetiam a mesma sondagem de rede.
        let external_online = Self::external_online(&external);
        let (revision, process_state, integrated_running, integrated_url, start_error) = {
            let inner = self.inner.lock().unwrap();
            (
                inner.revision,
                Self::process_state(&inner),
                inner.process.is_some(),
                inner.active_url.clone(),
                inner.start_error.clone(),
            )
        };
        let (kind, active_url) = match compute_kind(external_online, integrated_running) {
            KindDecision::External => (BackendKind::External, Some(external.clone())),
            KindDecision::Integrated => (BackendKind::Integrated, integrated_url),
            KindDecision::None_ => (BackendKind::None_, None),
        };
        let installed = engine::is_backend_installed();
        if installed && settings.integrated.is_none() {
            let meta = IntegratedMeta::default();
            if let Err(e) = settings.update(|s| s.integrated = Some(meta.clone())) {
                log::warn!("falha ao salvar metadados da instalação integrada: {e}");
            }
        }
        let p = &settings.integrated_params;

        let sel = selection_json(&kind, &active_url);
        let kind_str = sel["kind"].as_str().unwrap_or("none");
        serde_json::json!({
            "kind": kind_str,
            "activeUrl": sel["activeUrl"],
            "state": {
                "revision": revision,
                "integratedEnabled": settings.integrated_enabled,
                "installed": installed,
                "version": settings.integrated.as_ref().map(|m| m.version.clone()).unwrap_or_default(),
                "path": paths::backend_version_dir().display().to_string(),
                "processState": process_state,
                "manualStop": settings.manual_stop,
                "externalStatus": if external_online { "connected" } else { "unavailable" },
                "activeBackend": sel["state"]["activeBackend"],
            },
            // Aliases de compatibilidade (consumidores existentes).
            "externalUrl": external,
            "externalOnline": external_online,
            "integratedEnabled": settings.integrated_enabled,
            "integratedInstalled": installed,
            "integratedVersion": settings.integrated.as_ref().map(|m| m.version.clone()).unwrap_or_default(),
            "integratedDir": paths::backend_version_dir().display().to_string(),
            "integratedRunning": matches!(process_state, "running"),
            "installing": false,
            "paramsModel": p.model.as_ref().or(settings.model_gguf.as_ref()),
            "paramsMmproj": p.mmproj.as_ref().or(settings.model_mmproj.as_ref()),
            "modelExists": p.model.as_ref().or(settings.model_gguf.as_ref()).is_some_and(|s| self.model_exists(s)),
            "mmprojExists": p.mmproj.as_ref().or(settings.model_mmproj.as_ref()).is_some_and(|s| self.model_exists(s)),
            "integratedStartError": start_error,
            "bundledModel": self.bundle.as_ref().map(|_| Bundle::model_ref()),
            "bundledProjector": self.bundle.as_ref().map(|_| Bundle::projector_ref()),
            "paramsNgl": p.ngl,
            "paramsCtk": p.cache_type_k,
            "paramsCtv": p.cache_type_v,
            "paramsCtx": p.ctx_size,
            "paramsThreads": p.threads,
            "paramsThreadsBatch": p.threads_batch,
            "paramsBatch": p.batch_size,
            "paramsUbatch": p.ubatch_size,
            "paramsSlots": p.slots,
            "paramsFa": p.flash_attn,
            "paramsReasoning": p.reasoning,
            "paramsMtp": p.mtp,
            "paramsMtpDraft": p.mtp_draft,
            "paramsHost": p.host,
            "paramsPort": p.port,
            "paramsCors": p.cors_origins,
            "paramsNoWebui": p.no_webui,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn externo_valido_sempre_external() {
        assert_eq!(compute_kind(true, false), KindDecision::External);
        assert_eq!(compute_kind(true, true), KindDecision::External);
    }

    #[test]
    fn integrado_so_quando_rodando() {
        assert_eq!(compute_kind(false, true), KindDecision::Integrated);
        assert_eq!(compute_kind(false, false), KindDecision::None_);
    }

    #[test]
    fn instalado_parado_nao_e_integrated() {
        // independente de instalado/habilitado: sem processo ⇒ none
        assert_eq!(compute_kind(false, false), KindDecision::None_);
    }

    #[test]
    fn invariante_kind_aliases() {
        // Sem rede: valida os invariantes no bloco canônico.
        let cases: [(BackendKind, Option<&str>); 3] = [
            (BackendKind::External, Some("http://127.0.0.1:8080")),
            (BackendKind::Integrated, Some("http://127.0.0.1:34567")),
            (BackendKind::None_, None),
        ];
        for (kind, url) in cases {
            let expected_url = url.map(|s| s.to_string());
            let v = selection_json(&kind, &expected_url);
            let k = kind.as_str();
            assert_eq!(v["kind"], k);
            assert_eq!(v["state"]["activeBackend"], k);
            match &expected_url {
                Some(u) => assert_eq!(v["activeUrl"].as_str(), Some(u.as_str())),
                None => assert!(v["activeUrl"].is_null()),
            }
        }
    }
}
