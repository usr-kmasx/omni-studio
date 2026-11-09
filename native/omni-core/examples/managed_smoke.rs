//! Smoke test E2E do gerenciador de runtime (Etapa 2).
//!
//! Uso: cargo run -p omni-core --example managed_smoke -- <model.gguf> [mmproj.gguf]
//!
//! Realiza, em diretórios XDG isolados em /tmp:
//!   1. detecção de runtime externo (PATH);
//!   2. instalação gerenciada sob demanda (download real b12110, SHA256);
//!   3. início do servo com modelo indicado, porta dinâmica, bind 127.0.0.1;
//!   4. /health, /v1/models, pergunta curta com streaming;
//!   5. encerramento gracioso e reinício;
//!   6. desinstalação (remove apenas o diretório gerenciado).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use omni_core::client;
use omni_core::engine;
use omni_core::paths;
use omni_core::process::{pick_free_port, RunningServer};
use omni_core::settings::Settings;

fn main() {
    // Isolamento: XDG apontando para /tmp (não toca em dados reais).
    let base = std::path::PathBuf::from("/tmp/omni_e2e");
    let _ = std::fs::remove_dir_all(&base);
    std::env::set_var("XDG_DATA_HOME", base.join("data"));
    std::env::set_var("XDG_CONFIG_HOME", base.join("config"));
    std::env::set_var("XDG_CACHE_HOME", base.join("cache"));

    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() {
        eprintln!("uso: managed_smoke <model.gguf> [mmproj.gguf]");
        std::process::exit(2);
    }
    let model = std::path::PathBuf::from(&args[0]);
    let mmproj = args.get(1).map(std::path::PathBuf::from);

    // 1) detecção externa
    match engine::detect_external(None) {
        Some(info) => println!("EXTERNO detectado: {} | versão: {:?}", info.path.display(), info.version),
        None => println!("EXTERNO não detectado no PATH"),
    }

    // 2) instalação gerenciada
    println!("INSTALANDO runtime gerenciado (b12110)…");
    let cancel = AtomicBool::new(false);
    let progress = |p: &engine::DownloadProgress| {
        if let Some(t) = p.total {
            if t > 0 && p.done % (t / 20) < 65536 {
                print!("{}% ", 100 * p.done / t);
                use std::io::Write;
                let _ = std::io::stdout().flush();
            }
        }
    };
    let meta = engine::install_managed(&cancel, &progress).expect("instalação falhou");
    println!("\nINSTALADO: {} em {}", meta.version, meta.dir);
    let bin = paths::managed_runtime_dir().join("llama-server");
    assert!(bin.is_file(), "llama-server ausente após instalação");

    // 1b) detecção externa com PATH fake (simula instalação externa)
    {
        use std::os::unix::fs::PermissionsExt;
        let fake = std::path::PathBuf::from("/tmp/omni_e2e/fakebin");
        std::fs::create_dir_all(&fake).unwrap();
        std::fs::write(
            fake.join("llama-server"),
            "#!/bin/sh\necho 'llama.cpp b12110-fake'\n",
        )
        .unwrap();
        std::fs::set_permissions(
            fake.join("llama-server"),
            std::fs::Permissions::from_mode(0o755),
        )
        .unwrap();
        let old_path = std::env::var_os("PATH");
        let merged = format!(
            "{}:{}",
            fake.display(),
            old_path.clone().unwrap_or_default().to_string_lossy()
        );
        std::env::set_var("PATH", &merged);
        let ext = engine::detect_external(None).expect("devia detectar fake llama-server");
        println!("EXTERNO (fake): {} versão={:?}", ext.path.display(), ext.version);
        if let Some(p) = old_path {
            std::env::set_var("PATH", p);
        }
    }

    // porta ocupada → falha esperada
    {
        let _keep = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let busy_port = _keep.local_addr().unwrap().port();
        let args_busy = engine::server_args(&model, mmproj.as_deref(), busy_port);
        match RunningServer::start(&bin, &args_busy, true) {
            Ok(mut srv) => {
                eprintln!("AVISO: servidor iniciou mesmo com porta ocupada");
                srv.stop();
            }
            Err(e) => println!("PORTA OCUPADA → falha esperada: {e}"),
        }
    }

    // modelo inválido → falha esperada
    {
        let fake_model = std::path::PathBuf::from("/tmp/omni_e2e/nao_existe.gguf");
        let args_bad = engine::server_args(&fake_model, None, pick_free_port().unwrap());
        match RunningServer::start(&bin, &args_bad, true) {
            Ok(mut srv) => {
                eprintln!("AVISO: servidor iniciou com modelo inexistente");
                srv.stop();
            }
            Err(e) => println!("MODELO INVÁLIDO → falha esperada: {e}"),
        }
    }

    let mut settings = Settings::load();
    settings.managed = Some(meta.clone());
    settings.model_gguf = Some(model.display().to_string());
    settings.model_mmproj = mmproj.as_ref().map(|p| p.display().to_string());
    settings.backend_kind = omni_core::settings::BackendKind::Managed;
    settings.save().expect("salvar configurações");

    // 3+4) iniciar, aguardar health, consultar, perguntar
    let port = pick_free_port().unwrap();
    let args = engine::server_args(&model, mmproj.as_deref(), port);
    println!("INICIANDO servidor na porta {port}…");
    let mut server = RunningServer::start(&bin, &args, true).expect("falha ao iniciar servidor");
    println!("EM EXECUÇÃO: pid={} endpoint={}", server.pid, server.endpoint);
    assert!(client::health(&server.endpoint), "health falhou");
    println!("MODELO: {:?}", client::first_model_id(&server.endpoint));
    let answer = client::chat_text(&server.endpoint, "Qual é a capital do Brasil?", 64)
        .expect("pergunta curta falhou");
    println!("RESPOSTA: {answer}");

    // evidência de GPU nos logs
    let logs = server.logs.lines();
    let gpu_lines: Vec<String> = logs
        .iter()
        .filter(|l| {
            let ll = l.to_lowercase();
            ll.contains("vulkan") || ll.contains("offload") || ll.contains("gpu")
        })
        .take(6)
        .cloned()
        .collect();
    println!("LINHAS GPU NOS LOGS: {gpu_lines:#?}");
    if gpu_lines.is_empty() {
        println!("AVISO: nenhuma linha de backend explícita capturada nos logs");
    }

    // 5) parar e reiniciar
    server.stop();
    println!("ENCERRADO. Reiniciando…");
    let port2 = pick_free_port().unwrap();
    let args2 = engine::server_args(&model, mmproj.as_deref(), port2);
    let mut server2 = RunningServer::start(&bin, &args2, true).expect("falha no reinício");
    assert!(client::health(&server2.endpoint), "health falhou no reinício");
    println!("REINICIADO: endpoint={}", server2.endpoint);
    server2.stop();

    // 6) desinstalação (remove apenas o diretório gerenciado)
    let managed_dir = paths::managed_runtime_dir();
    assert!(managed_dir.exists());
    engine::uninstall_managed(&settings).expect("desinstalação falhou");
    assert!(!managed_dir.exists(), "diretório gerenciado ainda existe");
    settings.managed = None;
    settings.save().expect("salvar após desinstalar");
    println!("DESINSTALADO: {} removido", managed_dir.display());
    println!("SMOKE OK");
}
