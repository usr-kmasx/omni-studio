//! Prompt de sistema e regras de idioma — espelha a Parte 1 (Web).
//!
//! Não copia identidade como fato; apenas reproduz as instruções aprovadas.
//!
//! O idioma das respostas é determinado automaticamente pelo modelo:
//! ele responde no idioma da mensagem atual do usuário, acompanhando
//! mudanças ao longo da conversa. Não existe preferência persistida de
//! idioma de resposta (a configuração legada `response_lang` foi removida).

fn linguistic_system() -> &'static str {
    "Respond in the same language as the user's latest message unless the user explicitly requests another language. When an output language is explicitly requested, use that language consistently."
}

fn identity_system() -> &'static str {
    "Answer directly what the user asked. Do not introduce yourself spontaneously and do not add your model name, version, manufacturer, creator, or any identity description unless explicitly asked. When asked about your identity, name, or origin, respond concisely with reliable information; do not invent names, versions, or specifications."
}

/// Constrói o system prompt final (mesmo conteúdo da Web).
///
/// Sempre utiliza a regra automática de idioma; não recebe preferência
/// de idioma de resposta.
pub fn build_system_prompt() -> String {
    format!("{} {}", linguistic_system(), identity_system())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_auto_identidade() {
        let p = build_system_prompt();
        assert!(p.contains("same language"));
        assert!(p.contains("Do not introduce yourself spontaneously"));
        // Paridade exata com o system prompt capturado da Parte 1 (Web).
        let web_exact = "Respond in the same language as the user's latest message unless the user explicitly requests another language. When an output language is explicitly requested, use that language consistently. Answer directly what the user asked. Do not introduce yourself spontaneously and do not add your model name, version, manufacturer, creator, or any identity description unless explicitly asked. When asked about your identity, name, or origin, respond concisely with reliable information; do not invent names, versions, or specifications.";
        assert_eq!(p, web_exact);
    }

    #[test]
    fn prompt_nao_forca_idioma_fixo() {
        let p = build_system_prompt();
        for lang in ["Portuguese", "English", "Spanish", "French"] {
            assert!(!p.contains(lang), "prompt não deve forçar {lang}");
        }
        // A regra é genérica: refere-se à "última mensagem do usuário",
        // sem impor uma lista fechada de idiomas.
        assert!(p.contains("user's latest message"));
    }
}
