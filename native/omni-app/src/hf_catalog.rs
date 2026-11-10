use std::{cell::Cell, rc::Rc, sync::{mpsc, Arc, atomic::{AtomicBool, Ordering}}, time::Duration};

use gtk4::prelude::*;
use std::{fs, io, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};
use omni_core::{downloads::DownloadError, huggingface, settings::Settings};
use serde_json::{json, Value};

use crate::{dispatch_on_main, publish_command_result};

#[derive(Clone, Default)]
pub struct CatalogBridge {
    downloading: Rc<Cell<bool>>,
    cancel: Arc<AtomicBool>,
    pause: Arc<AtomicBool>,
    skip_verification: Arc<AtomicBool>,
}

const PAUSE_TTL: u64 = 3 * 24 * 60 * 60;

#[derive(serde::Serialize, serde::Deserialize)]
struct DownloadJob {
    repo: String,
    revision: String,
    names: Vec<String>,
    folder: PathBuf,
    staging: PathBuf,
    results: Vec<Value>,
    expires: u64,
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

fn paused_path() -> PathBuf {
    omni_core::paths::config_dir().join("hf-paused-download.json")
}

fn load_paused() -> Option<DownloadJob> {
    let job: DownloadJob = serde_json::from_slice(&fs::read(paused_path()).ok()?).ok()?;
    let name = job.staging.file_name()?.to_str()?.strip_prefix(".omni-gguf-")?;
    (job.staging.parent() == Some(job.folder.as_path()) &&
        !name.is_empty() && name.bytes().all(|byte| byte.is_ascii_alphanumeric())).then_some(job)
}

fn persist_pause(job: &DownloadJob) -> io::Result<()> {
    let path = paused_path();
    fs::create_dir_all(omni_core::paths::config_dir())?;
    let pending = path.with_extension("tmp");
    fs::write(&pending, serde_json::to_vec(job).map_err(io::Error::other)?)?;
    fs::rename(pending, path)
}

fn discard_job(job: &DownloadJob) -> io::Result<()> {
    if !job.folder.is_dir() {
        return Err(io::Error::new(io::ErrorKind::NotFound, "Download folder unavailable"));
    }
    match fs::remove_dir_all(&job.staging) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    match fs::remove_file(paused_path()) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

fn paused_job() -> Option<DownloadJob> {
    let job = load_paused()?;
    if job.expires <= now() {
        let _ = discard_job(&job);
        return None;
    }
    Some(job)
}

impl CatalogBridge {
    pub fn new() -> Self {
        let bridge = Self::default();
        let downloading = bridge.downloading.clone();
        let _ = paused_job();
        glib::timeout_add_local(Duration::from_secs(60), move || {
            if !downloading.get() { let _ = paused_job(); }
            glib::ControlFlow::Continue
        });
        bridge
    }

    pub fn handle(
        &self,
        cmd: &str,
        request: &Value,
        view: &webkit6::WebView,
        parent: Option<gtk4::Window>,
    ) {
        let Some(id) = request["requestId"].as_str().map(str::to_owned) else { return; };
        if matches!(cmd, "hf-download-status" | "hf-skip-verification" | "hf-pause-download" | "hf-resume-download" | "hf-cancel-download") {
            let active = self.downloading.get();
            let result = match cmd {
                "hf-download-status" => json!({
                    "ok": true,
                    "result": if active { None } else { paused_job().map(|job| json!({ "model": job.repo, "expires": job.expires })) },
                }),
                "hf-skip-verification" if active => {
                    self.skip_verification.store(true, Ordering::Relaxed);
                    json!({ "ok": true })
                }
                "hf-pause-download" => {
                    if active {
                        self.pause.store(true, Ordering::Relaxed);
                        self.cancel.store(true, Ordering::Relaxed);
                    }
                    json!({ "ok": active })
                }
                "hf-resume-download" if !active => {
                    if let Some(job) = paused_job().filter(|job| job.staging.is_dir()) {
                        self.downloading.set(true);
                        self.start_job(job, id, view.clone());
                        return;
                    }
                    json!({ "ok": false, "code": "folder" })
                }
                "hf-cancel-download" if active => {
                    self.pause.store(false, Ordering::Relaxed);
                    self.cancel.store(true, Ordering::Relaxed);
                    json!({ "ok": true })
                }
                "hf-cancel-download" => json!({ "ok": load_paused().is_some_and(|job| discard_job(&job).is_ok()) }),
                _ => json!({ "ok": false, "code": "busy" }),
            };
            let mut result = result;
            result["requestId"] = json!(id);
            publish_command_result(view, &result);
            return;
        }
        let repo = request["repo"].as_str().unwrap_or_default().to_owned();
        if cmd == "hf-open-link" {
            let opened = request["url"].as_str().and_then(|url| {
                let uri = glib::Uri::parse(url, glib::UriFlags::NONE).ok()?;
                if !matches!(uri.scheme().as_str(), "http" | "https") || uri.host()?.is_empty() {
                    return None;
                }
                gtk4::gio::AppInfo::launch_default_for_uri(url, None::<&gtk4::gio::AppLaunchContext>).ok()
            }).is_some();
            publish_command_result(view, &json!({ "requestId": id, "ok": opened }));
            return;
        }
        let revision = request["revision"].as_str().unwrap_or_default().to_owned();
        if cmd != "hf-download" {
            let view = view.clone();
            let cmd = cmd.to_owned();
            let query: String = request["query"].as_str().unwrap_or_default().chars().take(160).collect();
            let format = request["format"].as_str().unwrap_or_default().to_owned();
            let sort = request["sort"].as_str().unwrap_or_default().to_owned();
            let (tx, rx) = mpsc::channel();
            dispatch_on_main(rx, move |payload| publish_command_result(&view, &payload));
            std::thread::spawn(move || {
                let result = match cmd.as_str() {
                    "hf-trending" | "hf-search" => huggingface::model_catalog(&query, &format, &sort).map(|models| json!(models)),
                    "hf-readme" => Ok(json!(huggingface::catalog_readme(&repo, &revision))),
                    _ => huggingface::catalog_variants(&repo).map(|(revision, variants, gated)| {
                        json!({ "revision": revision, "variants": variants, "gated": gated })
                    }),
                };
                let payload = match result {
                    Ok(data) => json!({ "requestId": id, "ok": true, "result": data }),
                    Err(error) => {
                        log::warn!("Hugging Face catalog: {error}");
                        json!({ "requestId": id, "ok": false, "code": "network" })
                    }
                };
                let _ = tx.send(payload);
            });
            return;
        }

        if !self.downloading.get() && (paused_job().is_some() || load_paused().is_some()) {
            publish_command_result(view, &json!({ "requestId": id, "ok": false, "code": "paused" }));
            return;
        }
        let Some(parent) = parent else {
            publish_command_result(view, &json!({ "requestId": id, "ok": false, "code": "folder" }));
            return;
        };
        if self.downloading.replace(true) {
            publish_command_result(view, &json!({ "requestId": id, "ok": false, "code": "busy" }));
            return;
        }
        let bridge = self.clone();
        let label = |key: &str| request[key].as_str().filter(|s| !s.is_empty());
        let dialog = gtk4::FileChooserNative::new(
            label("folderTitle"), Some(&parent), gtk4::FileChooserAction::SelectFolder,
            label("acceptLabel"), label("cancelLabel"),
        );
        let folder = Settings::load().hf_download_dir.map(std::path::PathBuf::from)
            .filter(|path| path.is_dir())
            .or_else(|| glib::user_special_dir(glib::UserDirectory::Downloads).filter(|path| path.is_dir()))
            .unwrap_or_else(glib::home_dir);
        let _ = dialog.set_current_folder(Some(&gtk4::gio::File::for_path(folder)));
        let names: Vec<String> = request["variants"].as_array().into_iter().flatten()
            .filter_map(Value::as_str).map(str::to_owned).collect();
        if names.is_empty() {
            self.downloading.set(false);
            publish_command_result(view, &json!({ "requestId": id, "ok": false, "code": "variant" }));
            return;
        }
        let view = view.clone();
        let downloading = self.downloading.clone();
        // Keep the native dialog alive until it emits a response.
        let dialog_hold = Rc::new(std::cell::RefCell::new(Some(dialog.clone())));
        dialog.connect_response(move |dialog, response| {
            dialog_hold.borrow_mut().take();
            if response != gtk4::ResponseType::Accept {
                downloading.set(false);
                publish_command_result(&view, &json!({ "requestId": id, "ok": true, "cancelled": true }));
                return;
            }
            let Some(folder) = dialog.file().and_then(|file| file.path()).filter(|path| path.is_dir()) else {
                downloading.set(false);
                publish_command_result(&view, &json!({ "requestId": id, "ok": false, "code": "folder" }));
                return;
            };
            let Some(folder_text) = folder.to_str() else {
                downloading.set(false);
                publish_command_result(&view, &json!({ "requestId": id, "ok": false, "code": "folder" }));
                return;
            };
            if Settings::load().update(|s| s.hf_download_dir = Some(folder_text.to_owned())).is_err() {
                downloading.set(false);
                publish_command_result(&view, &json!({ "requestId": id, "ok": false, "code": "folder" }));
                return;
            }

            let staging = match huggingface::new_download_staging(&folder) {
                Ok(path) => path,
                Err(_) => {
                    downloading.set(false);
                    publish_command_result(&view, &json!({ "requestId": id, "ok": false, "code": "folder" }));
                    return;
                }
            };
            bridge.start_job(DownloadJob {
                repo: repo.clone(), revision: revision.clone(), names: names.clone(),
                folder, staging, results: Vec::new(), expires: 0,
            }, id.clone(), view.clone());
        });
        dialog.show();
    }

    fn start_job(&self, mut job: DownloadJob, id: String, view: webkit6::WebView) {
        self.cancel.store(false, Ordering::Relaxed);
        self.pause.store(false, Ordering::Relaxed);
        let cancel = self.cancel.clone();
        let pause = self.pause.clone();
        self.skip_verification.store(false, Ordering::Relaxed);
        let skip = self.skip_verification.clone();
        let downloading = self.downloading.clone();
            let (tx, rx) = mpsc::channel::<Value>();
            let view = view.clone();
            let reply_id = id.clone();
            glib::timeout_add_local(Duration::from_millis(100), move || {
                let mut latest = None;
                loop {
                    match rx.try_recv() {
                        Ok(payload) if payload["progress"].is_object() => latest = Some(payload),
                        Ok(payload) => {
                            downloading.set(false);
                            publish_command_result(&view, &payload);
                            return glib::ControlFlow::Break;
                        }
                        Err(mpsc::TryRecvError::Empty) => break,
                        Err(mpsc::TryRecvError::Disconnected) => {
                            downloading.set(false);
                            publish_command_result(&view, &json!({
                                "requestId": reply_id, "ok": false, "code": "download",
                            }));
                            return glib::ControlFlow::Break;
                        }
                    }
                }
                if let Some(payload) = latest { publish_command_result(&view, &payload); }
                glib::ControlFlow::Continue
            });
            std::thread::spawn(move || {
                let names = &job.names;
                let repo = &job.repo;
                let revision = &job.revision;
                let folder = &job.folder;
                let _ = tx.send(json!({ "requestId": id, "progress": {
                    "bytes": 0, "total": null, "index": 1, "count": names.len(),
                } }));
                let payload = match huggingface::gguf_variants_at(&repo, Some(&revision)) {
                    Ok((revision, variants)) => {
                        let mut completed_bytes = 0u64;
                        let mut batch_total = names.iter().try_fold(0u64, |sum, name| {
                            sum.checked_add(variants.iter().find(|variant| variant.name == *name)?.size?)
                        });
                        for item in &job.results {
                            if let Some(size) = variants.iter().find(|variant| item["name"] == variant.name).and_then(|variant| variant.size) {
                                if item["code"] == "done" { completed_bytes = completed_bytes.saturating_add(size); }
                                else { batch_total = batch_total.map(|total| total.saturating_sub(size)); }
                            }
                        }
                        for (index, name) in names.iter().enumerate().skip(job.results.len()) {
                            if cancel.load(Ordering::Relaxed) { break; }
                            let variant = variants.iter().find(|variant| variant.name == *name);
                            let progress = |bytes, total, speed, verifying| {
                                let (bytes, total) = match batch_total {
                                    Some(size) => (completed_bytes.saturating_add(bytes), Some(size)),
                                    None => (bytes, total),
                                };
                                let _ = tx.send(json!({ "requestId": id, "progress": {
                                    "bytes": bytes, "total": total, "speed": speed, "verifying": verifying, "index": index + 1, "count": names.len(),
                                } }));
                            };
                            progress(0, variant.and_then(|item| item.size), 0.0, false);
                            let code = match variant {
                                None => "variant",
                                Some(variant) => match huggingface::download_gguf_resumable(repo, &revision, variant, folder, &job.staging.join(index.to_string()), &cancel, Some(&skip), &|p| {
                                    progress(p.bytes, p.total, p.speed_bps, p.stage == "verifying");
                                }) {
                                    Ok(()) => "done",
                                    Err(error) => {
                                        log::warn!("Hugging Face download: {error}");
                                        match error {
                                            DownloadError::Cancelled => break,
                                            DownloadError::Io(e) if e.kind() == std::io::ErrorKind::AlreadyExists => "exists",
                                            DownloadError::NoSpace { .. } => "space",
                                            DownloadError::Network(_) | DownloadError::Http(_) => "network",
                                            _ => "download",
                                        }
                                    }
                                },
                            };
                            if let Some(size) = variant.and_then(|item| item.size) {
                                if code == "done" {
                                    completed_bytes = completed_bytes.saturating_add(size);
                                } else {
                                    batch_total = batch_total.map(|total| total.saturating_sub(size));
                                }
                            }
                            job.results.push(json!({ "name": name, "code": code }));
                        }
                        json!({ "requestId": id, "ok": true, "result": { "folder": folder, "items": job.results, "interrupted": cancel.load(Ordering::Relaxed) } })
                    }
                    Err(error) => {
                        log::warn!("Hugging Face download metadata: {error}");
                        json!({ "requestId": id, "ok": false, "code": "network" })
                    }
                };
                let payload = if cancel.load(Ordering::Relaxed) && payload["ok"] == false {
                    json!({ "requestId": id, "ok": true, "result": {
                        "folder": folder, "items": [], "interrupted": true,
                    } })
                } else { payload };
                let payload = if pause.load(Ordering::Relaxed) && job.results.len() < job.names.len() {
                    job.expires = now().saturating_add(PAUSE_TTL);
                    match persist_pause(&job) {
                        Ok(()) => json!({ "requestId": id, "ok": true, "paused": {
                            "model": job.repo, "expires": job.expires,
                        } }),
                        Err(error) => {
                            log::warn!("Could not persist paused GGUF: {error}");
                            let _ = discard_job(&job);
                            json!({ "requestId": id, "ok": false, "code": "folder" })
                        }
                    }
                } else {
                    // A falha de consultar o Hub não invalida os bytes de uma pausa anterior.
                    if job.expires == 0 || payload["ok"] == true {
                        let _ = discard_job(&job);
                    }
                    payload
                };
                let _ = tx.send(payload);
            });
    }
}
