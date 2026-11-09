// ============================================================
// Configuração do usuário
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

let nativeRpc;
let nativeSettings;
let settingsWrites = Promise.resolve();

function readLocalSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) return saved;
  } catch { /* armazenamento local indisponível */ }
  return null;
}

function settingsFrom(saved) {
  const settings = { ...DEFAULTS };
  for (const key of [...Object.keys(DEFAULTS), '_langMigrated']) {
    if (saved && Object.hasOwn(saved, key)) settings[key] = saved[key];
  }
  return normalizeSettings(settings);
}

export async function initializeNativeSettings(rpc) {
  nativeRpc = rpc;
  const local = readLocalSettings();
  nativeSettings = settingsFrom(local && migrateLegacyLanguageDefaults(local));
  const reply = await rpc('ui-settings-get');
  if (!reply.ok) return false;
  if (reply.result != null) {
    nativeSettings = settingsFrom(reply.result);
    return true;
  }
  return !local || saveSettings(nativeSettings);
}

export function loadSettings() {
  if (nativeSettings) return { ...nativeSettings };
  const local = readLocalSettings();
  const migrated = local && migrateLegacyLanguageDefaults(local);
  const settings = settingsFrom(migrated);
  if (local && (migrated !== local || Object.hasOwn(local, 'maxTokens'))) void saveSettings(settings);
  return settings;
}

export async function saveSettings(next) {
  const settings = settingsFrom({ ...next, _langMigrated: true });
  if (!nativeRpc) {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
      return true;
    } catch { return false; }
  }
  const write = settingsWrites.then(async () => {
    const reply = await nativeRpc('ui-settings-save', { settings });
    if (reply.ok) nativeSettings = settings;
    return reply.ok;
  });
  settingsWrites = write.catch(() => false);
  return settingsWrites;
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
