//! Servidor HTTP mínimo, limitado a `127.0.0.1`, que serve exclusivamente
//! os arquivos do site da Parte 1 (origem local controlada).
//!
//! Não escuta em interfaces externas, não lista diretórios, bloqueia
//! traversal de caminho e não implementa proxy genérico para o backend.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::thread;

pub struct SiteServer {
    pub base_url: String,
}

impl SiteServer {
    /// Sobe o servidor num porta efêmera do loopback e devolve a base URL.
    pub fn start(root: PathBuf) -> std::io::Result<Self> {
        let listener = TcpListener::bind(("127.0.0.1", 0))?;
        let port = listener.local_addr()?.port();
        thread::spawn(move || {
            for stream in listener.incoming() {
                match stream {
                    Ok(s) => {
                        let root = root.clone();
                        thread::spawn(move || handle(&root, s));
                    }
                    Err(_) => break,
                }
            }
        });
        Ok(Self {
            base_url: format!("http://127.0.0.1:{port}"),
        })
    }
}

fn handle(root: &Path, mut stream: TcpStream) {
    let mut buf = [0u8; 8192];
    let n = match stream.read(&mut buf) {
        Ok(n) if n > 0 => n,
        _ => return,
    };
    let head = String::from_utf8_lossy(&buf[..n]);
    let req_line = head.lines().next().unwrap_or("");
    let mut parts = req_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("/");
    if method != "GET" && method != "HEAD" {
        respond(&mut stream, 405, "text/plain; charset=utf-8", b"method not allowed");
        return;
    }

    let rel = decode_path(target);
    let mut safe = PathBuf::new();
    for comp in rel.split('/') {
        if comp.is_empty() || comp == "." {
            continue;
        }
        if comp == ".." {
            respond(&mut stream, 404, "text/plain; charset=utf-8", b"not found");
            return;
        }
        safe.push(comp);
    }

    let mut file = root.join(&safe);
    if safe.as_os_str().is_empty() {
        file = root.join("index.html");
    } else if file.is_dir() {
        file = file.join("index.html");
    }
    if !file.is_file() {
        respond(&mut stream, 404, "text/plain; charset=utf-8", b"not found");
        return;
    }
    let data = match std::fs::read(&file) {
        Ok(d) => d,
        Err(_) => {
            respond(
                &mut stream,
                500,
                "text/plain; charset=utf-8",
                b"internal error",
            );
            return;
        }
    };
    respond(&mut stream, 200, mime_for(&file), &data);
}

fn respond(stream: &mut TcpStream, status: u16, mime: &str, body: &[u8]) {
    let reason = match status {
        200 => "OK",
        404 => "Not Found",
        405 => "Method Not Allowed",
        500 => "Internal Server Error",
        _ => "",
    };
    let header = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}

fn decode_path(target: &str) -> String {
    // Descodifica %XX mínimos; '+' permanece literal (sem formulários).
    let bytes = target.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

fn mime_for(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "m4a" => "audio/mp4",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}
