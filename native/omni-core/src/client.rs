//! Cliente HTTP mínimo para o backend llama.cpp em execução.

use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum ClientError {
    #[error("sem resposta do servidor: {0}")]
    Transport(String),
    #[error("erro HTTP {0}")]
    Http(u16),
    #[error("resposta inválida: {0}")]
    Invalid(String),
    #[error("timeout")]
    Timeout,
    #[error("cancelado pelo usuário")]
    Cancelled,
    #[error("erro do servidor durante o stream: {0}")]
    Stream(String),
}

fn map_ureq(e: ureq::Error) -> ClientError {
    let msg = e.to_string();
    if let Some(code) = msg.strip_prefix("http status: ") {
        if let Ok(c) = code.trim().parse::<u16>() {
            return ClientError::Http(c);
        }
    }
    ClientError::Transport(msg)
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(60)))
        .build()
        .new_agent()
}

/// `GET /health`.
pub fn health(base: &str) -> bool {
    let url = format!("{base}/health");
    match agent().get(&url).call() {
        Ok(resp) => resp.status() == 200,
        Err(_) => false,
    }
}

/// `GET /health` com timeout global curto (uso em decisões de backend sem
/// bloquear a UI por muito tempo).
pub fn health_timeout(base: &str, timeout: Duration) -> bool {
    let url = format!("{base}/health");
    let agent = ureq::Agent::config_builder()
        .timeout_connect(Some(Duration::from_secs(1)))
        .timeout_global(Some(timeout))
        .build()
        .new_agent();
    match agent.get(&url).call() {
        Ok(resp) => resp.status() == 200,
        Err(_) => false,
    }
}

/// `GET /v1/models` (primeiro id) com timeout global curto.
pub fn first_model_id_timeout(base: &str, timeout: Duration) -> Option<String> {
    let url = format!("{base}/v1/models");
    let agent = ureq::Agent::config_builder()
        .timeout_connect(Some(Duration::from_secs(1)))
        .timeout_global(Some(timeout))
        .build()
        .new_agent();
    let resp = agent.get(&url).call().ok()?;
    let mut text = String::new();
    resp.into_body()
        .into_reader()
        .read_to_string(&mut text)
        .ok()?;
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    v.get("data")?
        .as_array()?
        .first()?
        .get("id")?
        .as_str()
        .map(str::to_string)
}

/// `GET /v1/models` — devolve o id do primeiro modelo (ou None).
pub fn first_model_id(base: &str) -> Option<String> {
    let url = format!("{base}/v1/models");
    let resp = agent().get(&url).call().ok()?;
    let mut text = String::new();
    resp.into_body()
        .into_reader()
        .read_to_string(&mut text)
        .ok()?;
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    v.get("data")?
        .as_array()?
        .first()?
        .get("id")?
        .as_str()
        .map(str::to_string)
}

/// `POST /v1/chat/completions` com streaming; devolve o texto acumulado.
pub fn chat_text(base: &str, prompt: &str, max_tokens: u32) -> Result<String, ClientError> {
    let messages = serde_json::json!([{"role": "user", "content": prompt}]);
    chat_stream(base, &messages, max_tokens, &AtomicBool::new(false), &mut |_| true)
}

/// `POST /v1/chat/completions` com streaming progressivo.
///
/// - `messages`: histórico OpenAI completo (o caller monta).
/// - `cancel`: quando marcado, interrompe a leitura e retorna `Cancelled`.
/// - `on_delta` recebe cada fragmento de texto; retornar `false` interrompe
///   a leitura como se fosse um cancelamento.
/// - O parse é robusto a chunks que cortam linhas / caracteres UTF-8.
pub fn chat_stream(
    base: &str,
    messages: &serde_json::Value,
    max_tokens: u32,
    cancel: &AtomicBool,
    on_delta: &mut dyn FnMut(&str) -> bool,
) -> Result<String, ClientError> {
    let body = serde_json::json!({
        "model": "default",
        "messages": messages,
        "stream": true,
        "max_tokens": max_tokens,
    });
    let url = format!("{base}/v1/chat/completions");
    let resp = agent()
        .post(&url)
        .send_json(body)
        .map_err(map_ureq)?;
    if resp.status() != 200 {
        return Err(ClientError::Http(resp.status().as_u16()));
    }
    let mut reader = resp.into_body().into_reader();
    let mut buf: Vec<u8> = Vec::new();
    let mut text = String::new();
    let mut chunk = [0u8; 8192];
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err(ClientError::Cancelled);
        }
        let n = reader
            .read(&mut chunk)
            .map_err(|e| ClientError::Transport(e.to_string()))?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
        while let Some(idx) = buf.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = buf.drain(..=idx).collect();
            let line = String::from_utf8_lossy(&line);
            let line = line.trim();
            if !line.starts_with("data:") {
                continue;
            }
            let data = line[5..].trim();
            if data == "[DONE]" {
                return Ok(text);
            }
            let Ok(j) = serde_json::from_str::<serde_json::Value>(data) else {
                continue;
            };
            if let Some(err) = j.get("error") {
                return Err(ClientError::Stream(
                    err.get("message")
                        .and_then(|m| m.as_str())
                        .unwrap_or("erro do servidor")
                        .to_string(),
                ));
            }
            if let Some(delta) = j
                .get("choices")
                .and_then(|c| c.get(0))
                .and_then(|c| c.get("delta"))
                .and_then(|d| d.get("content"))
                .and_then(|d| d.as_str())
            {
                text.push_str(delta);
                if !on_delta(delta) {
                    return Err(ClientError::Cancelled);
                }
            }
        }
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write as _;

    fn fake_sse_server(body: &'static str, delay_ms: Option<u64>) -> String {
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let url = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
        std::thread::spawn(move || {
            if let Ok((mut sock, _)) = listener.accept() {
                let mut buf = [0u8; 4096];
                let _ = sock.read(&mut buf);
                let head = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = sock.write_all(head.as_bytes());
                if let Some(ms) = delay_ms {
                    // envia em pedaços pequenos para simular chunks cortados
                    for chunk in body.as_bytes().chunks(7) {
                        let _ = sock.write_all(chunk);
                        std::thread::sleep(Duration::from_millis(ms));
                    }
                } else {
                    let _ = sock.write_all(body.as_bytes());
                }
            }
        });
        url
    }

    #[test]
    fn stream_parcial_chunks_cortados() {
        let body = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"Olá \"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"mundo \"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"😀\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"\"},\"finish_reason\":\"stop\"}]}\n\n",
            "data: [DONE]\n\n",
        );
        let url = fake_sse_server(body, Some(2));
        let mut acc = String::new();
        let out = chat_stream(
            &url,
            &serde_json::json!([{"role":"user","content":"oi"}]),
            64,
            &AtomicBool::new(false),
            &mut |d| {
                acc.push_str(d);
                true
            },
        )
        .unwrap();
        assert_eq!(out, "Olá mundo 😀");
        assert_eq!(acc, out);
    }

    #[test]
    fn stream_respeita_cancelamento() {
        let body = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"a\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"b\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"c\"}}]}\n\n",
        );
        let url = fake_sse_server(body, Some(4));
        let cancel = std::sync::Arc::new(AtomicBool::new(false));
        {
            let cancel = cancel.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(25));
                cancel.store(true, Ordering::SeqCst);
            });
        }
        let res = chat_stream(
            &url,
            &serde_json::json!([]),
            64,
            cancel.as_ref(),
            &mut |_| true,
        );
        assert!(matches!(res, Err(ClientError::Cancelled)));
    }

    #[test]
    fn stream_erro_http() {
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let url = format!("http://127.0.0.1:{}", listener.local_addr().unwrap().port());
        std::thread::spawn(move || {
            if let Ok((mut sock, _)) = listener.accept() {
                let mut buf = [0u8; 4096];
                let _ = sock.read(&mut buf);
                let _ = sock.write_all(
                    b"HTTP/1.1 500 Internal Server Error\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
                );
            }
        });
        let res = chat_stream(
            &url,
            &serde_json::json!([]),
            64,
            &AtomicBool::new(false),
            &mut |_| true,
        );
        assert!(matches!(res, Err(ClientError::Http(500))));
    }
}
