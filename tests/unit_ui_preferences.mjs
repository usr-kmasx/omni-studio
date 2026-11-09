import { DEFAULTS, loadSettings, saveSettings } from '../js/config.js';
import { t, setLocale, getLocale, availableLocales, missingTranslationKeys } from '../js/i18n.js';
import { applyTheme, resolveTheme, themes } from '../js/theme.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
};

const check = (condition, message) => {
  if (!condition) throw new Error(message);
};

check(DEFAULTS.uiLanguage === 'en', 'new installations default to English UI');
check(DEFAULTS.theme === 'system', 'new installations follow the system theme');
check(availableLocales.length === 5, 'exactly five UI locales are available');
check(JSON.stringify(availableLocales) === JSON.stringify(['en', 'pt', 'es', 'fr', 'de']), 'supported UI locale codes are stable');
check(JSON.stringify(themes) === JSON.stringify(['system', 'light', 'dark', 'nord']), 'four theme choices are available');
for (const locale of availableLocales) check(missingTranslationKeys(locale).length === 0, `${locale} has complete UI translation coverage`);
check(resolveTheme('system', true) === 'dark' && resolveTheme('system', false) === 'light', 'system theme follows preference');
check(resolveTheme('nord', false) === 'nord', 'selected theme is independent of system preference');
const themeRoot = { dataset: {}, style: {} };
let systemListener;
let prefersDark = true;
globalThis.document = { documentElement: themeRoot };
globalThis.window = { matchMedia: () => ({
  get matches() { return prefersDark; },
  addEventListener: (_name, listener) => { systemListener = listener; },
  removeEventListener: () => {},
}) };
check(applyTheme('system') === 'dark' && themeRoot.style.colorScheme === 'dark', 'system theme initially follows dark preference');
prefersDark = false;
systemListener({ matches: false });
check(themeRoot.dataset.theme === 'light' && themeRoot.style.colorScheme === 'light', 'system theme reacts when preference changes');
check(applyTheme('nord') === 'nord', 'explicit theme is applied');
delete globalThis.document;
delete globalThis.window;

const initial = loadSettings();
check(initial.uiLanguage === 'en' && initial.theme === 'system', 'missing UI preferences use defaults');
saveSettings({ ...initial, uiLanguage: 'pt', theme: 'nord' });
const saved = loadSettings();
check(saved.uiLanguage === 'pt' && saved.theme === 'nord', 'UI preferences persist');
saveSettings({ ...saved, uiLanguage: 'xx', theme: 'unknown' });
const invalid = loadSettings();
check(invalid.uiLanguage === 'en' && invalid.theme === 'system', 'invalid UI preferences fall back to defaults');

setLocale('fr');
check(getLocale() === 'fr', 'locale changes at runtime');
check(t('settings.title') === 'Paramètres', 'translations use selected locale');
setLocale('unsupported');
check(getLocale() === 'en', 'unsupported locales fall back to English');

console.log('=== UI PREFERENCES OK ===');
