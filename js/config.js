// ============================================================
// Configuração do usuário (persistida em localStorage)
// ============================================================

export const DEFAULTS = {
  serverUrl: 'http://127.0.0.1:8080',
  ttsVoice: 'female',        // 'female' | 'male' (vozes do modelo)
  ttsLang: 'auto',           // idioma das respostas faladas (TTS) — auto = acompanha o texto
  asrLang: 'auto',           // idioma da transcrição (ASR) — auto = modelo identifica
  autoSpeak: false,          // falar as respostas automaticamente
  realtimeChunkMs: 100,      // tamanho dos chunks de áudio no modo voz
  uiLanguage: 'en',          // idioma da interface do aplicativo
  theme: 'system',           // system | light | dark | nord
};

// Idiomas de fala suportados pelo modelo (documentação Liquid AI)
export const SPOKEN_LANGUAGES = [
  ['ar', 'Árabe'],
  ['da', 'Dinamarquês'],
  ['de', 'Alemão'],
  ['el', 'Grego'],
  ['en', 'Inglês (EUA)'],
  ['en-GB', 'Inglês (Reino Unido)'],
  ['fi', 'Finlandês'],
  ['fr', 'Francês'],
  ['he', 'Hebraico'],
  ['it', 'Italiano'],
  ['ja', 'Japonês'],
  ['ko', 'Coreano'],
  ['nl', 'Holandês'],
  ['pl', 'Polonês'],
  ['pt', 'Português'],
  ['es', 'Espanhol'],
  ['sv', 'Sueco'],
  ['tr', 'Turco'],
  ['zh', 'Chinês'],
];

const KEY = 'lfm3-omni-ui-settings';

/**
 * Migração única dos padrões antigos de idioma.
 *
 * Antes desta versão, STT e TTS tinham padrão `pt`; usuários existentes
 * podem ter esse valor salvo sem que tenha sido uma escolha manual.
 * Quando `_langMigrated` ainda não está presente, converte os antigos
 * padrões `pt` em `auto` (detecção automática) e marca a migração —
 * escolhas manuais posteriores permanecem salvas e respeitadas.
 */
export function migrateLegacyLanguageDefaults(s) {
  if (!s || s._langMigrated) return s;
  const next = { ...s };
  if (next.asrLang === 'pt') next.asrLang = 'auto';
  if (next.ttsLang === 'pt') next.ttsLang = 'auto';
  next._langMigrated = true;
  return next;
}

export function loadSettings() {
  const base = { ...DEFAULTS };
  let hadSaved = false;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      Object.assign(base, JSON.parse(raw));
      hadSaved = true;
    }
  } catch { /* ignora */ }
  const migrated = hadSaved ? migrateLegacyLanguageDefaults(base) : base;
  const hadLegacyMaxTokens = Object.hasOwn(migrated, 'maxTokens');
  const normalized = normalizeSettings(migrated);
  if (hadSaved && (migrated !== base || hadLegacyMaxTokens)) saveSettings(normalized);
  return normalized;
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignora */ }
}

function normalizeSettings(s) {
  s.serverUrl = String(s.serverUrl || DEFAULTS.serverUrl).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s.serverUrl)) s.serverUrl = DEFAULTS.serverUrl;
  delete s.maxTokens;
  if (!['en', 'pt', 'es', 'fr', 'de'].includes(s.uiLanguage)) s.uiLanguage = DEFAULTS.uiLanguage;
  if (!['system', 'light', 'dark', 'nord'].includes(s.theme)) s.theme = DEFAULTS.theme;
  const langCodes = new Set(['auto', ...SPOKEN_LANGUAGES.map(([c]) => c)]);
  if (!langCodes.has(s.asrLang)) s.asrLang = 'auto';
  if (!langCodes.has(s.ttsLang)) s.ttsLang = 'auto';
  return s;
}

export function langName(code) {
  const f = SPOKEN_LANGUAGES.find(([c]) => c === code);
  return f ? f[1] : code;
}

// Nomes em inglês para o prompt de ASR ("Perform ASR in <language>.")
const ASR_ENGLISH = {
  ar: 'Arabic', da: 'Danish', de: 'German', el: 'Greek',
  en: 'English', 'en-GB': 'English', fi: 'Finnish', fr: 'French',
  he: 'Hebrew', it: 'Italian', ja: 'Japanese', ko: 'Korean',
  nl: 'Dutch', pl: 'Polish', pt: 'Portuguese', es: 'Spanish',
  sv: 'Swedish', tr: 'Turkish', zh: 'Chinese',
};

export function asrLanguageName(code) {
  if (!code || code === 'auto') return '';
  return ASR_ENGLISH[code] || code;
}
