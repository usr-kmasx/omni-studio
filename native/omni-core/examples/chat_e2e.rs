//! E2E da Etapa 4 — chat nativo contra runtime gerenciado b12110.
//!
//! Uso: cargo run -p omni-core --example chat_e2e -- <model.gguf> [mmproj.gguf]
//!
//! Executa: health → modelo → chat streaming (A) → contexto (B) → idioma (C)
//! → cancelamento (D) → backend indisponível/recuperação (E) → troca/reinício
//! com processo novo (F) → encerramento sem órfãos (G).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use omni_core::client::{self, chat_stream, ClientError};
use omni_core::engine;
use omni_core::paths;
use omni_core::process::{pick_free_port, RunningServer};
use omni_core::settings::Settings;

fn find_bin() -> std::path::PathBuf {
    let managed = paths::managed_runtime_dir().join("llama-server");
    if managed.is_file() {
        return managed;
    }
    let known = std::path::PathBuf::from("/tmp/llama_runtime_test/llama-b12110/llama-server");
    if known.is_file() {
        return known;
    }
    let base = std::path::PathBuf::from("/tmp/omni_chat_e2e");
    std::env::set_var("XDG_DATA_HOME", base.join("data"));
    std::env::set_var("XDG_CONFIG_HOME", base.join("config"));
    std::env::set_var("XDG_CACHE_HOME", base.join("cache"));
    let cancel = AtomicBool::new(false);
    engine::install_managed(&cancel, &|_| {}).expect("instalação falhou");
    managed
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() {
        eprintln!("uso: chat_e2e <model.gguf> [mmproj.gguf]");
        std::process::exit(2);
    }
    let model = std::path::PathBuf::from(&args[0]);
    let mmproj = args.get(1).map(std::path::PathBuf::from);
    assert!(model.is_file(), "modelo não encontrado");

    let bin = find_bin();
    let port = pick_free_port().unwrap();
    let args = engine::server_args(&model, mmproj.as_deref(), port);
    let mut server = RunningServer::start(&bin, &args, true).expect("iniciar servidor");
    let ep = server.endpoint.clone();
    println!("EP={ep} pid={}", server.pid);

    // A: health + modelo + pergunta
    assert!(client::health(&ep));
    println!("MODELO: {:?}", client::first_model_id(&ep));

    let msg_user = |t: &str| serde_json::json!({"role":"user","content":t});
    let msg_asst = |t: &str| serde_json::json!({"role":"assistant","content":t});

    let r1 = chat_stream(&ep, &serde_json::json!([msg_user("Qual é a capital do Brasil?")]), 128, &AtomicBool::new(false), &mut |_| true).unwrap();
    println!("A: {r1}");
    assert!(r1.to_lowercase().contains("brasília"));

    // B: contexto (inclui histórico completo)
    let msgs_b = serde_json::json!([
        msg_user("Qual é a capital do Brasil?"),
        msg_asst(&r1),
        msg_user("E qual é a capital da Argentina?"),
    ]);
    let r2 = chat_stream(&ep, &msgs_b, 128, &AtomicBool::new(false), &mut |_| true).unwrap();
    println!("B: {r2}");
    assert!(r2.to_lowercase().contains("buenos aires"));

    // C: idioma (pergunta em inglês com histórico preservado)
    let msgs_c = serde_json::json!([
        msg_user("Qual é a capital do Brasil?"),
        msg_asst(&r1),
        msg_user("E qual é a capital da Argentina?"),
        msg_asst(&r2),
        msg_user("What is the capital of Canada?"),
    ]);
    let r3 = chat_stream(&ep, &msgs_c, 128, &AtomicBool::new(false), &mut |_| true).unwrap();
    println!("C: {r3}");
    assert!(r3.to_lowercase().contains("ottawa"));

    // D: cancelamento real
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let cancel = cancel.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(400));
            cancel.store(true, Ordering::SeqCst);
        });
    }
    let mut partial = String::new();
    let r4 = chat_stream(&ep, &serde_json::json!([msg_user("Escreva uma longa explicação sobre o ciclo da água.")]), 512, cancel.as_ref(), &mut |d| {
        partial.push_str(d);
        true
    });
    println!("D: cancelado={} parcial_len={}", matches!(r4, Err(ClientError::Cancelled)), partial.len());
    assert!(matches!(r4, Err(ClientError::Cancelled)));
    let r4b = chat_stream(&ep, &serde_json::json!([msg_user("Diga apenas: ok.")]), 64, &AtomicBool::new(false), &mut |_| true).unwrap();
    assert!(r4b.to_lowercase().contains("ok"));
    println!("D+: recuperou após cancelar -> {r4b}");

    // E: backend indisponível → erro claro → restaura
    let dead = format!("http://127.0.0.1:{}", pick_free_port().unwrap());
    let r5 = chat_stream(&dead, &serde_json::json!([msg_user("oi")]), 64, &AtomicBool::new(false), &mut |_| true);
    assert!(matches!(r5, Err(ClientError::Transport(_)) | Err(ClientError::Http(_))));
    println!("E: erro esperado={:?}", r5.is_err());
    let r5b = chat_stream(&ep, &serde_json::json!([msg_user("Diga apenas: ok.")]), 64, &AtomicBool::new(false), &mut |_| true).unwrap();
    assert!(r5b.to_lowercase().contains("ok"));

    // F: troca/reinício (mesmo modelo) → novo processo e modelo carregado
    let old_pid = server.pid;
    server.stop();
    let port2 = pick_free_port().unwrap();
    let args2 = engine::server_args(&model, mmproj.as_deref(), port2);
    let mut server2 = RunningServer::start(&bin, &args2, true).expect("reinício falhou");
    assert_ne!(server2.pid, old_pid);
    assert!(client::health(&server2.endpoint));
    println!("F: novo pid={} old={}", server2.pid, old_pid);
    server2.stop();

    // G: sem órfãos (processo encerrado; try_wait ok)
    std::thread::sleep(Duration::from_millis(300));
    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(3) {
        if !server.is_alive() && !server2.is_alive() {
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    assert!(!server.is_alive() && !server2.is_alive(), "processos órfãos");
    println!("G: sem órfãos");

    let mut settings = Settings::load();
    settings.model_gguf = Some(model.display().to_string());
    settings.model_mmproj = mmproj.as_ref().map(|p| p.display().to_string());
    let _ = settings.save();
    println!("CHAT E2E OK");
}
