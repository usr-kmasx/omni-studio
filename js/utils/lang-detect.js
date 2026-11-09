// ============================================================
// Detecção leve de idioma para síntese de voz (TTS).
// Heurística local, sem LLM/serviços externos. Retorna o código
// do idioma dominante (pt/en/es/fr) ou null quando não há
// confiança suficiente (fallback para a configuração).
// ============================================================

const LANG_WORDS = {
  pt: [
    'o', 'a', 'os', 'as', 'de', 'do', 'da', 'em', 'com', 'por', 'para',
    'uma', 'um', 'não', 'nao', 'que', 'é', 'e', 'está', 'esta', 'mais',
    'como', 'mas', 'foi', 'são', 'sao', 'também', 'tambem', 'entre', 'sobre',
    'já', 'ja', 'muito', 'quando', 'porque', 'ser', 'tem', 'sua', 'seu',
  ],
  es: [
    'el', 'la', 'los', 'las', 'del', 'en', 'con', 'por', 'para',
    'una', 'un', 'no', 'que', 'es', 'está', 'esta', 'más', 'mas', 'como',
    'pero', 'fue', 'son', 'también', 'tambien', 'entre', 'sobre', 'ya',
    'muy', 'cuando', 'porque', 'ser', 'tiene', 'su', 'sus', 'y',
  ],
  en: [
    'the', 'and', 'of', 'to', 'in', 'is', 'are', 'was', 'were', 'for',
    'with', 'on', 'at', 'from', 'by', 'as', 'that', 'it', 'this', 'not',
    'but', 'have', 'has', 'be', 'or', 'an', 'will', 'can', 'would', 'about',
    'which', 'their', 'there', 'one', 'all', 'if', 'more', 'out', 'up',
    'into', 'than', 'its', 'you', 'your', 'should', 'could',
  ],
  fr: [
    'le', 'la', 'les', 'du', 'des', 'en', 'avec', 'pour', 'une', 'un',
    'ne', 'pas', 'que', 'est', 'sont', 'était', 'etait', 'plus', 'comme',
    'mais', 'été', 'ete', 'aussi', 'entre', 'sur', 'déjà', 'deja', 'très',
    'tres', 'quand', 'parce', 'et', 'être', 'etre', 'a', 'au', 'aux',
  ],
};

const TOKEN_RE = /[^a-zà-ÿãõâêîôûáéíóúüçñ]+/;

/**
 * Detecta o idioma dominante do texto (pt/en/es/fr).
 * @param {string} text
 * @returns {string|null} código curto ou null (sem confiança).
 */
export function detectTextLanguage(text) {
  const words = String(text || '')
    .toLowerCase()
    .split(TOKEN_RE)
    .filter(Boolean);
  if (words.length < 3) return null;

  const scores = {};
  for (const w of words) {
    for (const [lang, list] of Object.entries(LANG_WORDS)) {
      if (list.includes(w)) scores[lang] = (scores[lang] || 0) + 1;
    }
  }

  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  const [top, topN] = entries[0];
  if (topN < 2) return null;
  if (entries[1] && entries[1][1] === topN) return null; // empate -> incerto
  return top;
}
