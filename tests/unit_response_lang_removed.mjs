// Teste da remoção da configuração "Idioma da resposta".
// Garante:
//  - O app.js usa sempre as regras automáticas (LINGUISTIC_SYSTEM /
//    LIVE_LINGUISTIC_INSTRUCTIONS) e não contém preferência fixa.
//  - config.js não exporta mais responseLang/RESPONSE_LANGUAGES e mantém
//    TTS/STT.
//  - settings.js não contém mais o seletor de idioma da resposta.
import { readFileSync } from 'node:fs';
import { DEFAULTS, SPOKEN_LANGUAGES, asrLanguageName } from '../js/config.js';

let fail = 0;
const check = (cond, label) => {
  const ok = !!cond;
  if (!ok) fail++;
  console.log(`${ok ? 'OK ' : 'FAIL'} ${label}`);
};

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf-8');
const cfg = readFileSync(new URL('../js/config.js', import.meta.url), 'utf-8');
const stg = readFileSync(new URL('../js/components/settings.js', import.meta.url), 'utf-8');

// --- app.js: regras automáticas presentes e usadas sempre ---
check(!/RESPONSE_LANG_SYSTEM/.test(app), 'app.js sem RESPONSE_LANG_SYSTEM');
check(!/RESPONSE_LANG_LIVE/.test(app), 'app.js sem RESPONSE_LANG_LIVE');
check(!/settings\.responseLang/.test(app), 'app.js sem settings.responseLang');
check(/LINGUISTIC_SYSTEM/.test(app), 'app.js mantém LINGUISTIC_SYSTEM');
check(/LIVE_LINGUISTIC_INSTRUCTIONS/.test(app), 'app.js mantém LIVE_LINGUISTIC_INSTRUCTIONS');
check(/function buildSystemPrompt\(hasVideo\) {\n  const parts = \[LINGUISTIC_SYSTEM, NO_SPONTANEOUS_IDENTITY\]/.test(app), 'buildSystemPrompt usa sempre a regra automática');
check(/function buildLiveInstructions\(\) {\n  return LIVE_LINGUISTIC_INSTRUCTIONS;/ .test(app), 'buildLiveInstructions usa sempre a regra automática');

// --- config.js: sem responseLang/RESPONSE_LANGUAGES; TTS/STT intactos ---
check(!/responseLang/.test(cfg), 'config.js sem responseLang');
check(!/RESPONSE_LANGUAGES/.test(cfg), 'config.js sem RESPONSE_LANGUAGES');
check(!('responseLang' in DEFAULTS), 'DEFAULTS sem responseLang');
check(DEFAULTS.ttsLang === 'auto', 'DEFAULTS.ttsLang = auto');
check(DEFAULTS.asrLang === 'auto', 'DEFAULTS.asrLang = auto');
check(DEFAULTS.ttsVoice === 'female', 'DEFAULTS.ttsVoice preservado');
check(SPOKEN_LANGUAGES.length === 19, 'SPOKEN_LANGUAGES com 19 idiomas');
check(asrLanguageName('pt') === 'Portuguese', 'asrLanguageName(manuais) funciona');
check(asrLanguageName('auto') === '', 'asrLanguageName(auto) = vazio');

// --- settings.js: sem seletor de idioma da resposta ---
check(!/set-response-lang/.test(stg), 'settings.js sem #set-response-lang');
check(!/Idioma das respostas<\/label>/.test(stg), 'settings.js sem campo "Idioma das respostas"');
check(/set-tts-lang/.test(stg), 'settings.js mantém seletor TTS');
check(/set-asr-lang/.test(stg), 'settings.js mantém seletor STT');

if (fail) throw new Error(`${fail} falhas na remoção do idioma de resposta`);
console.log('=== UNIT RESPONSE LANG REMOVED OK ===');
