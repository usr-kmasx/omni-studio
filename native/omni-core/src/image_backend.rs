use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{atomic::{AtomicBool, Ordering}, Mutex},
    thread,
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{
    engine,
    paths,
    process::{inspect_process, pick_free_port, stop_process_if_matches, ProcessIdentity, RunningServer},
};

const VERSION: &str = "master-1079-a3c49b1";
const API: &str = "/sdcpp/v1";
const MAX_BODY: u64 = 12 * 1024 * 1024;
const PNG_HEADER: &[u8] = b"\x89PNG\r\n\x1a\n";

type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Device {
    #[default]
    Cpu,
    Vulkan,
}

impl Device {
    fn name(self) -> &'static str {
        match self { Self::Cpu => "cpu", Self::Vulkan => "vulkan" }
    }

    fn archive(self) -> (&'static str, &'static str) {
        match self {
            Self::Cpu => ("sd-master-a3c49b1-bin-Linux-Ubuntu-26.04-x86_64.zip", "af8c229211c2ea6d28a6c1dca0aeb3f41d5c7ba0a06f79c9e2e634af04627c3d"),
            Self::Vulkan => ("sd-master-a3c49b1-bin-Linux-Ubuntu-26.04-x86_64-vulkan.zip", "a7353599e38047bc52294e15a75d8443fbd0f95159e6a10d02c5c52b3104dbff"),
        }
    }
}

#[derive(Clone, Default, Deserialize, PartialEq, Serialize)]
#[serde(default)]
struct Settings {
    device: Device,
    model: Option<PathBuf>,
    components: Option<Components>,
    generation: Option<Value>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
struct Components {
    diffusion: Option<PathBuf>,
    encoder: Option<PathBuf>,
    vae: Option<PathBuf>,
}

fn weight_path(path: &Path) -> Result<&str> {
    let supported = path.extension().and_then(|extension| extension.to_str())
        .is_some_and(|value| matches!(value.to_ascii_lowercase().as_str(), "safetensors" | "sft" | "gguf"));
    if !supported || !path.is_absolute() || !path.is_file() {
        return Err("Select an existing local model file (.safetensors, .sft or .gguf)".into());
    }
    path.to_str().ok_or_else(|| "Invalid model path".into())
}

impl Components {
    fn weights(&self) -> [(&'static str, Option<&Path>); 3] {
        [
            ("--diffusion-model", self.diffusion.as_deref()),
            ("--llm", self.encoder.as_deref()),
            ("--vae", self.vae.as_deref()),
        ]
    }
}

impl Settings {
    fn configured(&self) -> bool {
        match &self.components {
            Some(components) => components.weights().iter().all(|(_, path)| path.is_some()),
            None => self.model.is_some(),
        }
    }

    fn validate_paths(&self) -> Result<()> {
        if let Some(components) = &self.components {
            for (_, path) in components.weights() {
                if let Some(path) = path { weight_path(path)?; }
            }
        } else if let Some(model) = &self.model {
            weight_path(model)?;
        }
        Ok(())
    }

    fn model_args(&self) -> Result<Vec<String>> {
        if let Some(components) = &self.components {
            let mut args = Vec::new();
            for (flag, path) in components.weights() {
                let path = path.ok_or("Select all image model components before generating")?;
                args.extend([flag.into(), weight_path(path)?.into()]);
            }
            if self.device == Device::Vulkan {
                args.push("--offload-to-cpu".into());
            }
            return Ok(args);
        }
        let model = self.model.as_deref().ok_or("Select a local image model")?;
        Ok(vec!["-m".into(), weight_path(model)?.into()])
    }
}

#[derive(Default)]
struct State {
    settings: Settings,
    server: Option<RunningServer>,
    phase: &'static str,
    progress: Value,
    busy: bool,
    installing: bool,
    cancel: bool,
}

pub struct ImageBackend {
    state: Mutex<State>,
    root: PathBuf,
    config: PathBuf,
    closing: AtomicBool,
    agent: ureq::Agent,
}

impl ImageBackend {
    pub fn new() -> Self {
        let root = paths::data_dir().join("image-backend");
        let config = paths::config_dir().join("image-settings.json");
        let settings = fs::read(&config).ok()
            .and_then(|raw| serde_json::from_slice(&raw).ok()).unwrap_or_default();
        let backend = Self {
            state: Mutex::new(State { settings, phase: "stopped", ..State::default() }),
            root, config, closing: AtomicBool::new(false),
            agent: ureq::Agent::config_builder()
                .proxy(None)
                .max_redirects(0)
                .timeout_global(Some(Duration::from_secs(10)))
                .build().new_agent(),
        };
        backend.recover();
        backend
    }

    fn folder(&self, device: Device) -> PathBuf {
        self.root.join(VERSION).join(device.name())
    }

    fn protected_folder(&self, device: Device) -> PathBuf {
        self.root.join(format!("{VERSION}-omni-memory-v2")).join(device.name())
    }

    fn previous_protected_folder(&self, device: Device) -> PathBuf {
        self.root.join(format!("{VERSION}-omni-memory-v1")).join(device.name())
    }

    fn runtime_folder(&self, device: Device) -> PathBuf {
        let protected = self.protected_folder(device);
        let previous = self.previous_protected_folder(device);
        [protected, previous].into_iter()
            .find(|path| path.join("sd-server").is_file())
            .unwrap_or_else(|| self.folder(device))
    }

    fn bundled_runtime(device: Device) -> Option<PathBuf> {
        let exe = std::env::current_exe().ok()?;
        let path = exe.parent()?.join("omni-image-runtimes").join(device.name());
        path.join("sd-server.zip").is_file().then_some(path)
    }

    fn marker(&self) -> PathBuf {
        self.root.join("server.session")
    }

    fn recover(&self) {
        let Ok(raw) = fs::read_to_string(self.marker()) else { return; };
        let mut lines = raw.lines();
        let identity = lines.next().and_then(|s| s.parse().ok())
            .zip(lines.next().and_then(|s| s.parse().ok()))
            .zip(lines.next())
            .map(|((pid, start_time), executable)| ProcessIdentity {
                pid, start_time, executable: PathBuf::from(executable),
            });
        if let Some(identity) = identity {
            for folder in [Device::Cpu, Device::Vulkan].into_iter()
                .flat_map(|device| [self.folder(device), self.previous_protected_folder(device), self.protected_folder(device)]) {
                let expected = folder.join("sd-server");
                if expected.canonicalize().ok().as_ref() == Some(&identity.executable) {
                    if let Err(error) = stop_process_if_matches(&identity, &expected) {
                        log::warn!("Image server recovery: {error}");
                        return;
                    }
                    break;
                }
            }
        }
        let _ = fs::remove_file(self.marker());
    }

    fn remember(&self, server: &RunningServer, bin: &Path) -> Result<()> {
        let identity = inspect_process(server.pid)?;
        if identity.executable != bin.canonicalize()? {
            return Err("Unexpected image server executable".into());
        }
        fs::create_dir_all(&self.root)?;
        let tmp = self.marker().with_extension("tmp");
        fs::write(&tmp, format!("{}\n{}\n{}\n", identity.pid, identity.start_time, identity.executable.display()))?;
        fs::rename(tmp, self.marker())?;
        Ok(())
    }

    pub fn snapshot(&self) -> Value {
        let mut state = self.state.lock().unwrap();
        if state.server.as_mut().is_some_and(|server| !server.is_alive()) {
            state.server = None;
            state.phase = "stopped";
            let _ = fs::remove_file(self.marker());
        }
        let installed = self.runtime_folder(state.settings.device).join("sd-server").is_file();
        json!({
            "device": state.settings.device, "model": state.settings.model, "components": state.settings.components,
            "configured": state.settings.configured(), "generation": state.settings.generation,
            "installed": installed, "version": installed.then_some(VERSION),
            "phase": state.phase, "progress": state.progress, "busy": state.busy,
            "installing": state.installing, "pid": state.server.as_ref().map(|server| server.pid),
        })
    }

    pub fn save(&self, request: &Value) -> Result<()> {
        let next: Settings = serde_json::from_value(request.clone())?;
        next.validate_paths()?;
        if let Some(parameters) = &next.generation {
            validate_generation_settings(parameters)?;
        }
        let mut state = self.state.lock().unwrap();
        if state.busy || state.installing || self.closing.load(Ordering::Acquire) {
            return Err("Image backend is busy".into());
        }
        if next != state.settings {
            self.write_settings(&next)?;
            if next.device != state.settings.device || next.model != state.settings.model ||
                next.components != state.settings.components {
                self.stop_locked(&mut state);
            }
            state.settings = next;
        }
        Ok(())
    }

    fn write_settings(&self, settings: &Settings) -> Result<()> {
        let parent = self.config.parent().ok_or("Missing image settings directory")?;
        fs::create_dir_all(parent)?;
        let temp = self.config.with_extension("tmp");
        fs::write(&temp, serde_json::to_vec(settings)?)?;
        fs::rename(temp, &self.config)?;
        Ok(())
    }

    pub fn migrate_generation(&self, parameters: &Value) -> Result<Value> {
        let mut state = self.state.lock().unwrap();
        if let Some(saved) = &state.settings.generation {
            return Ok(saved.clone());
        }
        validate_generation_settings(parameters)?;
        let mut next = state.settings.clone();
        next.generation = Some(parameters.clone());
        self.write_settings(&next)?;
        state.settings = next;
        Ok(parameters.clone())
    }

    pub fn install(&self) -> Result<()> {
        let device = {
            let mut state = self.state.lock().unwrap();
            if state.installing || state.busy || self.closing.load(Ordering::Acquire) {
                return Err("Image backend is busy".into());
            }
            state.installing = true;
            state.settings.device
        };
        let outcome = self.install_device(device);
        self.state.lock().unwrap().installing = false;
        outcome
    }

    fn install_device(&self, device: Device) -> Result<()> {
        if !cfg!(all(target_os = "linux", target_arch = "x86_64")) {
            return Err("Image backend requires Linux x86-64".into());
        }
        let bundled = Self::bundled_runtime(device);
        let final_dir = if bundled.is_some() { self.protected_folder(device) } else { self.runtime_folder(device) };
        if probe(&final_dir).is_ok() && (bundled.is_none() || supports_memory_guard(&final_dir)) {
            return Ok(());
        }
        let parent = final_dir.parent().ok_or("Missing runtime directory")?;
        fs::create_dir_all(parent)?;
        let staging = tempfile::tempdir_in(parent)?;
        let zip_path = staging.path().join("runtime.zip");
        if let Some(bundle) = &bundled {
            use sha2::{Digest, Sha256};
            fs::copy(bundle.join("sd-server.zip"), &zip_path)?;
            let digest = fs::read_to_string(bundle.join("sd-server.zip.sha256"))?;
            let mut hash = Sha256::new();
            std::io::copy(&mut fs::File::open(&zip_path)?, &mut hash)?;
            if hex::encode(hash.finalize()) != digest.trim() {
                return Err("Protected image runtime SHA-256 mismatch".into());
            }
        } else {
            let (name, digest) = device.archive();
            let url = format!("https://github.com/leejet/stable-diffusion.cpp/releases/download/{VERSION}/{name}");
            engine::download_file_verified(&url, digest, &zip_path, &self.closing, &|_| {})?;
        }
        let unpacked = staging.path().join("unpacked");
        zip::ZipArchive::new(fs::File::open(zip_path)?)?.extract(&unpacked)?;
        probe(&unpacked)?;
        if bundled.is_some() && !supports_memory_guard(&unpacked) {
            return Err("Protected image runtime verification failed".into());
        }
        if self.closing.load(Ordering::Acquire) { return Err("Installation cancelled".into()); }
        let backup = staging.path().join("backup");
        if final_dir.exists() { fs::rename(&final_dir, &backup)?; }
        if let Err(error) = fs::rename(&unpacked, &final_dir) {
            if backup.exists() { fs::rename(&backup, &final_dir)?; }
            return Err(error.into());
        }
        Ok(())
    }

    pub fn stop(&self) {
        let mut state = self.state.lock().unwrap();
        state.cancel = true;
        self.stop_locked(&mut state);
    }

    pub fn shutdown(&self) {
        self.closing.store(true, Ordering::Release);
        self.stop();
    }

    fn stop_locked(&self, state: &mut State) {
        if let Some(mut server) = state.server.take() { server.stop(); }
        state.phase = "stopped";
        state.progress = Value::Null;
        let _ = fs::remove_file(self.marker());
    }

    pub fn cancel(&self) {
        let mut state = self.state.lock().unwrap();
        if state.busy { state.cancel = true; }
    }

    pub fn decode_export_png(data: &str) -> Option<Vec<u8>> {
        const MAX_PNG: usize = 128 * 1024 * 1024;
        if data.len() > MAX_PNG.div_ceil(3) * 4 {
            return None;
        }
        let bytes = STANDARD.decode(data).ok()?;
        (bytes.len() <= MAX_PNG && bytes.starts_with(PNG_HEADER)).then_some(bytes)
    }

    pub fn export_png(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
        use std::io::Write;
        let parent = path.parent().ok_or(std::io::ErrorKind::InvalidInput)?;
        let mut output = tempfile::NamedTempFile::new_in(parent)?;
        output.write_all(bytes)?;
        output.persist(path)?;
        Ok(())
    }

    pub fn generate(&self, request: &Value) -> Result<Value> {
        let payload = generation_payload(request)?;
        {
            let mut state = self.state.lock().unwrap();
            if state.busy || state.installing || self.closing.load(Ordering::Acquire) {
                return Err("Image backend is busy".into());
            }
            state.busy = true;
            state.cancel = false;
        }
        let response = self.run_generation(payload);
        let mut state = self.state.lock().unwrap();
        let response = if state.cancel && state.server.is_none() {
            Ok(json!({"cancelled": true}))
        } else {
            response
        };
        if response.is_err() {
            // A transport failure may leave an untracked job on the server.
            self.stop_locked(&mut state);
        }
        state.busy = false;
        state.progress = Value::Null;
        let message = match &response {
            Ok(value) => value["error"].as_str().map(str::to_owned),
            Err(error) => Some(error.to_string()),
        };
        if let Some((message, budget)) = message.as_deref().and_then(|message| {
            memory_diagnostic(message).map(|budget| (message, budget))
        }) {
            return Ok(json!({"error":message, "memoryBudget":budget}));
        }
        response
    }

    fn start(&self) -> Result<(u32, String)> {
        let mut state = self.state.lock().unwrap();
        if state.cancel || self.closing.load(Ordering::Acquire) { return Err("Image backend stopped".into()); }
        let dir = self.runtime_folder(state.settings.device);
        let bin = dir.join("sd-server");
        if let Some(server) = state.server.as_mut() {
            if server.is_alive() && bin.canonicalize().ok().is_some_and(|expected| {
                inspect_process(server.pid).is_ok_and(|process| process.executable == expected)
            }) {
                return Ok((server.pid, server.endpoint.clone()));
            }
        }
        self.stop_locked(&mut state);
        if !bin.is_file() { return Err("Install the selected image backend first".into()); }
        let port = pick_free_port()?;
        let mut args = vec![
            "--listen-ip".into(), "127.0.0.1".into(), "--listen-port".into(), port.to_string(),
        ];
        args.extend(state.settings.model_args()?);
        let server = RunningServer::start_with_env(&bin, &args, false, &[("LD_LIBRARY_PATH", dir.to_str().ok_or("Invalid runtime path")?)])?;
        self.remember(&server, &bin)?;
        let result = (server.pid, server.endpoint.clone());
        state.phase = "starting";
        state.server = Some(server);
        Ok(result)
    }

    fn request(&self, url: &str, path: &str, body: Option<Value>) -> Result<Value> {
        self.request_with_limit(url, path, body, MAX_BODY)
    }

    fn request_with_limit(&self, url: &str, path: &str, body: Option<Value>, limit: u64) -> Result<Value> {
        let url = format!("{url}{API}{path}");
        let mut response = match body {
            Some(value) => self.agent.post(url).send_json(value)?,
            None => self.agent.get(url).call()?,
        };
        let reader = response.body_mut().with_config().limit(limit).reader();
        Ok(serde_json::from_reader(reader)?)
    }

    fn run_generation(&self, payload: Value) -> Result<Value> {
        let device = self.state.lock().unwrap().settings.device;
        if !supports_memory_guard(&self.runtime_folder(device)) {
            if Self::bundled_runtime(device).is_some() {
                self.install_device(device)?;
            } else if !["width", "height"].into_iter().all(|key| {
                payload[key].as_u64().is_some_and(|value| (256..=1024).contains(&value) && value % 64 == 0)
            }) {
                return Ok(json!({"error":"omni_image_runtime_required"}));
            }
        }
        let (pid, url) = self.start()?;
        let port = url.rsplit(':').next().ok_or("Missing image server port")?.parse()?;
        let deadline = Instant::now() + Duration::from_secs(180);
        loop {
            {
                let mut state = self.state.lock().unwrap();
                let server = state.server.as_mut().ok_or("Image backend stopped")?;
                if !server.is_alive() {
                    let logs = server.logs.lines().join("\n");
                    if let Some(line) = logs.lines().rev().find_map(|line| {
                        line.find("omni_memory_budget ").map(|index| &line[index..])
                    }) {
                        return Err(line.to_owned().into());
                    }
                    return Err(logs.into());
                }
                if state.cancel {
                    if state.phase == "starting" {
                        self.stop_locked(&mut state);
                    }
                    return Ok(json!({"cancelled": true}));
                }
            }
            if owns_listener(pid, port) {
                if let Ok(status) = self.request(&url, "/capabilities", None) {
                    if status["supported_modes"].as_array().is_some_and(|modes| modes.iter().any(|mode| mode == "img_gen"))
                        && status["features"]["cancel_generating"] == true {
                        let limits = &status["limits"];
                        if let (Some(width), Some(height)) = (limits["max_width"].as_u64(), limits["max_height"].as_u64()) {
                            if payload["width"].as_u64().unwrap_or(u64::MAX) > width ||
                                payload["height"].as_u64().unwrap_or(u64::MAX) > height {
                                self.state.lock().unwrap().phase = "ready";
                                return Ok(json!({"error":format!("omni_image_range width={width} height={height}")}));
                            }
                        }
                        break;
                    }
                    return Err("Checkpoint or image server API is incompatible".into());
                }
            }
            if Instant::now() >= deadline { return Err("Image model did not load in time".into()); }
            thread::sleep(Duration::from_millis(200));
        }
        self.state.lock().unwrap().phase = "ready";

        let result_limit = result_body_limit(&payload)?;
        let job = self.request(&url, "/img_gen", Some(payload))?;
        let id = job["id"].as_str().filter(|s| !s.is_empty() && s.len() <= 128 &&
            s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-'))
            .ok_or("Invalid image job ID")?;
        let path = format!("/jobs/{id}");
        let mut cancel_sent = false;
        loop {
            let cancel = {
                let state = self.state.lock().unwrap();
                if state.server.is_none() { return Ok(json!({"cancelled": true})); }
                state.cancel
            };
            if !owns_listener(pid, port) { return Err("Image server exited".into()); }
            if cancel && !cancel_sent {
                self.request(&url, &format!("{path}/cancel"), Some(json!({})))?;
                cancel_sent = true;
            }
            let job = self.request_with_limit(&url, &path, None, result_limit)?;
            match job["status"].as_str() {
                Some("queued" | "generating") => {
                    self.state.lock().unwrap().progress = job["progress"].clone();
                }
                Some("completed") => {
                    let data = job["result"]["images"][0]["b64_json"].as_str().ok_or("Image result is missing")?;
                    let png = STANDARD.decode(data)?;
                    if !png.starts_with(PNG_HEADER) { return Err("Invalid PNG response".into()); }
                    let state = self.state.lock().unwrap();
                    if state.cancel { return Ok(json!({"cancelled": true})); }
                    return Ok(json!({ "png": data }));
                }
                Some("cancelled") => return Ok(json!({"cancelled": true})),
                Some("failed") => return Ok(json!({"error": job["error"]["message"].as_str().unwrap_or("Image generation failed")})),
                _ => return Err("Unexpected image job state".into()),
            }
            thread::sleep(Duration::from_millis(250));
        }
    }
}

fn memory_diagnostic(message: &str) -> Option<Value> {
    let mut fields = message.trim().strip_prefix("omni_memory_budget ")?.split_whitespace();
    let phase = fields.next()?.strip_prefix("phase=")?;
    let resource = fields.next()?.strip_prefix("resource=")?;
    if !matches!(phase, "load" | "generation") || !matches!(resource, "ram" | "vram" | "vram_unknown") {
        return None;
    }
    let required: u64 = fields.next()?.strip_prefix("required=")?.parse().ok()?;
    let available: u64 = fields.next()?.strip_prefix("available=")?.parse().ok()?;
    Some(json!({"phase":phase,"resource":resource,"required":required,"available":available}))
}

fn result_body_limit(payload: &Value) -> Result<u64> {
    let width = payload["width"].as_u64().ok_or("Missing image width")?;
    let height = payload["height"].as_u64().ok_or("Missing image height")?;
    // Eight bytes per pixel leave room for RGBA, PNG overhead and base64.
    width.checked_mul(height)
        .and_then(|pixels| pixels.checked_mul(8))
        .and_then(|bytes| bytes.checked_add(64 * 1024))
        .map(|bytes| bytes.max(MAX_BODY))
        .ok_or_else(|| "Image result size overflows the response budget".into())
}

fn validate_generation_settings(parameters: &Value) -> Result<()> {
    let mut request = parameters.as_object().cloned().ok_or("Invalid image generation settings")?;
    request.insert("prompt".into(), json!("Settings validation"));
    generation_payload(&Value::Object(request))?;
    Ok(())
}

fn generation_payload(request: &Value) -> Result<Value> {
    let prompt = request["prompt"].as_str().filter(|s| !s.trim().is_empty() && s.len() <= 16384)
        .ok_or("Image prompt is empty or too long")?;
    let dimension = |key: &str| request[key].as_u64()
        .filter(|value| (1..=i32::MAX as u64).contains(value))
        .ok_or("Image dimensions must be positive 32-bit integers");
    let (width, height) = (dimension("width")?, dimension("height")?);
    let steps = match request.get("steps") {
        None => 20,
        Some(value) => value.as_u64().filter(|steps| (1..=100).contains(steps))
            .ok_or("Steps must be between 1 and 100")?,
    };
    let mut payload = json!({
        "prompt": prompt, "width": width, "height": height,
        "batch_count": 1, "output_format": "png", "embed_image_metadata": false,
        "sample_params": {"sample_steps": steps},
    });
    if let Some(value) = request.get("sigmas") {
        let invalid = || "Enter 2 to 101 nonnegative numbers separated by commas, ending in 0";
        let text = value.as_str().filter(|text| text.len() <= 2048).ok_or_else(invalid)?;
        let sigmas = text.split(',').map(|item| {
            item.trim().parse::<f32>().ok().filter(|sigma| sigma.is_finite() && *sigma >= 0.0)
                .ok_or_else(invalid)
        }).collect::<std::result::Result<Vec<_>, _>>()?;
        if !(2..=101).contains(&sigmas.len()) || sigmas.last() != Some(&0.0) {
            return Err(invalid().into());
        }
        payload["sample_params"]["sample_steps"] = json!(sigmas.len() - 1);
        payload["sample_params"]["custom_sigmas"] = json!(sigmas);
    }
    if let Some(value) = request.get("negativePrompt") {
        let prompt = value.as_str().filter(|prompt| prompt.len() <= 16384)
            .ok_or("Negative prompt is too long")?;
        payload["negative_prompt"] = json!(prompt);
    }
    if let Some(value) = request.get("seed") {
        let seed = value.as_u64().filter(|seed| *seed <= u32::MAX.into())
            .ok_or("Seed must be between 0 and 4294967295")?;
        payload["seed"] = json!(seed);
    }
    if let Some(value) = request.get("sampler") {
        let sampler = value.as_str().filter(|sampler| matches!(*sampler, "euler" | "euler_a"))
            .ok_or("Invalid sampler")?;
        payload["sample_params"]["sample_method"] = json!(sampler);
    }
    if let Some(value) = request.get("cfg") {
        let cfg = value.as_f64().filter(|cfg| (0.0..=30.0).contains(cfg))
            .ok_or("CFG must be between 0 and 30")?;
        payload["sample_params"]["guidance"] = json!({"txt_cfg": cfg});
    }
    Ok(payload)
}

fn supports_memory_guard(dir: &Path) -> bool {
    Command::new(dir.join("sd-server")).arg("--omni-memory-protection")
        .env("LD_LIBRARY_PATH", dir).output()
        .is_ok_and(|output| output.status.success() && output.stdout == b"omni-memory-v2\n")
}

fn probe(dir: &Path) -> Result<()> {
    let output = Command::new(dir.join("sd-server")).arg("--version")
        .env("LD_LIBRARY_PATH", dir).output()?;
    let version = String::from_utf8_lossy(&output.stdout);
    if !output.status.success() || !version.contains("a3c49b1") {
        return Err(format!("Image runtime verification failed: {version} {}", String::from_utf8_lossy(&output.stderr)).into());
    }
    Ok(())
}

// Do not send prompts to a different process that happened to bind the selected port.
fn owns_listener(pid: u32, port: u16) -> bool {
    let address = format!("0100007F:{port:04X}");
    let Ok(table) = fs::read_to_string(format!("/proc/{pid}/net/tcp")) else { return false; };
    let inodes: HashSet<_> = table.lines().skip(1).filter_map(|line| {
        let fields: Vec<_> = line.split_whitespace().collect();
        (fields.get(1) == Some(&address.as_str()) && fields.get(3) == Some(&"0A"))
            .then(|| fields.get(9).copied()).flatten()
    }).map(|inode| format!("socket:[{inode}]")).collect();
    fs::read_dir(format!("/proc/{pid}/fd")).is_ok_and(|entries| entries.flatten().any(|entry| {
        fs::read_link(entry.path()).is_ok_and(|target| target.to_str().is_some_and(|value| inodes.contains(value)))
    }))
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generation_preferences_migrate_once_and_validate_before_writing() {
        let root = tempfile::tempdir().unwrap();
        let backend = ImageBackend {
            root: root.path().to_owned(),
            config: root.path().join("image-settings.json"),
            state: Mutex::new(State::default()),
            closing: AtomicBool::new(false),
            agent: ureq::Agent::new_with_defaults(),
        };
        assert!(backend.migrate_generation(&json!({"width": 0, "height": 512})).is_err());
        assert!(!backend.config.exists());
        let parameters = json!({"width":1920,"height":1080,"steps":30,"seed":0});
        assert_eq!(backend.migrate_generation(&parameters).unwrap(), parameters);
        assert_eq!(backend.migrate_generation(&json!({"width":10,"height":10})).unwrap(), parameters);
        let loaded: Settings = serde_json::from_slice(&fs::read(&backend.config).unwrap()).unwrap();
        assert_eq!(loaded.generation, Some(parameters));
    }

    #[test]
    fn export_accepts_the_selected_png_and_rejects_non_png_payloads() {
        let png = [PNG_HEADER, b"selected message"].concat();
        assert_eq!(ImageBackend::decode_export_png(&STANDARD.encode(&png)), Some(png));
        assert_eq!(ImageBackend::decode_export_png(&STANDARD.encode("not an image")), None);
        assert_eq!(ImageBackend::decode_export_png("not base64"), None);
    }

    #[test]
    fn keeps_complete_checkpoint_and_passes_split_weights() {
        let folder = tempfile::tempdir().unwrap();
        let weight = |name: &str| {
            let path = folder.path().join(name);
            fs::write(&path, []).unwrap();
            path
        };
        let mut settings = Settings {
            device: Device::Vulkan,
            model: Some(weight("sd15.safetensors")),
            ..Settings::default()
        };
        assert_eq!(settings.model_args().unwrap()[0], "-m");
        settings.components = Some(serde_json::from_value(json!({
            "diffusion": weight("qwen-Q4_0.gguf")
        })).unwrap());
        assert!(settings.validate_paths().is_ok());
        assert!(!settings.configured());
        assert!(settings.model_args().is_err());
        settings.components = Some(Components {
            diffusion: Some(weight("qwen-Q4_0.gguf")),
            encoder: Some(weight("encoder.gguf")),
            vae: Some(weight("vae.safetensors")),
        });
        assert!(settings.configured());
        let args = settings.model_args().unwrap();
        assert_eq!(args.iter().step_by(2).take(3).collect::<Vec<_>>(), ["--diffusion-model", "--llm", "--vae"]);
        assert!(args.contains(&"--offload-to-cpu".to_owned()));
        fs::remove_file(settings.components.as_ref().unwrap().vae.as_ref().unwrap()).unwrap();
        assert!(settings.model_args().is_err());
    }

    #[test]
    fn custom_noise_schedule_sets_steps_and_rejects_invalid_values() {
        let mut request = json!({"prompt":"a tree","width":512,"height":512,"sigmas":"1, 0.5, 0"});
        assert_eq!(generation_payload(&request).unwrap()["sample_params"], json!({
            "sample_steps": 2, "custom_sigmas": [1.0, 0.5, 0.0]
        }));
        for value in ["1", "1, 0.5", "1, -1, 0", "1,,0", "NaN, 0"] {
            request["sigmas"] = json!(value);
            assert!(generation_payload(&request).is_err(), "{value}");
        }
    }

    #[test]
    fn forwards_optional_generation_controls_and_preserves_defaults() {
        let base = json!({"prompt":"a tree","width":512,"height":512});
        let defaults = generation_payload(&base).unwrap();
        assert_eq!(defaults["sample_params"], json!({"sample_steps":20}));
        assert!(defaults.get("seed").is_none());

        let mut custom = base;
        custom["steps"] = json!(9);
        custom["seed"] = json!(42);
        custom["negativePrompt"] = json!("fog");
        custom["sampler"] = json!("euler_a");
        custom["cfg"] = json!(5.5);
        let payload = generation_payload(&custom).unwrap();
        assert_eq!(payload["sample_params"], json!({
            "sample_steps":9, "sample_method":"euler_a", "guidance":{"txt_cfg":5.5}
        }));
        assert_eq!(payload["seed"], 42);
        assert_eq!(payload["negative_prompt"], "fog");
        custom["steps"] = json!(0);
        assert!(generation_payload(&custom).is_err());
    }

    #[test]
    fn checks_that_the_listener_belongs_to_the_expected_process() {
        let socket = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = socket.local_addr().unwrap().port();
        assert!(owns_listener(std::process::id(), port));
        assert!(!owns_listener(u32::MAX, port));
        drop(socket);
        assert!(!owns_listener(std::process::id(), port));
    }

    #[test]
    fn exposes_structured_memory_diagnostics() {
        let budget = memory_diagnostic(
            "omni_memory_budget phase=generation resource=vram required=100 available=20",
        ).unwrap();
        assert_eq!(budget, json!({"phase":"generation","resource":"vram","required":100,"available":20}));
        assert!(memory_diagnostic("omni_memory_budget phase=unknown resource=ram required=1 available=0").is_none());
    }

    #[test]
    fn accepts_full_hd_without_a_fixed_alignment() {
        let mut request = json!({"prompt":"a tree","width":1920,"height":1080});
        let payload = generation_payload(&request).unwrap();
        assert_eq!(payload["width"], 1920);
        assert_eq!(payload["height"], 1080);
        request["height"] = json!(i32::MAX as u64 + 1);
        assert!(generation_payload(&request).is_err());
        request["height"] = json!(0);
        assert!(generation_payload(&request).is_err());
    }

    #[test]
    fn result_budget_scales_for_large_pngs() {
        let payload = json!({"width": 3840, "height": 2160});
        let budget = result_body_limit(&payload).unwrap();
        let rgba_bytes = 3840 * 2160 * 4;
        assert!(budget > rgba_bytes * 4 / 3);
        assert!(budget > MAX_BODY);
        assert!(result_body_limit(&json!({"width": u64::MAX, "height": 2})).is_err());
    }

    #[test]
    fn reads_and_exports_png_larger_than_the_control_response_limit() {
        use std::io::{Read, Write};
        use flate2::{write::ZlibEncoder, Compression, Crc};

        fn chunk(png: &mut Vec<u8>, name: &[u8; 4], data: &[u8]) {
            let mut crc = Crc::new();
            crc.update(name);
            crc.update(data);
            png.extend((data.len() as u32).to_be_bytes());
            png.extend(name);
            png.extend(data);
            png.extend(crc.sum().to_be_bytes());
        }

        let (width, height) = (4096u32, 1100u32);
        let mut png = PNG_HEADER.to_vec();
        let mut header = Vec::from(width.to_be_bytes());
        header.extend(height.to_be_bytes());
        header.extend([8, 2, 0, 0, 0]);
        chunk(&mut png, b"IHDR", &header);
        let mut zlib = ZlibEncoder::new(Vec::new(), Compression::none());
        let scanline = vec![0; 1 + width as usize * 3];
        for _ in 0..height {
            zlib.write_all(&scanline).unwrap();
        }
        chunk(&mut png, b"IDAT", &zlib.finish().unwrap());
        chunk(&mut png, b"IEND", &[]);
        assert!(png.len() as u64 > MAX_BODY);
        let body = json!({"status":"completed", "result":{"images":[{"b64_json":STANDARD.encode(&png)}]}}).to_string();
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let worker = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut request = [0; 1024];
            assert!(socket.read(&mut request).unwrap() > 0);
            write!(socket, "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len()).unwrap();
            socket.write_all(body.as_bytes()).unwrap();
        });
        let folder = tempfile::tempdir().unwrap();
        let backend = ImageBackend {
            state: Mutex::new(State::default()), root: folder.path().to_owned(),
            config: folder.path().join("config.json"), closing: AtomicBool::new(false),
            agent: ureq::Agent::config_builder().proxy(None).build().new_agent(),
        };
        let limit = result_body_limit(&json!({"width":width,"height":height})).unwrap();
        let result = backend.request_with_limit(&url, "/jobs/test", None, limit).unwrap();
        let received = STANDARD.decode(result["result"]["images"][0]["b64_json"].as_str().unwrap()).unwrap();
        let destination = folder.path().join("large.png");
        ImageBackend::export_png(&destination, &received).unwrap();
        assert_eq!(fs::read(destination).unwrap(), png);
        worker.join().unwrap();
    }

    #[test]
    fn exports_the_exact_bytes_and_leaves_no_temporary_file() {
        let folder = tempfile::tempdir().unwrap();
        let destination = folder.path().join("generated.png");
        fs::write(&destination, b"old result").unwrap();
        ImageBackend::export_png(&destination, PNG_HEADER).unwrap();
        assert_eq!(fs::read(&destination).unwrap(), PNG_HEADER);
        assert_eq!(fs::read_dir(folder.path()).unwrap().count(), 1);
    }
}
