//! Smoke test da integração Hugging Face (Etapa 3).
//!
//! Uso: cargo run -p omni-core --example hf_smoke
//!
//! Realiza, contra a API pública (sem token):
//!   1. pesquisa `LiquidAI/LFM3` com filtro GGUF;
//!   2. detalhes do repositório LFM3-Omni-2B-GGUF (arquivos/tamanhos);
//!   3. download pequeno (LICENSE) com `downloads::run_download`.

use std::sync::atomic::AtomicBool;

use omni_core::compatibility;
use omni_core::downloads::{self, DlProgress};
use omni_core::huggingface;

fn main() {
    let base = std::path::PathBuf::from("/tmp/omni_hf_e2e");
    let _ = std::fs::remove_dir_all(&base);
    std::env::set_var("XDG_DATA_HOME", base.join("data"));
    std::env::set_var("XDG_CONFIG_HOME", base.join("config"));
    std::env::set_var("XDG_CACHE_HOME", base.join("cache"));

    // 1) pesquisa
    let results = huggingface::search("LiquidAI/LFM3").expect("pesquisa falhou");
    println!("PESQUISA: {} resultados", results.len());
    for r in results.iter().take(5) {
        println!(
            "  - {} | gguf={} | likes={:?} | tags={}",
            r.id,
            r.is_gguf(),
            r.likes,
            r.tags.iter().take(4).cloned().collect::<Vec<_>>().join(",")
        );
    }
    let repo = results
        .iter()
        .find(|r| r.id == "LiquidAI/LFM3-Omni-2B-GGUF")
        .expect("repositório de referência não encontrado na pesquisa");

    // 2) detalhes + arquivos
    let details = huggingface::repo_details(&repo.id, "main").expect("detalhes falharam");
    println!("\nDETALHES: {} | gated={} | license={:?}", details.detail.id, details.detail.gated, details.license());
    let mains: Vec<_> = details.files.iter().filter(|f| compatibility::classify_file(&f.name) == compatibility::FileKind::Main).collect();
    let projs: Vec<_> = details.files.iter().filter(|f| compatibility::classify_file(&f.name) == compatibility::FileKind::Mmproj).collect();
    println!("ARQUIVOS: {} total | principais={} | mmproj={}", details.files.len(), mains.len(), projs.len());
    for f in mains.iter().take(6) {
        println!(
            "  principal: {} | tamanho={:?} | quant={:?}",
            f.name, f.size, compatibility::quant_label(&f.name)
        );
    }
    for f in projs.iter().take(4) {
        println!("  auxiliar: {} | tamanho={:?}", f.name, f.size);
    }
    assert!(mains.len() >= 2, "esperava ao menos 2 quantizações");
    assert!(!projs.is_empty(), "esperava arquivos mmproj");

    // 3) download pequeno (LICENSE)
    let url = format!(
        "https://huggingface.co/{}/resolve/main/LICENSE",
        repo.id
    );
    let dir = std::env::temp_dir().join("omni_hf_dl");
    let _ = std::fs::create_dir_all(&dir);
    let partial = dir.join("LICENSE.part");
    let final_path = dir.join("LICENSE");
    let cancel = AtomicBool::new(false);
    let progress = |p: &DlProgress| {
        if p.total.map(|t| t > 0).unwrap_or(false) {
            let pct = (100 * p.bytes) / p.total.unwrap();
            if pct % 25 == 0 {
                print!("{pct}% ");
            }
        }
    };
    downloads::run_download(&url, &partial, &final_path, None, None, &cancel, &progress)
        .expect("download do LICENSE falhou");
    let size = std::fs::metadata(&final_path).unwrap().len();
    println!("\nDOWNLOAD OK: LICENSE ({} bytes)", size);
    assert!(size > 0);
    println!("HF SMOKE OK");
}
