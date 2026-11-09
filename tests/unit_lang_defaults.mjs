// Teste dos novos padrões automáticos de STT/TTS e da migração legada.
import { DEFAULTS, SPOKEN_LANGUAGES, asrLanguageName, migrateLegacyLanguageDefaults } from '../js/config.js';

let fail = 0;
const check = (cond, label) => {
  const ok = !!cond;
  if (!ok) fail++;
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}`);
};

const EXPECTED_19 = ['ar', 'da', 'de', 'el', 'en', 'en-GB', 'fi', 'fr', 'he', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'es', 'sv', 'tr', 'zh'];

// --- defaults ---
check(DEFAULTS.asrLang === 'auto', 'DEFAULTS.asrLang = auto');
check(DEFAULTS.ttsLang === 'auto', 'DEFAULTS.ttsLang = auto');
check(DEFAULTS.ttsVoice === 'female', 'DEFAULTS.ttsVoice preservado');

// --- 19 idiomas preservados, sem duplicatas, sem invenção ---
check(SPOKEN_LANGUAGES.length === 19, 'SPOKEN_LANGUAGES tem exatamente 19 itens');
const codes = SPOKEN_LANGUAGES.map(([c]) => c);
check(JSON.stringify(codes) === JSON.stringify(EXPECTED_19), 'códigos exatos dos 19 idiomas preservados');
check(new Set(codes).size === 19, 'sem códigos duplicados');

// --- STT: auto -> vazio; manual -> nome em inglês ---
check(asrLanguageName('auto') === '', 'asrLanguageName(auto) = vazio');
check(asrLanguageName('') === '', 'asrLanguageName(vazio) = vazio');
check(asrLanguageName('pt') === 'Portuguese', 'asrLanguageName(pt) = Portuguese');
check(asrLanguageName('ja') === 'Japanese', 'asrLanguageName(ja) = Japanese');
check(asrLanguageName('en-GB') === 'English', 'asrLanguageName(en-GB) = English');

// --- migração legada: única vez; escolhas manuais posteriores respeitadas ---
const legacy = migrateLegacyLanguageDefaults({ asrLang: 'pt', ttsLang: 'pt', ttsVoice: 'male', autoSpeak: true });
check(legacy.asrLang === 'auto', 'migração: asrLang pt -> auto');
check(legacy.ttsLang === 'auto', 'migração: ttsLang pt -> auto');
check(legacy.ttsVoice === 'male' && legacy.autoSpeak === true, 'migração preserva demais preferências');
check(legacy._langMigrated === true, 'migração marca _langMigrated');

const second = migrateLegacyLanguageDefaults({ asrLang: 'pt', ttsLang: 'pt', _langMigrated: true });
check(second.asrLang === 'pt' && second.ttsLang === 'pt', 'migração não roda de novo (escolha manual preservada)');

const none = migrateLegacyLanguageDefaults(null);
check(none === null, 'migração com null é segura');

if (fail) throw new Error(`${fail} falhas nos padrões automáticos`);
console.log('=== UNIT LANG DEFAULTS OK ===');
