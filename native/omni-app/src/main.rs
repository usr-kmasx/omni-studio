//! Omni Studio — janela GTK4 executando o site original (Parte 1) via
//! WebKitGTK 6.0.
//!
//! Arquitetura: ApplicationWindow → WebView → HTML/CSS/JS da Parte 1
//! (servido de uma origem local controlada em 127.0.0.1) → backend
//! llama.cpp já consumido pelo próprio JavaScript do site.

mod backend_manager;
mod bundle;
mod hf_catalog;
mod history;
mod image_bridge;
mod site_server;
mod ui_settings;

use std::cell::RefCell;
use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::sync::Arc;

use gtk4::prelude::*;
use webkit6::prelude::*;

use backend_manager::BackendManager;

const APP_ID: &str = "studio.omni.app";

fn push_snapshot(view: &webkit6::WebView, snap: &serde_json::Value) {
    let json = serde_json::to_string(snap).unwrap_or_else(|_| "{}".into());
    view.evaluate_javascript(
        &format!("window.__omniBackend = {json}; window.dispatchEvent(new Event('omni-backend-snapshot'));"),
        None,
        None,
        None::<&gtk4::gio::Cancellable>,
        |_| {},
    );
}

/// Executa um callback na main thread quando o worker enviar o resultado.
/// A consulta usa um timeout curto e o source é removido após receber o valor
/// ou detectar que o canal foi fechado, sem busy-loop na main thread.
fn dispatch_on_main<T: 'static, F: FnOnce(T) + 'static>(
    rx: std::sync::mpsc::Receiver<T>,
    callback: F,
) {
    let mut callback = Some(callback);
    glib::timeout_add_local(std::time::Duration::from_millis(25), move || {
        match rx.try_recv() {
            Ok(value) => {
                if let Some(callback) = callback.take() {
                    callback(value);
                }
                glib::ControlFlow::Break
            }
            Err(std::sync::mpsc::TryRecvError::Empty) => glib::ControlFlow::Continue,
            Err(std::sync::mpsc::TryRecvError::Disconnected) => glib::ControlFlow::Break,
        }
    });
}

/// Publica o snapshot oficial sem bloquear a main thread (a rede é feita em
/// thread de trabalho; a UI apenas recebe o JSON pronto).
fn push_backend_state(view: &webkit6::WebView, manager: &Arc<BackendManager>) {
    let view = view.clone();
    let manager = manager.clone();
    let (tx, rx) = std::sync::mpsc::channel::<serde_json::Value>();
    dispatch_on_main(rx, move |snap| push_snapshot(&view, &snap));
    std::thread::spawn(move || {
        let snap = manager.snapshot();
        let _ = tx.send(snap);
    });
}

/// Publica uma resposta de comando correlacionada por `requestId` via evento
/// `omni-backend-command-result`.
fn publish_command_result(view: &webkit6::WebView, payload: &serde_json::Value) {
    let json = serde_json::to_string(payload).unwrap_or_else(|_| "{}".into());
    let js = format!(
        "window.dispatchEvent(new CustomEvent('omni-backend-command-result', {{ detail: {json} }}));"
    );
    view.evaluate_javascript(&js, None, None, None::<&gtk4::gio::Cancellable>, |_| {});
}

fn set_opt_path(canon: &mut Option<String>, mirror: &mut Option<String>, v: &serde_json::Value) {
    let x = if v.is_null() {
        None
    } else {
        v.as_str()
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty())
    };
    *canon = x.clone();
    *mirror = x;
}

fn set_opt_u32(target: &mut Option<u32>, v: Option<&serde_json::Value>) {
    if let Some(v) = v {
        *target = v.as_u64().map(|n| n as u32);
    }
}

fn set_opt_u16(target: &mut Option<u16>, v: Option<&serde_json::Value>) {
    if let Some(v) = v {
        *target = v.as_u64().and_then(|n| u16::try_from(n).ok());
    }
}

fn validate_optional_u32(changes: &serde_json::Value, key: &str, label: &str) -> Result<(), String> {
    match changes.get(key) {
        None | Some(serde_json::Value::Null) => Ok(()),
        Some(value) => value
            .as_u64()
            .filter(|n| (1..=u32::MAX as u64).contains(n))
            .map(|_| ())
            .ok_or_else(|| format!("{label}: informe um inteiro entre 1 e {} ou deixe vazio.", u32::MAX)),
    }
}

fn validate_integrated_changes(changes: &serde_json::Value) -> Result<(), String> {
    if let Some(value) = changes.get("ctx_size") {
        if !value
            .as_u64()
            .is_some_and(|n| (1024..=u32::MAX as u64).contains(&n))
        {
            return Err(format!("Contexto: informe um inteiro entre 1024 e {}.", u32::MAX));
        }
    }

    for (key, label) in [
        ("threads", "Threads"),
        ("threads_batch", "Threads de batch"),
        ("batch_size", "Batch"),
        ("ubatch_size", "Ubatch"),
        ("slots", "Slots"),
    ] {
        validate_optional_u32(changes, key, label)?;
    }

    if let Some(value) = changes.get("port") {
        if !value.is_null()
            && !value
                .as_u64()
                .is_some_and(|n| (1..=u16::MAX as u64).contains(&n))
        {
            return Err("Porta: informe um inteiro entre 1 e 65535 ou deixe vazio.".into());
        }
    }

    if let Some(value) = changes.get("ngl") {
        if let Some(text) = value.as_str() {
            let valid = text == "all" || text == "auto" || text.parse::<u32>().is_ok();
            if !valid {
                return Err("Camadas na GPU: use all, auto ou um inteiro entre 0 e 4294967295.".into());
            }
        } else if !value.is_null() {
            return Err("Camadas na GPU: use all, auto ou um número inteiro.".into());
        }
    }
    Ok(())
}

/// Aplica somente os campos presentes em `changes` (atualização parcial).
/// Campos ausentes são preservados; `null` explícito limpa opcionais.
fn apply_integrated_changes(s: &mut omni_core::settings::Settings, changes: &serde_json::Value) {
    let p = &mut s.integrated_params;

    if let Some(v) = changes.get("model") {
        set_opt_path(&mut p.model, &mut s.model_gguf, v);
    }
    if let Some(v) = changes.get("mmproj") {
        set_opt_path(&mut p.mmproj, &mut s.model_mmproj, v);
    }

    let set_str = |target: &mut String, key: &str, fallback: &str| {
        if let Some(v) = changes.get(key) {
            if let Some(x) = v.as_str() {
                if !x.is_empty() {
                    *target = x.to_string();
                } else {
                    *target = fallback.to_string();
                }
            }
        }
    };
    set_str(&mut p.ngl, "ngl", "all");
    set_str(&mut p.cache_type_k, "cache_type_k", "q4_0");
    set_str(&mut p.cache_type_v, "cache_type_v", "q4_0");
    set_str(&mut p.flash_attn, "flash_attn", "auto");
    set_str(&mut p.reasoning, "reasoning", "off");
    set_str(&mut p.host, "host", "127.0.0.1");
    set_str(&mut p.cors_origins, "cors_origins", "");

    if let Some(v) = changes.get("ctx_size") {
        if let Some(n) = v.as_u64() {
            p.ctx_size = (n as u32).max(1024);
        }
    }
    set_opt_u32(&mut p.threads, changes.get("threads"));
    set_opt_u32(&mut p.threads_batch, changes.get("threads_batch"));
    set_opt_u32(&mut p.batch_size, changes.get("batch_size"));
    set_opt_u32(&mut p.ubatch_size, changes.get("ubatch_size"));
    set_opt_u32(&mut p.slots, changes.get("slots"));
    set_opt_u16(&mut p.port, changes.get("port"));

    if let Some(v) = changes.get("no_webui") {
        if let Some(b) = v.as_bool() {
            p.no_webui = b;
        }
    }
}

/// Localiza a raiz do site pelo override, diretório atual ou executável.
fn locate_site_root() -> PathBuf {
    if let Ok(v) = std::env::var("OMNI_SITE_ROOT") {
        let p = PathBuf::from(v);
        if p.join("index.html").is_file() {
            log::info!("site root (env OMNI_SITE_ROOT): {}", p.display());
            return p;
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(directory) = exe.parent() {
            let site = directory.join("omni-site");
            if site.join("index.html").is_file() {
                log::info!("site root (ao lado do executável): {}", site.display());
                return site;
            }
        }
    }
    if let Ok(mut d) = std::env::current_dir() {
        loop {
            if d.join("index.html").is_file() {
                log::info!("site root (descoberta): {}", d.display());
                return d;
            }
            if !d.pop() {
                break;
            }
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(mut d) = exe.parent().map(Path::to_path_buf) {
            loop {
                if d.join("index.html").is_file() {
                    log::info!("site root (executável): {}", d.display());
                    return d;
                }
                if !d.pop() {
                    break;
                }
            }
        }
    }
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    log::warn!("site root não encontrado; usando cwd: {}", cwd.display());
    cwd
}

/// Origem rigorosa (protocolo + host + porta) usada na política de permissão.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Origin {
    scheme: String,
    host: String,
    port: u16,
}

/// Compara o esquema (http/https), o host e a porta de um URI/URL.
///
/// Parser manual mínimo (sem dependências): extrai `scheme://host[:port]`.
/// Não aceita userinfo, fragmentos nem resolução relativa — para a origem
/// local do Omni Studio apenas o caso absoluto simples é relevante.
fn origin_for(raw: &str) -> Option<Origin> {
    let raw = raw.trim();
    let (scheme, rest) = raw.split_once("://")?;
    if scheme.is_empty() || rest.is_empty() {
        return None;
    }
    let authority = rest.split(['/', '?', '#']).next()?;
    let default_port = if scheme == "https" { 443 } else { 80 };
    let (host, port) = match authority.rsplit_once(':') {
        Some((h, p)) if h.contains('.') || h == "localhost" => {
            let port: u16 = p.parse().ok()?;
            (h.to_string(), port)
        }
        _ => (authority.to_string(), default_port),
    };
    if host.is_empty() {
        return None;
    }
    Some(Origin {
        scheme: scheme.to_string(),
        host,
        port,
    })
}

fn load_event_name(ev: webkit6::LoadEvent) -> &'static str {
    match ev {
        webkit6::LoadEvent::Started => "started",
        webkit6::LoadEvent::Redirected => "redirected",
        webkit6::LoadEvent::Committed => "committed",
        webkit6::LoadEvent::Finished => "finished",
        _ => "unknown",
    }
}

fn main() {
    env_logger::init();
    let app = gtk4::Application::new(Some(APP_ID), Default::default());
    app.connect_activate(build_ui);
    app.run();
}

fn build_ui(app: &gtk4::Application) {
    let site_root = locate_site_root();

    let bundle = bundle::Bundle::discover(&site_root);
    let server = match site_server::SiteServer::start(site_root) {
        Ok(s) => s,
        Err(e) => {
            log::error!("falha ao iniciar servidor local do site: {e}");
            return;
        }
    };
    let entry = format!("{}/index.html", server.base_url);
    log::info!("origem local: {entry}");

    // WebContext padrão (não-efêmero): o WebKitGTK 2.54 mantém o storage
    // persistente (localStorage etc.) entre execuções; o setter de sessão
    // customizada foi removido da API nessa versão.
    let ctx = webkit6::WebContext::new();

    // Configuração mínima — mecanismos de segurança do WebKit permanecem ativos.
    let settings = webkit6::Settings::new();
    settings.set_enable_javascript(true);
    settings.set_javascript_can_open_windows_automatically(false);

    let user_content = webkit6::UserContentManager::new();
    let view = webkit6::WebView::builder()
        .web_context(&ctx)
        .settings(&settings)
        .user_content_manager(&user_content)
        .build();

    // ---------- Gerenciador de backends + ponte JS ↔ Rust ----------
    let manager = Arc::new(BackendManager::with_bundle(&server.base_url, bundle));
    let images = Arc::new(omni_core::image_backend::ImageBackend::new());
    {
        let manager = manager.clone();
        let images = images.clone();
        app.connect_shutdown(move |_| {
            images.shutdown();
            manager.shutdown();
        });
    }
    let window_holder = Rc::new(RefCell::new(None::<gtk4::Window>));
    // Diálogos nativos pendentes, mantidos vivos até a resposta (requestId → FileChooserNative).
    let dialogs =
        Rc::new(RefCell::new(std::collections::HashMap::<String, gtk4::FileChooserNative>::new()));

    {
        let manager = manager.clone();
        let view = view.clone();
        let window_holder = window_holder.clone();
        let dialogs = dialogs.clone();
        let image_commands = images.clone();
        // 1) conecta o sinal ANTES de registrar o handler (recomendação
        //    oficial do WebKitGTK para evitar condições de corrida).
        let catalog = hf_catalog::CatalogBridge::new();
        let history = history::History::new();
        user_content.connect_script_message_received(Some("omni-backend"), move |_, value| {
            let raw = value
                .to_string_as_bytes()
                .map(|b| String::from_utf8_lossy(b.as_ref()).into_owned())
                .unwrap_or_default();
            let parsed = serde_json::from_str::<serde_json::Value>(&raw);
            let cmd = match &parsed {
                Ok(v) => v
                    .get("cmd")
                    .and_then(|c| c.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_default(),
                Err(e) => {
                    log::warn!("[OMNI-BRIDGE] mensagem não-JSON ignorada: {e}");
                    String::new()
                }
            };
            let external = match &parsed {
                Ok(v) => v
                    .get("externalUrl")
                    .and_then(|c| c.as_str())
                    .map(|s| s.to_string()),
                Err(_) => None,
            };
            let request_id = match &parsed {
                Ok(v) => v
                    .get("requestId")
                    .and_then(|r| r.as_str())
                    .map(|s| s.to_string())
                    .filter(|s| !s.is_empty()),
                Err(_) => None,
            };
            match cmd.as_str() {
                command if command.starts_with("image-") => {
                    if let (Ok(request), Some(id)) = (parsed, request_id) {
                        image_bridge::handle(
                            &image_commands, &view, window_holder.borrow().as_ref(),
                            &dialogs, &cmd, request, id,
                        );
                    }
                }
                "ui-settings-get" | "ui-settings-save" | "draft-image-get" | "draft-image-save" => {
                    if let (Ok(request), Some(id)) = (parsed, request_id) {
                        let image_draft = cmd.starts_with("draft-image-");
                        let filename = if image_draft { "image-draft.json" } else { "ui-settings.json" };
                        let path = omni_core::paths::config_dir().join(filename);
                        let result = if cmd.ends_with("-get") {
                            ui_settings::read(&path)
                        } else if image_draft {
                            ui_settings::write_image_draft(&path, &request["settings"])
                                .map(|()| serde_json::Value::Null)
                        } else {
                            ui_settings::write(&path, &request["settings"])
                                .map(|()| serde_json::Value::Null)
                        };
                        let reply = match result {
                            Ok(value) => serde_json::json!({ "requestId": id, "ok": true, "result": value }),
                            Err(error) => {
                                log::warn!("{filename}: {error}");
                                serde_json::json!({ "requestId": id, "ok": false, "code": "storage" })
                            }
                        };
                        publish_command_result(&view, &reply);
                    }
                }

                command if command.starts_with("history-") => {
                    if let (Ok(request), Some(id)) = (parsed, request_id) {
                        let store = history.clone();
                        let view_reply = view.clone();
                        let (tx, rx) = std::sync::mpsc::channel();
                        dispatch_on_main(rx, move |result| publish_command_result(&view_reply, &result));
                        std::thread::spawn(move || {
                            let result = match store.execute(&cmd, &request) {
                                Ok(data) => serde_json::json!({ "requestId": id, "ok": true, "result": data }),
                                Err(error) => {
                                    if error.kind() != std::io::ErrorKind::NotFound {
                                        log::warn!("History: {error}");
                                    }
                                    serde_json::json!({
                                        "requestId": id, "ok": false,
                                        "code": if error.kind() == std::io::ErrorKind::NotFound { "not_found" } else { "storage" },
                                    })
                                }
                            };
                            let _ = tx.send(result);
                        });
                    }
                }
                "hf-trending" | "hf-search" | "hf-variants" | "hf-readme" | "hf-open-link" | "hf-download" | "hf-cancel-download" | "hf-skip-verification" | "hf-pause-download" | "hf-resume-download" | "hf-download-status" => {
                    if let Ok(request) = &parsed {
                        catalog.handle(&cmd, request, &view, window_holder.borrow().clone());
                    }
                }
                "status" => {
                    if let Some(req) = request_id.clone() {
                        let manager_task = manager.clone();
                        let view_task = view.clone();
                        let (tx, rx) = std::sync::mpsc::channel::<serde_json::Value>();
                        dispatch_on_main(rx, move |payload| {
                            publish_command_result(&view_task, &payload);
                            push_snapshot(&view_task, payload.get("state").unwrap_or(&payload));
                        });
                        std::thread::spawn(move || {
                            let snap = manager_task.snapshot();
                            let payload = serde_json::json!({
                                "type": "command-result",
                                "requestId": req,
                                "cmd": "status",
                                "ok": true,
                                "state": snap,
                            });
                            let _ = tx.send(payload);
                        });
                    } else {
                        push_backend_state(&view, &manager);
                    }
                }
                "stop-integrated" | "start-integrated" => {
                    let Some(req) = request_id.clone() else {
                        let payload = serde_json::json!({
                            "type": "command-result",
                            "requestId": null,
                            "cmd": cmd,
                            "ok": false,
                            "kind": "none",
                            "activeUrl": null,
                            "error": { "code": "invalid_request", "message": "requestId ausente." },
                        });
                        publish_command_result(&view, &payload);
                        return;
                    };
                    let start = cmd == "start-integrated";
                    let activate = parsed.as_ref().ok().and_then(|v| v["activate"].as_bool()).unwrap_or(false);
                    let manager2 = manager.clone();
                    let view2 = view.clone();
                    let (tx, rx) = std::sync::mpsc::channel::<serde_json::Value>();
                    dispatch_on_main(rx, move |payload| {
                        publish_command_result(&view2, &payload);
                        push_backend_state(&view2, &manager2);
                    });
                    let manager_task = manager.clone();
                    std::thread::spawn(move || {
                        let outcome = if start {
                            manager_task.start_integrated_manual(activate, external)
                        } else {
                            manager_task.stop_integrated_manual()
                        };
                        let (kind, url) = manager_task.current_selection();
                        let mut payload = serde_json::json!({
                            "type": "command-result",
                            "requestId": req,
                            "cmd": if start { "start-integrated" } else { "stop-integrated" },
                            "ok": outcome.is_ok(),
                            "kind": kind.as_str(),
                            "activeUrl": url,
                            "state": manager_task.snapshot(),
                        });
                        if let Err(e) = outcome {
                            payload["error"] = serde_json::json!({ "code": e.code(), "message": e.to_string() });
                        }
                        let _ = tx.send(payload);
                    });
                }
                "resolve" => {
                    let manager = manager.clone();
                    let (starting_tx, starting_rx) = std::sync::mpsc::channel::<()>();
                    let view_starting = view.clone();
                    let manager_starting = manager.clone();
                    dispatch_on_main(starting_rx, move |_| {
                        push_backend_state(&view_starting, &manager_starting);
                    });
                    let (tx, rx) = std::sync::mpsc::channel::<()>();
                    let view_ready = view.clone();
                    let manager_ready = manager.clone();
                    dispatch_on_main(rx, move |_| {
                        push_backend_state(&view_ready, &manager_ready);
                    });
                    std::thread::spawn(move || {
                        let _ = manager.resolve(external, || { let _ = starting_tx.send(()); });
                        let _ = tx.send(());
                    });
                }
                "enable" | "disable" => {
                    let Some(req) = request_id.clone() else {
                        let payload = serde_json::json!({
                            "type": "command-result",
                            "requestId": null,
                            "cmd": cmd,
                            "ok": false,
                            "error": { "code": "invalid_request", "message": "requestId ausente." },
                        });
                        publish_command_result(&view, &payload);
                        return;
                    };

                    let enabled = cmd == "enable";
                    let command = cmd.clone();
                    let view_reply = view.clone();
                    let (tx, rx) = std::sync::mpsc::channel::<serde_json::Value>();
                    dispatch_on_main(rx, move |payload| {
                        if let Some(snapshot) = payload.get("state") {
                            push_snapshot(&view_reply, snapshot);
                        }
                        publish_command_result(&view_reply, &payload);
                    });

                    let manager_task = manager.clone();
                    std::thread::spawn(move || {
                        let outcome = manager_task.set_integrated_enabled(enabled);
                        let snapshot = manager_task.snapshot();
                        let mut payload = serde_json::json!({
                            "type": "command-result",
                            "requestId": req,
                            "cmd": command,
                            "ok": outcome.is_ok(),
                            "kind": snapshot["kind"],
                            "activeUrl": snapshot["activeUrl"],
                            "state": snapshot,
                        });
                        if let Err(e) = outcome {
                            payload["error"] = serde_json::json!({
                                "code": e.code(),
                                "message": e.to_string(),
                            });
                        }
                        let _ = tx.send(payload);
                    });
                }
                "delete" => {
                    let _ = manager.delete_integrated();
                    push_backend_state(&view, &manager);
                }
                "save-params" => {
                    let Some(req) = request_id.clone() else {
                        let payload = serde_json::json!({
                            "type": "command-result",
                            "requestId": null,
                            "cmd": cmd,
                            "ok": false,
                            "error": { "code": "invalid_request", "message": "requestId ausente." },
                        });
                        publish_command_result(&view, &payload);
                        return;
                    };
                    let changes = parsed
                        .as_ref()
                        .ok()
                        .and_then(|v| v.get("changes"))
                        .cloned()
                        .unwrap_or_else(|| serde_json::json!({}));
                    if let Err(message) = validate_integrated_changes(&changes) {
                        let payload = serde_json::json!({
                            "type": "command-result",
                            "requestId": req,
                            "cmd": "save-params",
                            "ok": false,
                            "error": { "code": "invalid_params", "message": message },
                        });
                        publish_command_result(&view, &payload);
                        return;
                    }
                    let manager_task = manager.clone();
                    let view_reply = view.clone();
                    let (tx, rx) = std::sync::mpsc::channel::<serde_json::Value>();
                    dispatch_on_main(rx, move |payload| {
                        if let Some(snapshot) = payload.get("state") {
                            push_snapshot(&view_reply, snapshot);
                        }
                        publish_command_result(&view_reply, &payload);
                    });
                    std::thread::spawn(move || {
                        let outcome = manager_task.save_integrated_params(|s| {
                            apply_integrated_changes(s, &changes);
                        });
                        let mut payload = serde_json::json!({
                            "type": "command-result",
                            "requestId": req,
                            "cmd": "save-params",
                            "ok": outcome.is_ok(),
                            "state": manager_task.snapshot(),
                        });
                        match outcome {
                            Ok(Some(Ok(()))) => payload["restarted"] = serde_json::json!(true),
                            Ok(Some(Err(error))) => {
                                payload["restartError"] = serde_json::json!(error.to_string());
                            }
                            Ok(None) => {}
                            Err(error) => {
                                payload["error"] = serde_json::json!({
                                    "code": error.code(), "message": error.to_string(),
                                });
                            }
                        }
                        let _ = tx.send(payload);
                    });
                }
                "select-model" | "select-mmproj" => {
                    let Some(req) = request_id.clone() else {
                        let payload = serde_json::json!({
                            "type": "command-result",
                            "requestId": null,
                            "cmd": cmd,
                            "ok": false,
                            "error": { "code": "invalid_request", "message": "requestId ausente." },
                        });
                        publish_command_result(&view, &payload);
                        return;
                    };
                    // Evita duas requisições idênticas simultâneas.
                    if dialogs.borrow().contains_key(&req) {
                        let payload = serde_json::json!({
                            "type": "command-result",
                            "requestId": req,
                            "cmd": cmd,
                            "ok": false,
                            "error": { "code": "operation_in_progress", "message": "Diálogo já aberto." },
                        });
                        publish_command_result(&view, &payload);
                        return;
                    }
                    let Some(parent) = window_holder.borrow().clone() else {
                        let payload = serde_json::json!({
                            "type": "command-result",
                            "requestId": req,
                            "cmd": cmd,
                            "ok": false,
                            "error": { "code": "internal_error", "message": "Janela principal indisponível." },
                        });
                        publish_command_result(&view, &payload);
                        return;
                    };
                    let is_mm = cmd == "select-mmproj";
                    let view_task = view.clone();
                    let req_key = req.clone();
                    let req_insert = req.clone();

                    let dialog = gtk4::FileChooserNative::new(
                        Some(if is_mm {
                            "Selecionar projetor de imagem (mmproj)"
                        } else {
                            "Selecionar modelo GGUF"
                        }),
                        Some(&parent),
                        gtk4::FileChooserAction::Open,
                        Some("Selecionar"),
                        Some("Cancelar"),
                    );
                    let filter = gtk4::FileFilter::new();
                    filter.add_pattern("*.gguf");
                    dialog.add_filter(&filter);

                    let settings = omni_core::settings::Settings::load();
                    let start_dir = settings
                        .models_dir
                        .as_ref()
                        .map(PathBuf::from)
                        .filter(|d| d.is_dir())
                        .or_else(|| {
                            let cur = if is_mm {
                                settings.model_mmproj.clone()
                            } else {
                                settings.model_gguf.clone()
                            };
                            cur.map(PathBuf::from)
                                .and_then(|p| p.parent().map(|d| d.to_path_buf()))
                                .filter(|d| d.is_dir())
                        })
                        .unwrap_or_else(|| {
                            std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default()
                        });
                    if start_dir.is_dir() {
                        let _ = dialog
                            .set_current_folder(Some(&gtk4::gio::File::for_path(&start_dir)));
                    }

                    // Referência fraca ao registro (evita ciclo forte diálogo ↔ callback).
                    let dialogs_weak = Rc::downgrade(&dialogs);
                    dialog.connect_response(move |dlg, resp| {
                        let cmd_label = if is_mm { "select-mmproj" } else { "select-model" };
                        if resp == gtk4::ResponseType::Accept {
                            let sel = dlg.file().and_then(|f| f.path());
                            if let Some(p) = sel {
                                let gguf = p.extension().and_then(|e| e.to_str()) == Some("gguf");
                                if gguf && p.is_file() {
                                    let path = p.display().to_string();
                                    let name = p
                                        .file_name()
                                        .map(|n| n.to_string_lossy().into_owned())
                                        .unwrap_or_default();
                                    if let Some(map) = dialogs_weak.upgrade() {
                                        map.borrow_mut().remove(&req_key);
                                    }
                                    publish_command_result(&view_task, &serde_json::json!({
                                        "type": "command-result",
                                        "requestId": req,
                                        "cmd": cmd_label,
                                        "ok": true,
                                        "cancelled": false,
                                        "result": { "path": path, "name": name },
                                    }));
                                    return;
                                }
                            }
                            let payload = serde_json::json!({
                                "type": "command-result",
                                "requestId": req,
                                "cmd": cmd_label,
                                "ok": false,
                                "cancelled": false,
                                "error": { "code": "invalid_file", "message": "Arquivo inválido ou inacessível." },
                            });
                            publish_command_result(&view_task, &payload);
                            if let Some(map) = dialogs_weak.upgrade() {
                                map.borrow_mut().remove(&req_key);
                            }
                            return;
                        }
                        // Cancelamento: não altera nada.
                        let payload = serde_json::json!({
                            "type": "command-result",
                            "requestId": req,
                            "cmd": cmd_label,
                            "ok": true,
                            "cancelled": true,
                            "result": null,
                        });
                        publish_command_result(&view_task, &payload);
                        if let Some(map) = dialogs_weak.upgrade() {
                            map.borrow_mut().remove(&req_key);
                        }
                    });

                    // Mantém a referência forte até a resposta e então exibe.
                    dialogs.borrow_mut().insert(req_insert, dialog.clone());
                    dialog.set_modal(true);
                    dialog.show();
                }
                "install" => {
                    let Some(req) = request_id.clone() else {
                        let payload = serde_json::json!({
                            "type": "command-result",
                            "requestId": null,
                            "cmd": cmd,
                            "ok": false,
                            "error": { "code": "invalid_request", "message": "requestId ausente." },
                        });
                        publish_command_result(&view, &payload);
                        return;
                    };
                    let manager_idle = manager.clone();
                    let view_idle = view.clone();
                    let (tx, rx) = std::sync::mpsc::channel::<serde_json::Value>();
                    dispatch_on_main(rx, move |payload| {
                        publish_command_result(&view_idle, &payload);
                        push_backend_state(&view_idle, &manager_idle);
                    });
                    let manager_thread = manager.clone();
                    std::thread::spawn(move || {
                        let cancel = std::sync::atomic::AtomicBool::new(false);
                        let res = manager_thread.install_integrated(&cancel, &|_| {});
                        let payload = match res {
                            Ok(_) => serde_json::json!({
                                "type": "command-result",
                                "requestId": req,
                                "cmd": "install",
                                "ok": true,
                            }),
                            Err(e) => serde_json::json!({
                                "type": "command-result",
                                "requestId": req,
                                "cmd": "install",
                                "ok": false,
                                "error": { "code": "install_failed", "message": e.to_string() },
                            }),
                        };
                        let _ = tx.send(payload);
                    });
                }
                _ if cmd.is_empty() => {}
                other => log::warn!("[OMNI-BRIDGE] comando desconhecido: {other}"),
            }
        });
    }

    // 2) registra o handler depois de conectar o sinal (recomendação oficial).
    user_content.register_script_message_handler("omni-backend", None);

    view.connect_load_changed(move |view, ev| {
        let name = load_event_name(ev);
        log::info!("load-changed: {name}");
        if matches!(ev, webkit6::LoadEvent::Finished) {
            let view = view.clone();
            view.evaluate_javascript(
                "(function(){ try { localStorage.setItem('_omni_persist_check', 'ok'); var p = localStorage.getItem('_omni_persist_check'); localStorage.removeItem('_omni_persist_check'); return JSON.stringify({title: document.title, topbar: !!document.querySelector('#topbar'), chatArea: !!document.getElementById('chatArea'), composer: !!document.getElementById('composerHost'), tabs: document.querySelectorAll('#viewTabs .tab').length, localStorage: p}); } catch(e) { return JSON.stringify({localStorageError: String(e)}); } })()",
                None,
                None,
                None::<&gtk4::gio::Cancellable>,
                move |res| match res {
                    Ok(val) => log::info!("verificação JS (documento carregado): {val}"),
                    Err(e) => log::warn!("verificação JS falhou: {e}"),
                },
            );
        }
    });

    view.connect_load_failed(|_, ev, uri, err| {
        log::error!(
            "load-failed: {} uri={} erro={err}",
            load_event_name(ev),
            uri
        );
        false
    });

    // Permissões (microfone/câmera/etc.): concessão explícita e restrita.
    //
    // Regra: permite SOMENTE `UserMediaPermissionRequest` de áudio puro
    // (sem câmera) quando a origem atual do WebView for exatamente a origem
    // local do próprio Omni Studio (protocolo http, host 127.0.0.1 e a
    // porta efêmera do servidor local desta execução). Qualquer outro tipo
    // de solicitação ou origem é negada explicitamente.
    let server_origin = origin_for(&server.base_url);
    view.connect_permission_request(move |view, req| {
        let origin_current = view.uri().and_then(|u| origin_for(&u));
        log::info!(
            "[OMNI-MIC] permission request type={:?} origem_atual={:?} origem_esperada={:?}",
            req.type_(),
            origin_current,
            server_origin
        );
        let allow = match req.downcast_ref::<webkit6::UserMediaPermissionRequest>() {
            Some(media) => {
                let audio = media.is_for_audio_device();
                let video = media.is_for_video_device();
                log::info!(
                    "[OMNI-MIC] user-media audio={audio} video={video} origem_ok={}",
                    origin_current == server_origin.clone()
                );
                audio && !video && origin_current == server_origin.clone()
            }
            None => false,
        };
        if allow {
            log::info!("[OMNI-MIC] decisão: allow (microfone, origem local)");
            req.allow();
        } else {
            log::info!("[OMNI-MIC] decisão: deny");
            req.deny();
        }
        // `true` = solicitação tratada (bloqueia o handler padrão).
        true
    });

    {
        let view = view.clone();
        let manager = manager.clone();
        view.connect_load_changed(move |view, ev| {
            if matches!(ev, webkit6::LoadEvent::Finished) {
                push_backend_state(view, &manager);
            }
        });
    }

    let window = gtk4::ApplicationWindow::new(app);
    window.set_title(Some("Omni Studio"));
    window.set_default_size(1100, 760);
    window.set_child(Some(&view));
    {
        let manager = manager.clone();
        window.connect_close_request(move |_| {
            images.shutdown();
            manager.shutdown();
            glib::Propagation::Proceed
        });
    }
    *window_holder.borrow_mut() = Some(window.upcast_ref::<gtk4::Window>().clone());
    window.present();

    push_backend_state(&view, &manager);
    view.load_uri(&entry);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn origin(s: &str, h: &str, p: u16) -> Origin {
        Origin {
            scheme: s.to_string(),
            host: h.to_string(),
            port: p,
        }
    }

    /// Simula a política de decisão de permissão (mesma regra do handler).
    fn decide(origin_current: Option<Origin>, server_origin: &Origin, audio: bool, video: bool) -> bool {
        audio && !video && origin_current.as_ref() == Some(server_origin)
    }

    #[test]
    fn origem_local_correta_audio_puro_permitido() {
        let server = origin("http", "127.0.0.1", 34993);
        assert!(decide(Some(origin("http", "127.0.0.1", 34993)), &server, true, false));
    }

    #[test]
    fn origem_local_video_negado() {
        let server = origin("http", "127.0.0.1", 34993);
        assert!(!decide(Some(origin("http", "127.0.0.1", 34993)), &server, false, true));
    }

    #[test]
    fn origem_local_audio_e_video_negado() {
        let server = origin("http", "127.0.0.1", 34993);
        assert!(!decide(Some(origin("http", "127.0.0.1", 34993)), &server, true, true));
    }

    #[test]
    fn origem_externa_negado() {
        let server = origin("http", "127.0.0.1", 34993);
        assert!(!decide(Some(origin("https", "exemplo.com", 443)), &server, true, false));
    }

    #[test]
    fn porta_diferente_negado() {
        let server = origin("http", "127.0.0.1", 34993);
        assert!(!decide(Some(origin("http", "127.0.0.1", 8080)), &server, true, false));
    }

    #[test]
    fn tipo_desconhecido_negado() {
        let server = origin("http", "127.0.0.1", 34993);
        // Tipo desconhecido = sem UserMediaPermissionRequest → audio/video falsos.
        assert!(!decide(Some(origin("http", "127.0.0.1", 34993)), &server, false, false));
    }

    #[test]
    fn parser_origem_rigoroso() {
        assert_eq!(
            origin_for("http://127.0.0.1:34993/index.html"),
            Some(origin("http", "127.0.0.1", 34993))
        );
        assert_eq!(
            origin_for("http://127.0.0.1:34993"),
            Some(origin("http", "127.0.0.1", 34993))
        );
        assert_eq!(origin_for("https://exemplo.com/path"), Some(origin("https", "exemplo.com", 443)));
        assert_ne!(
            origin_for("http://127.0.0.1:34993"),
            origin_for("http://127.0.0.1:8080")
        );
        assert_eq!(origin_for("not-a-url"), None);
        assert_eq!(origin_for(""), None);
        assert_eq!(origin_for("javascript:void(0)"), None);
    }
}
