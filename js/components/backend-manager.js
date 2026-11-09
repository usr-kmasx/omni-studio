// ============================================================
// Gerenciador de backends — modal HTML dentro do Omni Studio.
// Reutiliza o contêiner/classes do modal de configurações e
// comunica com a camada Rust pela ponte `omni-backend` (JSON).
// ============================================================

import { icon } from '../utils/icons.js';
import { newRequestId } from '../utils/id.js';
import { t } from '../i18n.js';
import { loadSettings, saveSettings } from '../config.js';

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function post(cmd, extra = {}) {
  try {
    window.webkit?.messageHandlers?.['omni-backend']?.postMessage(JSON.stringify({ cmd, ...extra }));
  } catch { /* ponte indisponível */ }
}

// ---- RPC com correlação por requestId (evento omni-backend-command-result) ----
const pending = new Map();
let listenerReady = false;
let statusFailed = false;

function ensureCommandListener() {
  if (listenerReady) return;
  listenerReady = true;
  window.addEventListener('omni-backend-command-result', (e) => {
    const d = e.detail;
    if (!d || !d.requestId) return;
    const h = pending.get(d.requestId);
    if (h) {
      pending.delete(d.requestId);
      h(d);
      return;
    }
    if (d.cmd === 'save-params' && !d.ok) {
      const error = document.getElementById('bmParamError');
      if (error) error.textContent = d.error?.message || t('backend.paramInvalid');
    }
  });
}

export function backendRpc(cmd, extra = {}, timeoutMs = 30000) {
  return new Promise((resolve) => {
    ensureCommandListener();
    const id = newRequestId();
    pending.set(id, (res) => resolve(res));
    post(cmd, { requestId: id, ...extra });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ ok: false, kind: 'none', activeUrl: null, error: { code: 'timeout', message: t('backend.rpcTimeout') } });
      }
    }, timeoutMs);
  });
}

function state() {
  return window.__omniBackend || {};
}

let timer = null;

function close() {
  if (timer) { clearInterval(timer); timer = null; }
  const host = document.getElementById('modalHost');
  if (host) host.innerHTML = '';
}

function dotClass(ok) { return ok ? 'dot-ok' : 'dot-err'; }

function statusLabel(online) {
  return online ? t('backend.connected') : t('backend.unavailable');
}

function field(id, label, value, placeholder = '', type = 'text', { min, max, required = false } = {}) {
  const numericAttrs = type === 'number'
    ? ` step="1"${min == null ? '' : ` min="${min}"`}${max == null ? '' : ` max="${max}"`}${required ? ' required' : ''}`
    : '';
  return `
    <div class="field">
      <label for="${id}">${label}</label>
      <input id="${id}" type="${type}" data-field="${id}" value="${escapeAttr(String(value ?? ''))}" placeholder="${escapeAttr(placeholder)}"${numericAttrs}>
    </div>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(s) { return escapeHtml(s).replace(/'/g, '&#39;'); }

export function openBackendManager({ onBack, onSettingsChanged } = {}) {
  close();
  const s = state();
  const settings = loadSettings();

  const installed = !!s.integratedInstalled;
  const enabled = !!s.integratedEnabled;
  const running = !!s.integratedRunning;
  const installing = !!s.installing;

  const modal = el(`
    <div class="modal-overlay">
      <div class="modal modal--tall" role="dialog" aria-modal="true" aria-labelledby="bmTitle">
        <div class="modal-head">
          <h3 id="bmTitle">${t('backend.title')}</h3>
          <div style="display:flex;gap:8px">
            <button class="icon-btn" data-bm-back type="button" title="${t('backend.back')}">${icon('gear', 16)}</button>
            <button class="icon-btn" data-close type="button" title="${t('backend.close')}">${icon('close')}</button>
          </div>
        </div>

        <div class="modal-body">

          <!-- Servidor local -->
          <div class="bm-section">
            <div class="bm-title"><span class="dot ${dotClass(!!s.externalOnline)}" id="bmExtDot"></span> ${t('backend.external')}</div>
            <div>
              ${field('bmServerUrl', t('settings.serverAddress'), settings.serverUrl, 'http://127.0.0.1:8080', 'url', { required: true })}
            </div>
            <div class="bm-row">
              <button class="btn" id="bmSaveServerUrl" type="button">${t('settings.save')}</button>
            </div>
            <div class="bm-meta">
              <span>${t('backend.state')}: <span id="bmExtStatus" class="bm-status" style="color:${s.externalOnline ? '#4ade80' : '#f87171'}">${statusLabel(!!s.externalOnline)}</span></span>
            </div>
            <div class="bm-hint">${t('backend.externalHint')}</div>
          </div>

          <!-- llama.cpp do Omni Studio -->
          <div class="bm-section">
            <div class="bm-title"><span class="dot ${dotClass(enabled)}" id="bmIntDot"></span> ${t('backend.integrated')}</div>
            <div class="bm-row">
              <div class="bm-meta">
                <span>${t('backend.installation')} <b id="bmInstalled">${installed ? t('backend.installed') : t('backend.notInstalled')}</b></span>
                <span>${t('backend.activation')} <b id="bmEnabled">${enabled ? t('backend.enabled') : t('backend.disabled')}</b> · ${t('backend.process')} <b id="bmRunning">${running ? t('backend.running') : (installing ? t('backend.installing') : t('backend.stopped'))}</b></span>
                <span>${t('backend.version')} <b id="bmVersion">${escapeHtml(s.integratedVersion || '—')}</b> · ${t('backend.variant')} <b>linux-x64-vulkan</b></span>
                <span>${t('backend.folder')} <b id="bmDir">${escapeHtml(s.integratedDir || '—')}</b></span>
              </div>
              <label class="check-row"><input type="checkbox" class="switch" id="bmSwitch" ${enabled ? 'checked' : ''}> ${t('backend.active')}</label>
              <span class="bm-hint" id="bmSwitchError" role="status" aria-live="polite"></span>
            </div>
            <div class="bm-row">
              <span class="bm-status" id="bmProcessState">${t('backend.checking')}</span>
              <div style="display:flex;gap:8px">
                <button class="btn bm-process-btn bm-start" id="bmStart" type="button" style="display:none" disabled>${icon('play', 13)} <span>${t('backend.start')}</span></button>
                <button class="btn bm-process-btn bm-stop" id="bmStop" type="button" style="display:none" disabled>${icon('square', 13)} <span>${t('backend.stop')}</span></button>
              </div>
            </div>
            <div class="bm-row">
              <button class="btn" id="bmInstall" type="button" style="${installed ? 'display:none' : ''}">${t('backend.install')}</button>
              <button class="btn bm-danger" id="bmDelete" type="button" style="${installed && !enabled && !running ? '' : 'display:none'}">${t('backend.delete')}</button>
              <span class="bm-progress" id="bmProgress"></span>
            </div>
          </div>

          <!-- Parâmetros -->
          <div class="bm-section">
            <div class="bm-title">${t('backend.files')}</div>

            <div class="bm-file-row">
              <div class="bm-file-info">
                <span class="bm-file-label">${t('backend.modelFile')}</span>
                <b class="bm-file-name" id="bmModelName">${t('backend.noneSelected')}</b>
              </div>
              <div class="bm-file-actions">
                <button class="btn" id="bmSelectModel" type="button">${t('backend.choose')}</button>
                <button class="btn bm-danger" id="bmClearModel" type="button" style="display:none">${t('backend.clear')}</button>
              </div>
            </div>

            <div class="bm-file-row">
              <div class="bm-file-info">
                <span class="bm-file-label">${t('backend.projector')} <span class="bm-file-optional">${t('backend.optional')}</span></span>
                <b class="bm-file-name" id="bmMmName">${t('backend.noneSelected')}</b>
              </div>
              <div class="bm-file-actions">
                <button class="btn" id="bmSelectMm" type="button">${t('backend.choose')}</button>
                <button class="btn bm-danger" id="bmClearMm" type="button" style="display:none">${t('backend.clear')}</button>
              </div>
            </div>
          </div>

          <div class="bm-section">
            <div class="bm-title">${t('backend.gpu')}</div>
            <div class="bm-grid">
              ${field('bmNgl', t('backend.gpuLayers'), s.paramsNgl ?? 'all', 'all | auto | <n>')}
              ${field('bmThreads', t('backend.threads'), s.paramsThreads ?? '', '<n>', 'number', { min: 1, max: 4294967295 })}
              ${field('bmThreadsBatch', t('backend.batchThreads'), s.paramsThreadsBatch ?? '', '<n>', 'number', { min: 1, max: 4294967295 })}
            </div>
          </div>

          <div class="bm-section">
            <div class="bm-title">${t('backend.memory')}</div>
            <div class="bm-grid">
              ${field('bmCtx', t('backend.context'), s.paramsCtx ?? '32768', '<n>', 'number', { min: 1024, max: 4294967295, required: true })}
              ${field('bmBatch', t('backend.batch'), s.paramsBatch ?? '', '<n>', 'number', { min: 1, max: 4294967295 })}
              ${field('bmUbatch', t('backend.ubatch'), s.paramsUbatch ?? '', '<n>', 'number', { min: 1, max: 4294967295 })}
              ${field('bmCtk', t('backend.cacheK'), s.paramsCtk ?? 'q4_0', 'f16 | q8_0 | q4_0')}
              ${field('bmCtv', t('backend.cacheV'), s.paramsCtv ?? 'q4_0', 'f16 | q8_0 | q4_0')}
              ${field('bmFa', t('backend.flashAttention'), s.paramsFa ?? 'auto', 'on | off | auto')}
            </div>
          </div>

          <div class="bm-section">
            <div class="bm-title">${t('backend.server')}</div>
            <div class="bm-grid">
              ${field('bmHost', t('backend.host'), s.paramsHost ?? '127.0.0.1')}
              ${field('bmPort', t('backend.port'), s.paramsPort ?? '', '<port>', 'number', { min: 1, max: 65535 })}
              ${field('bmSlots', t('backend.slots'), s.paramsSlots ?? '', '<n>', 'number', { min: 1, max: 4294967295 })}
              ${field('bmReasoning', t('backend.reasoning'), s.paramsReasoning ?? 'off', 'on | off | auto')}
              ${field('bmCors', t('backend.cors'), s.paramsCors ?? '', 'exact origin')}
            </div>
            <label class="check-row"><input type="checkbox" id="bmNoWebui" ${s.paramsNoWebui === false ? '' : 'checked'}> ${t('backend.noWebui')}</label>
          </div>
          <div id="bmParamError" class="bm-hint" role="status" aria-live="polite" style="color:var(--red)"></div>

        </div>

        <div class="modal-foot">
          <span class="spacer"></span>
          <span id="bmSaveStatus" class="bm-hint" role="status" aria-live="polite"></span>
          <button class="btn" data-close type="button">${t('backend.close')}</button>
          <button class="btn primary" id="bmSaveParams" type="button" disabled>${t('settings.save')}</button>
        </div>
      </div>
    </div>
  `);

  const host = document.getElementById('modalHost');
  host.appendChild(modal);

  let switchPending = false;
  let startError = '';
  let startPending = false;
  let modelSelectionPending = false;
  let savingParams = false;
  const fileDraft = new Map();

  const refresh = () => {
    const st = state();
    const inst = !!st.integratedInstalled;
    const en = !!st.integratedEnabled;
    const run = !!st.integratedRunning;
    const instg = !!st.installing;
    const extDot = modal.querySelector('#bmExtDot');
    const intDot = modal.querySelector('#bmIntDot');
    if (extDot) extDot.className = `dot ${dotClass(!!st.externalOnline)}`;
    if (intDot) intDot.className = `dot ${dotClass(en)}`;
    const setText = (id, v) => { const e = modal.querySelector('#' + id); if (e) e.textContent = v; };
    const extStatus = modal.querySelector('#bmExtStatus');
    if (extStatus) {
      const online = !!st.externalOnline;
      extStatus.textContent = statusLabel(online);
      extStatus.style.color = online ? '#4ade80' : '#f87171';
    }
    setText('bmInstalled', inst ? t('backend.installed') : t('backend.notInstalled'));
    setText('bmEnabled', en ? t('backend.enabled') : t('backend.disabled'));
    setText('bmVersion', st.integratedVersion || '—');
    setText('bmDir', st.integratedDir || '—');
    const sw = modal.querySelector('#bmSwitch');
    if (sw) {
      if (!switchPending && sw.checked !== en) sw.checked = en;
      sw.disabled = switchPending || savingParams;
    }
    const btnInstall = modal.querySelector('#bmInstall');
    const btnDelete = modal.querySelector('#bmDelete');
    if (btnInstall) btnInstall.style.display = inst ? 'none' : '';
    if (btnDelete) btnDelete.style.display = (inst && !en && !run) ? '' : 'none';

    // Estado do processo (fonte: snapshot Rust).
    const st2 = st.state || {};
    const known = st2.processState !== undefined;
    const pst = startPending ? 'starting' : st2.processState || (st.integratedRunning ? 'running' : st.integratedInstalled ? 'stopped' : 'unknown');
    const procEl = modal.querySelector('#bmProcessState');
    const btnStart = modal.querySelector('#bmStart');
    const btnStop = modal.querySelector('#bmStop');
    const busyOp = pst === 'starting' || pst === 'stopping';
    const processKey = {
      starting: 'backend.starting', stopping: 'backend.stopping',
      running: 'backend.running', error: 'backend.serverError',
    }[pst];
    setText('bmRunning', t(processKey || (instg ? 'backend.installing' : 'backend.stopped')));
    let procLabel;
    if (!known) {
      procLabel = statusFailed ? t('backend.statusUnavailable') : t('backend.checking');
    } else if (pst === 'running') procLabel = t('backend.serverRunning');
    else if (pst === 'stopped') procLabel = t('backend.serverStopped');
    else if (pst === 'starting') procLabel = t('backend.starting');
    else if (pst === 'stopping') procLabel = t('backend.stopping');
    else if (pst === 'error') procLabel = t('backend.serverError');
    else procLabel = statusFailed ? t('backend.statusUnavailable') : t('backend.checking');
    if (startError && !busyOp && pst !== 'running') procLabel = startError;
    if (procEl) procEl.textContent = procLabel;
    if (btnStart) {
      const show = pst === 'stopped' || pst === 'error' || pst === 'unknown' || pst === 'starting';
      btnStart.style.display = show ? '' : 'none';
      btnStart.disabled = savingParams || busyOp || modelSelectionPending || !known;
      btnStart.querySelector('span').textContent = t(pst === 'starting' ? 'backend.starting' : 'backend.start');
    }
    if (btnStop) {
      btnStop.style.display = pst === 'running' || pst === 'stopping' ? '' : 'none';
      btnStop.disabled = savingParams || busyOp || modelSelectionPending || !known;
      btnStop.innerHTML = `${icon('square', 13)} <span>${busyOp ? t('backend.waiting') : t('backend.stop')}</span>`;
    }

    // Nome visível; caminho completo no tooltip.
    const modelPath = fileDraft.has('model') ? fileDraft.get('model') : st.paramsModel;
    const mmPath = fileDraft.has('mmproj') ? fileDraft.get('mmproj') : st.paramsMmproj;
    const modelName = modelPath ? modelPath.split('/').pop() : '';
    const mmName = mmPath ? mmPath.split('/').pop() : '';
    setText('bmModelName', modelName || t('backend.noneSelected'));
    setText('bmMmName', mmName || t('backend.noneSelected'));
    for (const [id, path, exists] of [['bmModelName', modelPath, fileDraft.has('model') || st.modelExists], ['bmMmName', mmPath, fileDraft.has('mmproj') || st.mmprojExists]]) {
      const name = modal.querySelector('#' + id);
      if (name) {
        name.title = path ? path + (exists ? '' : ` ${t('backend.fileUnavailable')}`) : '';
        name.classList.toggle('bm-file-missing', !!path && !exists);
      }
    }
    const clearModel = modal.querySelector('#bmClearModel');
    const clearMm = modal.querySelector('#bmClearMm');
    const selectModel = modal.querySelector('#bmSelectModel');
    const selectMm = modal.querySelector('#bmSelectMm');
    if (selectModel) selectModel.textContent = modelPath ? t('backend.change') : t('backend.choose');
    if (selectMm) selectMm.textContent = mmPath ? t('backend.change') : t('backend.choose');
    if (selectModel) selectModel.disabled = savingParams || modelSelectionPending || busyOp || !known;
    if (selectMm) selectMm.disabled = savingParams || modelSelectionPending || busyOp || !known;
    if (clearModel) clearModel.style.display = modelPath ? '' : 'none';
    if (clearMm) clearMm.style.display = mmPath ? '' : 'none';
    if (clearModel) clearModel.disabled = savingParams || modelSelectionPending || busyOp || !known;
    if (clearMm) clearMm.disabled = savingParams || modelSelectionPending || busyOp || !known;
  };

  // Valores iniciais a partir do estado atual (parâmetros virão do save-params/status).
  const seed = (id, val) => {
    const e = modal.querySelector('#' + id);
    if (e && val !== undefined && val !== null) e.value = String(val);
  };
  seed('bmNgl', s.paramsNgl); seed('bmThreads', s.paramsThreads); seed('bmThreadsBatch', s.paramsThreadsBatch);
  seed('bmCtx', s.paramsCtx); seed('bmBatch', s.paramsBatch); seed('bmUbatch', s.paramsUbatch);
  seed('bmCtk', s.paramsCtk); seed('bmCtv', s.paramsCtv); seed('bmFa', s.paramsFa);
  seed('bmHost', s.paramsHost); seed('bmPort', s.paramsPort); seed('bmSlots', s.paramsSlots);
  seed('bmReasoning', s.paramsReasoning); seed('bmCors', s.paramsCors);
  const nw = modal.querySelector('#bmNoWebui');
  if (nw) nw.checked = s.paramsNoWebui !== false;

  const parseOpt = (v) => { const n = Number(v); return v.trim() === '' || Number.isNaN(n) ? null : n; };
  const parseOptU16 = (v) => { const n = Number(v); return v.trim() === '' || !Number.isInteger(n) || n < 0 || n > 65535 ? null : n; };

  const KEYMAP = {
    bmNgl: 'ngl', bmCtk: 'cache_type_k', bmCtv: 'cache_type_v', bmCtx: 'ctx_size',
    bmThreads: 'threads', bmThreadsBatch: 'threads_batch', bmBatch: 'batch_size',
    bmUbatch: 'ubatch_size', bmSlots: 'slots', bmFa: 'flash_attn',
    bmReasoning: 'reasoning', bmHost: 'host', bmPort: 'port',
    bmCors: 'cors_origins', bmNoWebui: 'no_webui',
  };

  modal.querySelector('#bmSaveServerUrl').addEventListener('click', () => {
    const input = modal.querySelector('#bmServerUrl');
    const url = input.value.trim().replace(/\/+$/, '');
    if (!input.checkValidity() || !/^https?:\/\//i.test(url)) {
      input.setCustomValidity(' ');
      input.reportValidity();
      input.setCustomValidity('');
      return;
    }
    const next = { ...loadSettings(), serverUrl: url };
    saveSettings(next);
    onSettingsChanged?.(next);
    post('resolve', { externalUrl: url });
  });

  const valueOf = (id) => {
    const e = modal.querySelector('#' + id);
    if (!e) return undefined;
    switch (id) {
      case 'bmCtx': return Number(e.value) || 0;
      case 'bmThreads': case 'bmThreadsBatch': case 'bmBatch':
      case 'bmUbatch': case 'bmSlots': return parseOpt(e.value);
      case 'bmPort': return parseOptU16(e.value);
      case 'bmNoWebui': return e.checked;
      case 'bmCors': return e.value.trim();
      default: return e.value.trim() || null;
    }
  };

  const saveParams = modal.querySelector('#bmSaveParams');
  const saveStatus = modal.querySelector('#bmSaveStatus');
  const dirtyParams = new Set();

  function validationError(id) {
    const input = modal.querySelector('#' + id);
    const value = input.value.trim();
    if (id === 'bmNgl' && !['all', 'auto'].includes(value) &&
        !(/^\d+$/.test(value) && Number(value) <= 4294967295)) return 'backend.gpuValidation';
    if (id === 'bmReasoning' && !['on', 'off', 'auto'].includes(value)) return 'backend.paramInvalid';
    if (input.type === 'number' && !input.checkValidity()) {
      if (id === 'bmCtx') return 'backend.contextValidation';
      if (id === 'bmPort') return 'backend.portValidation';
      return 'backend.integerValidation';
    }
    return null;
  }

  for (const id of Object.keys(KEYMAP)) {
    const input = modal.querySelector('#' + id);
    input.addEventListener(id === 'bmNoWebui' ? 'change' : 'input', () => {
      dirtyParams.add(id);
      updateSaveButton();
      saveStatus.textContent = '';
    });
  }

  function updateSaveButton() {
    saveParams.disabled = savingParams || modelSelectionPending || (!dirtyParams.size && !fileDraft.size);
  }

  saveParams.addEventListener('click', async () => {
    if (saveParams.disabled) return;
    const savedFiles = new Map(fileDraft);
    const changes = Object.fromEntries(savedFiles);
    const submitted = new Map();
    for (const id of dirtyParams) {
      const error = validationError(id);
      if (error) {
        saveStatus.textContent = t(error);
        modal.querySelector('#' + id).focus();
        return;
      }
      const value = valueOf(id);
      submitted.set(id, value);
      changes[KEYMAP[id]] = value;
    }
    if (state().integratedRunning && state().kind === 'integrated' &&
        window.__omniChatBusy && !confirm(t('backend.confirmSaveRestart'))) return;
    savingParams = true;
    updateSaveButton();
    refresh();
    saveStatus.textContent = t('backend.savingParams');
    try {
      const result = await backendRpc('save-params', { changes }, 180000);
      if (!result.ok) {
        saveStatus.textContent = t('backend.saveParamsFailed');
        return;
      }
      for (const [id, value] of submitted) {
        if (valueOf(id) === value) dirtyParams.delete(id);
      }
      if (result.state) window.__omniBackend = result.state;
      for (const key of savedFiles.keys()) fileDraft.delete(key);
      if (result.restartError) {
        saveStatus.textContent = t('backend.savedRestartFailed');
        startError = result.restartError;
      } else {
        startError = '';
        saveStatus.textContent = t(result.restarted ? 'backend.savedRestarted' : 'backend.paramsSaved');
      }
    } finally {
      savingParams = false;
      updateSaveButton();
      refresh();
    }
  });

  const switchEl = modal.querySelector('#bmSwitch');
  const switchError = modal.querySelector('#bmSwitchError');
  switchEl.addEventListener('change', async (e) => {
    const desiredEnabled = e.target.checked;
    switchPending = true;
    if (switchError) switchError.textContent = '';
    refresh();

    const res = await backendRpc(desiredEnabled ? 'enable' : 'disable');
    if (res.ok && res.state && typeof res.state === 'object') {
      // A resposta inclui o snapshot confirmado pelo Rust; não usar o
      // snapshot antigo que estava na página antes da operação.
      window.__omniBackend = res.state;
      statusFailed = false;
    } else {
      switchEl.checked = !!state().integratedEnabled;
      if (switchError) {
        switchError.textContent = res.error?.message || t('backend.saveActivationFailed');
      }
    }

    switchPending = false;
    refresh();
  });

  const bindSelect = (btnId, cmd, clearId, key) => {
    const setDraft = (path) => {
      const saved = key === 'model' ? state().paramsModel : state().paramsMmproj;
      if (path === (saved || null)) fileDraft.delete(key);
      else fileDraft.set(key, path);
      saveStatus.textContent = '';
      updateSaveButton();
      refresh();
    };

    modal.querySelector('#' + btnId).addEventListener('click', async () => {
      modelSelectionPending = true;
      updateSaveButton();
      refresh();
      try {
        const res = await backendRpc(cmd, {}, 300000);
        if (!res.ok) saveStatus.textContent = t('backend.selectFailed');
        else if (!res.cancelled && res.result?.path) setDraft(res.result.path);
      } finally {
        modelSelectionPending = false;
        updateSaveButton();
        refresh();
      }
    });
    modal.querySelector('#' + clearId).addEventListener('click', () => setDraft(null));
  };
  bindSelect('bmSelectModel', 'select-model', 'bmClearModel', 'model');
  bindSelect('bmSelectMm', 'select-mmproj', 'bmClearMm', 'mmproj');


  const btnStart = modal.querySelector('#bmStart');
  if (btnStart) {
    btnStart.addEventListener('click', async () => {
      if (btnStart.disabled) return;
      startPending = true;
      startError = '';
      refresh();
      const res = await backendRpc('start-integrated', {}, 180000);
      if (res.state) window.__omniBackend = res.state;
      startPending = false;
      if (!res.ok) {
        startError = res.error?.message || t('backend.startFailed');
      }
      refresh();
      post('status');
    });
  }

  const btnStop = modal.querySelector('#bmStop');
  if (btnStop) {
    btnStop.addEventListener('click', async () => {
      if (window.__omniChatBusy && !confirm(t('backend.stopConfirm'))) return;
      btnStop.disabled = true;
      const res = await backendRpc('stop-integrated');
      if (!res.ok) {
        const msg = res.error?.message || t('backend.stopFailed');
        const el = modal.querySelector('#bmProcessState');
        if (el) el.textContent = msg;
      }
      refresh();
      post('status');
    });
  }


  const btnInstall = modal.querySelector('#bmInstall');
  if (btnInstall) btnInstall.addEventListener('click', async () => {
    const prog = modal.querySelector('#bmProgress');
    if (prog) prog.textContent = t('backend.download');
    const res = await backendRpc('install');
    if (prog) prog.textContent = res.ok ? t('backend.installDone') : (res.error?.message || t('backend.installFailed'));
    refresh();
  });

  const btnDelete = modal.querySelector('#bmDelete');
  if (btnDelete) {
    let armed = false;
    btnDelete.addEventListener('click', () => {
      if (!armed) { armed = true; btnDelete.textContent = t('backend.confirmDelete'); return; }
      armed = false;
      btnDelete.textContent = t('backend.delete');
      post('delete');
      setTimeout(refresh, 800);
    });
  }

  const closeBtn = () => {
    close();
    if (onBack) onBack(); else { const h = document.getElementById('modalHost'); if (h) h.innerHTML = ''; }
  };
  modal.querySelector('[data-bm-back]').addEventListener('click', closeBtn);
  modal.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  const esc = (e) => { if (e.key === 'Escape') close(); };
  modal.addEventListener('keydown', esc);

  const initial = state();
  const hasInitial = !!(initial.state && (initial.state.processState !== undefined || initial.state.revision !== undefined));

  if (!hasInitial) {
    setTimeout(() => {
      if (modal.isConnected && !state().state) {
        statusFailed = true;
        refresh();
      }
    }, 6000);
  }

  // Consulta o Rust periodicamente: o snapshot não muda sozinho quando o
  // servidor externo é iniciado ou encerrado fora do Omni Studio.
  let statusRequestPending = false;
  const pollBackendStatus = async () => {
    if (statusRequestPending || !modal.isConnected) return;
    statusRequestPending = true;
    try {
      const res = await backendRpc('status');
      if (res.ok && res.state) {
        const currentRevision = Number(state().state?.revision ?? -1);
        const incomingRevision = Number(res.state.state?.revision ?? -1);

        // Aceita mesma revisão (o estado externo pode mudar sem operação
        // gerenciada) e impede snapshot antigo de desfazer ação mais recente.
        if (!Number.isFinite(currentRevision) || !Number.isFinite(incomingRevision) ||
            incomingRevision >= currentRevision) {
          window.__omniBackend = res.state;
        }
        statusFailed = false;
      } else if (!state().state) {
        statusFailed = true;
      }
    } catch {
      if (!state().state) statusFailed = true;
    } finally {
      statusRequestPending = false;
      if (modal.isConnected) refresh();
    }
  };

  // A atualização é limitada a uma consulta em andamento por vez.
  let lastSnap = JSON.stringify(state());
  timer = setInterval(() => {
    const cur = JSON.stringify(state());
    if (cur !== lastSnap) {
      lastSnap = cur;
      refresh();
    }
    pollBackendStatus();
  }, 2000);

  refresh();
  pollBackendStatus();
}
