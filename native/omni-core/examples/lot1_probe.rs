//! Lote 1 — sonda de paridade nativa × Web.
//!
//! Uso: cargo run -p omni-core --example lot1_probe -- <endpoint>
//!
//! Reconstrói exatamente os payloads que o chat envia (system prompt +
//! histórico), executa os mesmos cenários A1/A3 contra um endpoint
//! compartilhado e imprime os payloads em JSON (para comparação com a Web).

use omni_core::client::{chat_stream, first_model_id, health};
use omni_core::prompts;
use std::sync::atomic::AtomicBool;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let ep = args.first().cloned().unwrap_or_else(|| "http://127.0.0.1:18099".to_string());
    assert!(health(&ep), "backend não está acessível");
    println!("MODELO: {:?}", first_model_id(&ep));

    let system = prompts::build_system_prompt();
    let msg_user = |t: &str| serde_json::json!({"role":"user","content":t});
    let msg_asst = |t: &str| serde_json::json!({"role":"assistant","content":t});

    // A1 — payload da primeira pergunta (igual ao que o chat monta)
    let msgs1 = serde_json::json!([
        {"role":"system","content":system.clone()},
        msg_user("Qual é a capital do Brasil?"),
    ]);
    println!("PAYLOAD_A1={}", serde_json::to_string(&msgs1).unwrap());
    let r1 = chat_stream(&ep, &msgs1, 128, &AtomicBool::new(false), &mut |_| true).unwrap();
    println!("A1_RESPOSTA={r1}");

    // A3 — segunda pergunta com histórico completo
    let msgs3 = serde_json::json!([
        {"role":"system","content":system.clone()},
        msg_user("Qual é a capital do Brasil?"),
        msg_asst(&r1),
        msg_user("E qual é a capital da Argentina?"),
    ]);
    println!("PAYLOAD_A3={}", serde_json::to_string(&msgs3).unwrap());
    let r3 = chat_stream(&ep, &msgs3, 128, &AtomicBool::new(false), &mut |_| true).unwrap();
    println!("A3_RESPOSTA={r3}");
}
