//! Guardas de geração — equivalentes das da Parte 1 (guards.js), puras.
//!
//! Valores espelham a Web: stall 60s, duração máxima 150s, limite de
//! caracteres 12000, e heurística de repetição (conservadora).

pub const STALL_MS: u128 = 60_000;
pub const MAX_DURATION_MS: u128 = 150_000;
pub const MAX_CHARS: usize = 12_000;
pub const REPEAT_SEGMENT: usize = 160;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GuardViolation {
    Stall,
    Duration,
    Length,
    Repeat,
}

/// Retorna a violação conforme o estado do stream.
pub fn assess(text: &str, last_delta_at: u128, start_at: u128, now: u128) -> Option<GuardViolation> {
    if detect_repeat(text) {
        return Some(GuardViolation::Repeat);
    }
    if text.len() > MAX_CHARS {
        return Some(GuardViolation::Length);
    }
    if now.saturating_sub(start_at) > MAX_DURATION_MS {
        return Some(GuardViolation::Duration);
    }
    if last_delta_at != 0 && now.saturating_sub(last_delta_at) > STALL_MS {
        return Some(GuardViolation::Stall);
    }
    None
}

/// Detecta repetição patológica (segmento idêntico consecutivo).
pub fn detect_repeat(text: &str) -> bool {
    if text.len() < REPEAT_SEGMENT * 2 {
        return false;
    }
    let a = &text[text.len() - REPEAT_SEGMENT * 2..text.len() - REPEAT_SEGMENT];
    let b = &text[text.len() - REPEAT_SEGMENT..];
    a == b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stall_cutoff() {
        assert_eq!(assess("ok", 1000, 0, 61_000), None);
        assert_eq!(assess("ok", 1000, 0, 61_001), Some(GuardViolation::Stall));
    }

    #[test]
    fn duration_cutoff() {
        // stall dispara antes se já passou 60s sem delta
        assert_eq!(assess("ok", 1000, 1000, 151_000), Some(GuardViolation::Stall));
        assert_eq!(assess("ok", 151_000, 1000, 151_000), None);
        assert_eq!(assess("ok", 151_000, 1000, 151_001), Some(GuardViolation::Duration));
    }

    #[test]
    fn length_limit() {
        // texto sem repetição no trecho final (período 7) para isolar length
        let mut long = String::new();
        for i in 0..12_001 {
            long.push((b'a' + (i % 7) as u8) as char);
        }
        assert!(!detect_repeat(&long), "fixture não pode repetir");
        assert_eq!(assess(&long, 0, 0, 0), Some(GuardViolation::Length));
    }

    #[test]
    fn repeat_detected() {
        let seg = "x".repeat(REPEAT_SEGMENT);
        let bad = format!("{seg}{seg}");
        assert!(detect_repeat(&bad));
        assert!(!detect_repeat("abab"));
    }
}
