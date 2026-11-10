//! Controle do processo `llama-server` (filho direto, sem shell).

use std::io::BufRead;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use thiserror::Error;

#[derive(Debug, Error)]
pub enum ProcessError {
    #[error("erro de I/O: {0}")]
    Io(#[from] std::io::Error),
    #[error("servidor não respondeu no tempo limite")]
    Timeout,
    #[error("servidor encerrou inesperadamente (código {0})")]
    UnexpectedExit(i32),
}

pub const LOG_LIMIT: usize = 2000;

#[derive(Clone)]
pub struct LogRing {
    inner: Arc<Mutex<Vec<String>>>,
}

impl LogRing {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(Vec::new())),
        }
    }
    pub fn push(&self, line: String) {
        let mut v = self.inner.lock().unwrap();
        if v.len() >= LOG_LIMIT {
            v.remove(0);
        }
        v.push(line);
    }
    pub fn lines(&self) -> Vec<String> {
        self.inner.lock().unwrap().clone()
    }
    pub fn contains(&self, needle: &str) -> bool {
        self.inner
            .lock()
            .unwrap()
            .iter()
            .any(|l| l.to_lowercase().contains(&needle.to_lowercase()))
    }
}

/// Reserva uma porta livre em `127.0.0.1`.
pub fn pick_free_port() -> std::io::Result<u16> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0))?;
    Ok(listener.local_addr()?.port())
}

#[derive(Debug, Clone)]
pub struct ProcessIdentity {
    pub pid: u32,
    pub start_time: u64,
    pub executable: PathBuf,
}

/// Lê uma identidade que permanece distinta mesmo que o sistema reutilize PID.
pub fn inspect_process(pid: u32) -> std::io::Result<ProcessIdentity> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat"))?;
    let fields = stat
        .rsplit_once(") ")
        .map(|(_, tail)| tail.split_whitespace().collect::<Vec<_>>())
        .ok_or_else(|| std::io::Error::other("formato inválido em /proc/<pid>/stat"))?;
    // O sufixo começa no campo 3 (state); starttime é o campo 22.
    let start_time = fields
        .get(19)
        .and_then(|s| s.parse::<u64>().ok())
        .ok_or_else(|| std::io::Error::other("starttime ausente em /proc/<pid>/stat"))?;
    let executable = std::fs::read_link(format!("/proc/{pid}/exe"))?;
    Ok(ProcessIdentity { pid, start_time, executable })
}

/// Encerra um PID apenas se ainda for o mesmo processo e executável verificados.
pub fn stop_process_if_matches(
    identity: &ProcessIdentity,
    expected_executable: &Path,
) -> std::io::Result<bool> {
    let expected = expected_executable.canonicalize()?;
    let matches = |current: &std::io::Result<ProcessIdentity>| match current {
        Ok(current) => {
            current.start_time == identity.start_time
                && current.executable.canonicalize().ok().as_ref() == Some(&expected)
        }
        Err(_) => false,
    };

    if !matches(&inspect_process(identity.pid)) {
        return Ok(false);
    }
    unsafe { libc::kill(identity.pid as libc::pid_t, libc::SIGTERM); }
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        if !matches(&inspect_process(identity.pid)) {
            return Ok(true);
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    if matches(&inspect_process(identity.pid)) {
        unsafe { libc::kill(identity.pid as libc::pid_t, libc::SIGKILL); }
    }
    let deadline = Instant::now() + Duration::from_secs(1);
    while Instant::now() < deadline {
        if !matches(&inspect_process(identity.pid)) {
            return Ok(true);
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    Ok(false)
}

/// Localiza sobras de versões anteriores, que ainda não escreviam um arquivo
/// de sessão. Exige o binário integrado, o modo `serve`, o mesmo modelo e a
/// origem CORS local usada pelo app.
pub fn find_managed_server_processes(
    executable: &Path,
    model: &Path,
) -> std::io::Result<Vec<ProcessIdentity>> {
    let expected_executable = executable.canonicalize()?;
    let expected_model = model.canonicalize().ok();
    let mut found = Vec::new();
    for entry in std::fs::read_dir("/proc")? {
        let Ok(entry) = entry else { continue };
        let Some(pid) = entry.file_name().to_str().and_then(|s| s.parse::<u32>().ok()) else {
            continue;
        };
        let Ok(identity) = inspect_process(pid) else { continue };
        if identity.executable.canonicalize().ok().as_ref() != Some(&expected_executable) {
            continue;
        }
        let Ok(raw_args) = std::fs::read(format!("/proc/{pid}/cmdline")) else { continue };
        let args = raw_args
            .split(|b| *b == 0)
            .filter(|part| !part.is_empty())
            .map(|part| String::from_utf8_lossy(part).into_owned())
            .collect::<Vec<_>>();
        let is_server = args.iter().any(|a| a == "serve");
        let model_matches = args.windows(2).any(|pair| {
            if pair[0] != "-m" && pair[0] != "--model" { return false; }
            let candidate = Path::new(&pair[1]).canonicalize().ok();
            candidate.is_some() && candidate == expected_model
        });
        let app_origin = args.windows(2).any(|pair| {
            pair[0] == "--cors-origins" && pair[1].starts_with("http://127.0.0.1:")
        });
        if is_server && model_matches && app_origin {
            found.push(identity);
        }
    }
    Ok(found)
}

pub struct RunningServer {
    child: Child,
    pub pid: u32,
    pub endpoint: String,
    pub logs: LogRing,
    stopped: Arc<AtomicBool>,
}

impl RunningServer {
    /// Inicia `llama-server` com argumentos estruturados e aguarda `/health`.
    pub fn start(
        bin: &Path,
        args: &[String],
        wait_health: bool,
    ) -> Result<Self, ProcessError> {
        Self::start_with_env(bin, args, wait_health, &[])
    }

    /// Como [`RunningServer::start`], permitindo definir variáveis de
    /// ambiente do processo filho (ex.: `LD_LIBRARY_PATH` para libs
    /// isoladas do backend integrado).
    pub fn start_with_env(
        bin: &Path,
        args: &[String],
        wait_health: bool,
        env: &[(&str, &str)],
    ) -> Result<Self, ProcessError> {
        let mut cmd = Command::new(bin);
        cmd.args(args)
            .envs(env.iter().copied())
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = cmd.spawn()?;
        let pid = child.id();

        let logs = LogRing::new();
        let out = child.stdout.take().expect("stdout");
        let err = child.stderr.take().expect("stderr");
        let l1 = logs.clone();
        let l2 = logs.clone();
        std::thread::spawn(move || {
            for line in std::io::BufReader::new(out).lines().map_while(Result::ok) {
                l1.push(line);
            }
        });
        std::thread::spawn(move || {
            for line in std::io::BufReader::new(err).lines().map_while(Result::ok) {
                l2.push(line);
            }
        });

        if wait_health {
            let deadline = Instant::now() + Duration::from_secs(120);
            let endpoint = endpoint_from_args(args);
            loop {
                if let Some(st) = child.try_wait()? {
                    return Err(ProcessError::UnexpectedExit(
                        st.code().unwrap_or(-1),
                    ));
                }
                if crate::client::health(&endpoint) {
                    break;
                }
                if Instant::now() > deadline {
                    let _ = child.kill();
                    return Err(ProcessError::Timeout);
                }
                std::thread::sleep(Duration::from_millis(400));
            }
        }

        Ok(Self {
            child,
            pid,
            endpoint: endpoint_from_args(args),
            logs,
            stopped: Arc::new(AtomicBool::new(false)),
        })
    }

    pub fn is_alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    /// Encerramento gracioso (SIGTERM) com fallback forçado (SIGKILL).
    pub fn stop(&mut self) {
        if self.stopped.swap(true, Ordering::SeqCst) {
            return;
        }
        if matches!(self.child.try_wait(), Ok(Some(_))) {
            return;
        }
        unsafe {
            libc::kill(self.pid as libc::pid_t, libc::SIGTERM);
        }
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if let Ok(Some(_)) = self.child.try_wait() {
                let _ = self.child.wait();
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Drop for RunningServer {
    fn drop(&mut self) {
        self.stop();
    }
}

fn endpoint_from_args(args: &[String]) -> String {
    let mut host = "127.0.0.1".to_string();
    let mut port = "8080".to_string();
    let mut i = 0;
    while i + 1 < args.len() {
        match args[i].as_str() {
            "--host" | "--listen-ip" => host = args[i + 1].clone(),
            "--port" | "--listen-port" => port = args[i + 1].clone(),
            _ => {}
        }
        i += 1;
    }
    format!("http://{host}:{port}")
}
