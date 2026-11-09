//! Heurísticas auxiliares de compatibilidade (sem promessas não verificadas).
//!
//! Classifica arquivos apenas com base em convenções observáveis:
//! - `mmproj-*.gguf` → projetor multimodal (auxiliar);
//! - demais `*.gguf` → arquivo principal (modelo);
//! - quantizações por sufixos conhecidos (Q2_K, Q4_K_M, F16, BF16, ...).
//!
//! Nada aqui afirma execução compatível: isso depende do runtime.

use serde::{Deserialize, Serialize};

pub const KNOWN_QUANTS: &[&str] = &[
    "Q2_K", "Q3_K_S", "Q3_K_M", "Q3_K_L", "Q4_0", "Q4_1", "Q4_K_S", "Q4_K_M",
    "Q5_0", "Q5_1", "Q5_K_S", "Q5_K_M", "Q6_K", "Q8_0", "Q8_1", "Q2_K_S",
    "IQ2_XXS", "IQ2_XS", "IQ3_XXS", "IQ3_XS", "IQ4_XS", "IQ4_NL", "F16", "BF16", "F32",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FileKind {
    /// Arquivo GGUF principal (modelo).
    Main,
    /// Projetor multimodal (convenção `mmproj-...`).
    Mmproj,
    /// Outro arquivo (config, docs, licença etc.).
    Other,
}

/// Classifica um arquivo pelo nome.
pub fn classify_file(name: &str) -> FileKind {
    let lower = name.to_lowercase();
    if lower.starts_with("mmproj-") && lower.ends_with(".gguf") {
        FileKind::Mmproj
    } else if lower.ends_with(".gguf") {
        FileKind::Main
    } else {
        FileKind::Other
    }
}

/// Extrai um rótulo de quantização quando reconhecível no nome.
pub fn quant_label(name: &str) -> Option<String> {
    let upper = name.to_uppercase();
    let mut candidates: Vec<&str> = KNOWN_QUANTS.to_vec();
    // Ordena do mais longo para o mais curto (ex.: BF16 antes de F16).
    candidates.sort_by_key(|q| std::cmp::Reverse(q.len()));
    candidates
        .into_iter()
        .find(|q| upper.contains(&q.to_uppercase()))
        .map(|q| q.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifica_gguf_e_mmproj() {
        assert_eq!(
            classify_file("LFM3-Omni-2B-Q4_K_M.gguf"),
            FileKind::Main
        );
        assert_eq!(
            classify_file("mmproj-LFM3-Omni-2B-Q8_0.gguf"),
            FileKind::Mmproj
        );
        assert_eq!(classify_file("README.md"), FileKind::Other);
    }

    #[test]
    fn detecta_quantizacoes() {
        assert_eq!(quant_label("LFM3-Omni-2B-Q4_K_M.gguf").as_deref(), Some("Q4_K_M"));
        assert_eq!(quant_label("LFM3-Omni-2B-BF16.gguf").as_deref(), Some("BF16"));
        assert_eq!(quant_label("README.md"), None);
    }
}
