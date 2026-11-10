import { openImageSettings } from './images.js';
// ============================================================
// Modal de configurações + teste de conexão
// ============================================================

import { icon } from '../utils/icons.js';
import { loadSettings, SPOKEN_LANGUAGES } from '../config.js';
import { openHfCatalog } from './hf-catalog.js';
import { openBackendManager } from './backend-manager.js';
import { applyTranslations } from '../i18n.js';

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function spokenLanguages(locale) {
  let names;
  try { names = new Intl.DisplayNames([locale], { type: 'language' }); } catch { names = null; }
  return '<option value="auto" data-i18n="language.auto"></option>' + SPOKEN_LANGUAGES.map(([code, fallback]) => {
    let name = fallback;
    try { name = names.of(code) || fallback; } catch { /* fallback */ }
    return `<option value="${code}">${name}</option>`;
  }).join('');
}

const UI_LANGUAGE_OPTIONS = [
  ['en', 'English'], ['pt', 'Português'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'],
].map(([code, name]) => `<option value="${code}">${name}</option>`).join('');

export function openSettings({ onSaved, focusBackend = false, focusCatalog = false, focusImage = false }) {
  const settings = loadSettings();

  const modal = el(`
    <div class="modal-overlay">
      <div class="modal settings-modal" role="dialog" aria-modal="true" aria-label="Settings" data-i18n-aria="settings.title">
        <div class="modal-head">
          <h3 data-i18n="settings.title"></h3>
          <button class="icon-btn" data-close data-i18n-title="settings.close">${icon('close')}</button>
        </div>
        <div class="modal-body">
          <div class="settings-section">
            <div class="settings-section-head">
              <span class="settings-section-title" data-i18n="settings.connection"></span>
              <div class="settings-connection-actions">
                <button class="btn hf-button" data-hf-catalog type="button" data-i18n-title="hf.title" data-i18n-aria="hf.title"><img src="vendor/huggingface-logo.svg" alt="" width="19" height="19"></button>
              <button class="btn settings-manage" data-image-settings type="button">${icon('server', 15)} <span data-i18n="image.settings"></span></button>
              <button class="btn settings-manage" data-backend-manager type="button">${icon('server', 15)} <span data-i18n="settings.backend"></span></button>
              </div>
            </div>
          </div>

          <div class="settings-section">
            <span class="settings-section-title" data-i18n="settings.appearance"></span>
            <div class="row2">
              <div class="field">
                <label for="set-theme" data-i18n="settings.theme"></label>
                <select id="set-theme">
                  <option value="system" data-i18n="theme.system"></option>
                  <option value="light" data-i18n="theme.light"></option>
                  <option value="dark" data-i18n="theme.dark"></option>
                  <option value="nord" data-i18n="theme.nord"></option>
                </select>
              </div>
              <div class="field">
                <label for="set-ui-language" data-i18n="settings.language"></label>
                <select id="set-ui-language">${UI_LANGUAGE_OPTIONS}</select>
              </div>
            </div>
          </div>

          <div class="settings-section">
            <span class="settings-section-title" data-i18n="settings.voice"></span>
            <div class="row2">
              <div class="field">
                <label for="set-tts-lang" data-i18n="settings.ttsLanguage"></label>
                <select id="set-tts-lang">${spokenLanguages(settings.uiLanguage)}</select>
              </div>
              <div class="field">
                <label for="set-asr-lang" data-i18n="settings.asrLanguage"></label>
                <select id="set-asr-lang">${spokenLanguages(settings.uiLanguage)}</select>
              </div>
            </div>
            <div class="field">
              <label for="set-voice" data-i18n="settings.voiceType"></label>
              <select id="set-voice">
                <option value="female" data-i18n="voice.female"></option>
                <option value="male" data-i18n="voice.male"></option>
              </select>
            </div>
            <label class="check-row settings-auto-speak">
              <input type="checkbox" id="set-auto-speak">
              <span data-i18n="settings.autoSpeak"></span>
            </label>
          </div>
        </div>
        <div class="modal-foot">
          <span class="spacer"></span>
          <button class="btn" data-cancel type="button" data-i18n="settings.cancel"></button>
          <button class="btn primary" data-save type="button" data-i18n="settings.save"></button>
        </div>
      </div>
    </div>
  `);

  modal.querySelector('#set-tts-lang').value = settings.ttsLang;
  modal.querySelector('#set-asr-lang').value = settings.asrLang;
  modal.querySelector('#set-theme').value = settings.theme;
  modal.querySelector('#set-ui-language').value = settings.uiLanguage;
  modal.querySelector('#set-voice').value = settings.ttsVoice;
  modal.querySelector('#set-auto-speak').checked = !!settings.autoSpeak;
  applyTranslations(modal);

  const host = document.getElementById('modalHost');
  host.innerHTML = '';
  host.appendChild(modal);

  const close = () => { host.innerHTML = ''; };

  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  modal.querySelector('[data-close]').addEventListener('click', close);
  modal.querySelector('[data-cancel]').addEventListener('click', close);

  const esc = (e) => { if (e.key === 'Escape') close(); };
  modal.addEventListener('keydown', esc);

  modal.querySelector('[data-save]').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const next = {
      ...settings,
      theme: modal.querySelector('#set-theme').value,
      uiLanguage: modal.querySelector('#set-ui-language').value,
      ttsLang: modal.querySelector('#set-tts-lang').value || settings.ttsLang,
      asrLang: modal.querySelector('#set-asr-lang').value || settings.asrLang,
      ttsVoice: modal.querySelector('#set-voice').value,
      autoSpeak: modal.querySelector('#set-auto-speak').checked,
    };
    try {
      if (await onSaved?.(next)) close();
    } finally {
      button.disabled = false;
    }
  });

  // Gerenciar backends: abre o modal HTML (dentro do WebView).
  const catalogButton = modal.querySelector('[data-hf-catalog]');
  if (focusCatalog) catalogButton.setAttribute('data-dialog-focus', '');
  catalogButton.addEventListener('click', () => {
    openHfCatalog({ onBack: () => openSettings({ onSaved, focusCatalog: true }) });
  });
  const backendButton = modal.querySelector('[data-backend-manager]');
  if (focusBackend) backendButton.setAttribute('data-dialog-focus', '');
  backendButton.addEventListener('click', () => {
    openBackendManager({
      onBack: () => openSettings({ onSaved, focusBackend: true }),
      onSettingsChanged: onSaved,
    });
  });
  const imageButton = modal.querySelector('[data-image-settings]');
  if (focusImage) imageButton.setAttribute('data-dialog-focus', '');
  imageButton.addEventListener('click', () => {
    openImageSettings(() => openSettings({ onSaved, focusImage: true }));
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }
