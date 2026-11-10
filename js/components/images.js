import { backendRpc } from './backend-manager.js';
import { applyTranslations, t } from '../i18n.js';

const desktop = () => !!window.webkit?.messageHandlers?.['omni-backend'];
const rpc = (command, args = {}, timeout) => backendRpc(`image-${command}`, args, timeout);
let snapshot = {};
let polling = false;
let refreshWorkspace = () => {};
let refreshDialog = () => {};

async function refresh() {
  if (!desktop() || polling) return;
  polling = true;
  try {
    const reply = await rpc('status', {}, 3000);
    if (reply.ok) snapshot = reply.result;
    refreshWorkspace();
    refreshDialog();
  } finally {
    polling = false;
  }
}

function stateLabel() {
  if (!desktop()) return t('image.desktop');
  if (snapshot.installing) return t('image.installing');
  if (!snapshot.installed) return t('image.runtimeMissing');
  if (!snapshot.configured) return t(snapshot.components ? 'image.componentsMissing' : 'image.modelMissing');
  if (snapshot.phase === 'starting') return t('image.loading');
  if (snapshot.busy) {
    const { completed, total } = snapshot.progress || {};
    return total > 0 ? t('image.steps', { completed: completed || 0, total }) : t('image.generating');
  }
  return t(snapshot.phase === 'ready' ? 'image.ready' : 'image.stopped');
}

function showError(element, reply) {
  const detail = reply?.error?.message || reply?.result?.error;
  const budget = reply?.result?.memoryBudget;
  if (budget) {
    const { phase, resource, required, available } = budget;
    const mib = bytes => Math.floor(Number(bytes) / 1048576);
    element.textContent = resource === 'vram_unknown' ? t('image.guardGpuUnknown')
      : t(`image.guard.${phase}`, {
        resource: resource.toUpperCase(), required: Math.ceil(Number(required) / 1048576), available: mib(available),
      });
    return;
  }
  const range = /omni_image_range width=(\d+) height=(\d+)/.exec(detail || '');
  if (range) {
    element.textContent = t('image.guardRange', { width: range[1], height: range[2] });
    return;
  }
  if (detail === 'omni_image_runtime_required') {
    element.textContent = t('image.guardRuntime');
    return;
  }
  element.textContent = t('image.failed') + (detail ? ` ${detail}` : '');
  if (/memory|allocat|out.of.device/i.test(detail || '')) {
    element.textContent += ` ${t('image.memory')}`;
  }
}

const dialogLabels = (title) => ({ title: t(title), accept: t('settings.save'), cancel: t('settings.cancel') });

export function mountImageWorkspace() {
  const host = document.getElementById('imageArea');
  const chat = document.getElementById('chatArea');
  const composer = document.getElementById('composerHost');
  const chatTab = document.getElementById('chatTab');
  const imageTab = document.getElementById('imageTab');
  const chatControls = ['btnNewChat', 'statusChip', 'modelLabel'].map((id) => document.getElementById(id));
  host.innerHTML = `
    <section class="image-workspace">
      <form class="image-controls">
        <h2 data-i18n="image.title"></h2>
        <label for="imagePrompt" data-i18n="image.prompt"></label>
        <textarea id="imagePrompt" required maxlength="4096" rows="4"></textarea>
        <div class="image-fields">
          <label><span data-i18n="image.width"></span>
            <input id="imageWidth" type="number" value="512" min="1" step="1" required>
          </label>
          <label><span data-i18n="image.height"></span>
            <input id="imageHeight" type="number" value="512" min="1" step="1" required>
          </label>
          <label><span data-i18n="image.stepCount"></span>
            <input id="imageSteps" type="number" value="20" min="1" max="100" step="1" required>
          </label>
        </div>
        <details>
          <summary data-i18n="image.advanced"></summary>
          <div class="image-advanced-scroll">
            <label for="imageNegative" data-i18n="image.negative"></label>
            <textarea id="imageNegative" maxlength="4096" rows="2"></textarea>
            <div class="image-fields">
              <label><span data-i18n="image.seed"></span>
                <input id="imageSeed" type="number" min="0" max="4294967295" step="1" data-i18n-placeholder="image.random">
              </label>
              <label>CFG
                <input id="imageCfg" type="number" min="0" max="30" step="any" data-i18n-placeholder="language.auto">
              </label>
            </div>
            <label for="imageSampler" data-i18n="image.sampler"></label>
            <select id="imageSampler">
              <option value="" data-i18n="language.auto"></option>
              <option value="euler">Euler</option>
              <option value="euler_a">Euler A</option>
            </select>
            <label for="imageSigmas" data-i18n="image.sigmas"></label>
            <input id="imageSigmas" type="text" maxlength="2048" aria-describedby="imageSigmasHint"
                   data-i18n-placeholder="language.auto">
            <small id="imageSigmasHint" data-i18n="image.sigmasHint"></small>
          </div>
        </details>
        <div class="image-actions">
          <button class="btn primary" type="submit" data-i18n="image.generate"></button>
          <button class="btn" type="button" data-cancel data-i18n="settings.cancel" hidden></button>
        </div>
        <p role="status"></p>
        <progress aria-label="${t('image.generating')}" data-i18n-aria="image.generating" hidden></progress>
        <p role="alert"></p>
        <p role="status" data-draft-status></p>
      </form>
      <div class="image-preview">
        <p data-preview-empty data-i18n="image.empty"></p>
        <figure hidden>
          <img alt="${t('image.preview')}">
          <button class="btn" type="button" data-export data-i18n="image.export"></button>
        </figure>
      </div>
    </section>`;
  applyTranslations(host);
  const form = host.querySelector('form');
  const button = form.querySelector('[type=submit]');
  const cancel = form.querySelector('[data-cancel]');
  const status = host.querySelector('[role=status]');
  const error = host.querySelector('[role=alert]');
  const progress = host.querySelector('progress');
  const figure = host.querySelector('figure');
  const empty = host.querySelector('[data-preview-empty]');
  const preview = figure.querySelector('img');
  const save = figure.querySelector('[data-export]');
  if (desktop()) {
    const fields = [...form.querySelectorAll('input[id], textarea[id], select[id]')];
    const draftStatus = form.querySelector('[data-draft-status]');
    let version = 0;
    const persist = async () => {
      const current = ++version;
      const settings = Object.fromEntries(fields.map(({ id, value }) => [id, value]));
      const reply = await backendRpc('draft-image-save', { settings });
      if (current === version) draftStatus.textContent = reply.ok ? '' : t('settings.saveFailed');
    };
    void backendRpc('draft-image-get').then(({ ok, result }) => {
      if (version) return;
      if (!ok) draftStatus.textContent = t('settings.loadFailed');
      for (const field of fields) {
        const value = result?.[field.id];
        if (typeof value === 'string') field.value = value;
      }
    });
    form.addEventListener('input', persist);
  }
  let pending = false;
  let cancelling = false;
  let outputUrl;
  const paint = () => {
    const message = cancelling ? t('image.cancelling') : pending && !snapshot.busy ? t('image.generating') : stateLabel();
    if (status.textContent !== message) status.textContent = message;
    button.disabled = !desktop() || !snapshot.installed || !snapshot.configured || snapshot.installing || snapshot.busy || pending;
    cancel.hidden = !pending && !snapshot.busy;
    cancel.disabled = cancelling || !snapshot.busy;
    progress.hidden = !pending && !snapshot.busy;
    if (snapshot.progress?.total > 0 && !cancelling) {
      progress.max = snapshot.progress.total;
      progress.value = snapshot.progress.completed || 0;
    } else progress.removeAttribute('value');
  };
  refreshWorkspace = paint;
  function select(images) {
    host.hidden = !images;
    chat.hidden = images;
    composer.hidden = images;
    chatControls.forEach((control) => { control.hidden = images; });
    for (const [tab, selected] of [[chatTab, !images], [imageTab, images]]) {
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
    }
    if (images) { paint(); void refresh(); }
  }
  chatTab.addEventListener('click', () => select(false));
  document.getElementById('btnHistory').addEventListener('click', () => select(false), { capture: true });
  imageTab.addEventListener('click', () => select(true));
  document.getElementById('viewTabs').addEventListener('keydown', (event) => {
    if (![chatTab, imageTab].includes(event.target) || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const images = event.key === 'End' || (event.key !== 'Home' && event.target === chatTab);
    select(images);
    (images ? imageTab : chatTab).focus();
  });
  form.addEventListener('invalid', (event) => {
    const advanced = event.target.closest('details');
    if (advanced) advanced.open = true;
  }, true);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    const prompt = host.querySelector('#imagePrompt').value.trim();
    if (!prompt) return;
    pending = true;
    error.textContent = '';
    paint();
    try {
      const negativePrompt = host.querySelector('#imageNegative').value.trim();
      const seed = host.querySelector('#imageSeed');
      const cfg = host.querySelector('#imageCfg');
      const sampler = host.querySelector('#imageSampler').value;
      const sigmas = host.querySelector('#imageSigmas').value.trim();
      const reply = await rpc('generate', {
        prompt,
        width: host.querySelector('#imageWidth').valueAsNumber,
        height: host.querySelector('#imageHeight').valueAsNumber,
        steps: host.querySelector('#imageSteps').valueAsNumber,
        ...(negativePrompt && { negativePrompt }),
        ...(seed.value !== '' && { seed: seed.valueAsNumber }),
        ...(cfg.value !== '' && { cfg: cfg.valueAsNumber }),
        ...(sampler && { sampler }),
        ...(sigmas && { sigmas }),
      }, 0);
      if (!reply.ok || reply.result?.error) showError(error, reply);
      else if (reply.result?.png) {
        if (outputUrl) URL.revokeObjectURL(outputUrl);
        outputUrl = URL.createObjectURL(new Blob([
          Uint8Array.from(atob(reply.result.png), (char) => char.charCodeAt(0)),
        ], { type: 'image/png' }));
        preview.src = outputUrl;
        figure.hidden = false;
        empty.hidden = true;
      }
    } catch { showError(error); }
    finally {
      pending = false;
      cancelling = false;
      paint();
      void refresh();
    }
  });
  cancel.addEventListener('click', async () => {
    cancelling = true;
    paint();
    const reply = await rpc('cancel');
    if (!reply.ok) { cancelling = false; showError(error, reply); paint(); }
  });
  save.addEventListener('click', async () => {
    save.disabled = true;
    const reply = await rpc('export', dialogLabels('image.export'), 0);
    save.disabled = false;
    if (!reply.ok) showError(error, reply);
  });
  window.addEventListener('omni-locale-change', () => { preview.alt = t('image.preview'); paint(); });
  setInterval(() => {
    if (!host.hidden || pending || document.querySelector('.image-settings')) void refresh();
  }, 500);
}

export function openImageSettings(onBack) {
  const host = document.getElementById('modalHost');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <section class="modal image-settings" role="dialog" aria-modal="true" aria-labelledby="imageSettingsTitle">
      <div class="modal-head">
        <h3 id="imageSettingsTitle" data-i18n="image.settings"></h3>
        <button class="btn" type="button" data-back data-dialog-focus data-i18n="backend.back"></button>
      </div>
      <div class="modal-body">
        <p role="status"></p>
        <p data-version></p>
        <label for="imageDevice" data-i18n="image.device"></label>
        <select id="imageDevice"><option value="cpu">CPU</option><option value="vulkan">Vulkan</option></select>
        <label for="imageModelMode" data-i18n="image.modelType"></label>
        <select id="imageModelMode">
          <option value="checkpoint" data-i18n="image.checkpoint"></option>
          <option value="components" data-i18n="image.components"></option>
        </select>
        <div class="image-actions" data-checkpoint>
          <button class="btn" type="button" data-model data-weight="model" data-i18n="image.choose"></button>
          <b data-path="model"></b>
        </div>
        <div data-components hidden>
          ${['diffusion', 'encoder', 'vae'].map((part) => `
            <div class="image-actions">
              <button class="btn" type="button" data-weight="${part}" data-i18n="image.${part}"></button>
              <b data-path="${part}"></b>
            </div>`).join('')}
        </div>
        <p role="alert"></p>
      </div>
      <div class="modal-foot">
        <button class="btn" type="button" data-install data-i18n="image.install"></button>
        <button class="btn" type="button" data-stop data-i18n="image.stop"></button>
        <button class="btn primary" type="button" data-save data-i18n="settings.save"></button>
      </div>
    </section>`;
  applyTranslations(overlay);
  const get = (selector) => overlay.querySelector(selector);
  const device = get('#imageDevice');
  const mode = get('#imageModelMode');
  const weightButtons = [...overlay.querySelectorAll('[data-weight]')];
  let paths = {};
  let dirty = false;
  let pending = false;
  const error = get('[role=alert]');
  const close = () => { refreshDialog = () => {}; overlay.remove(); onBack?.(); };
  get('[data-back]').onclick = close;
  overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  host.replaceChildren(overlay);
  function paint() {
    if (!overlay.isConnected) return;
    if (!dirty) {
      device.value = snapshot.device || 'cpu';
      mode.value = snapshot.components ? 'components' : 'checkpoint';
      paths = { model: snapshot.model, ...snapshot.components };
    }
    const multi = mode.value === 'components';
    get('[data-checkpoint]').hidden = multi;
    get('[data-components]').hidden = !multi;
    get('[role=status]').textContent = stateLabel();
    get('[data-version]').textContent = `sd-server · ${snapshot.version || '—'}`;
    const disabled = pending || !desktop() || !snapshot.device || snapshot.installing || snapshot.busy;
    device.disabled = mode.disabled = disabled;
    for (const button of weightButtons) {
      const part = button.dataset.weight;
      const path = get(`[data-path="${part}"]`);
      path.textContent = paths[part]?.split('/').pop() || '—';
      path.title = paths[part] || '';
      button.disabled = disabled;
    }
    get('[data-save]').disabled = disabled || !dirty;
    get('[data-install]').disabled = disabled || dirty || snapshot.installed;
    get('[data-stop]').disabled = pending || !snapshot.pid;
  }
  async function run(operation) {
    pending = true;
    error.textContent = '';
    paint();
    try { await operation(); }
    catch { showError(error); }
    finally { pending = false; paint(); void refresh(); }
  }
  device.onchange = mode.onchange = () => { dirty = true; paint(); };
  for (const button of weightButtons) {
    button.onclick = () => run(async () => {
      const key = button.dataset.i18n;
      const reply = await rpc('select-model', { ...dialogLabels(key), accept: t(key) }, 0);
      if (!reply.ok) showError(error, reply);
      else if (!reply.cancelled) { paths[button.dataset.weight] = reply.result.path; dirty = true; }
    });
  }
  get('[data-save]').onclick = () => run(async () => {
    const multi = mode.value === 'components';
    const { model, diffusion, encoder, vae } = paths;
    const settings = {
      device: device.value,
      model: model || null,
      components: multi ? { diffusion: diffusion || null, encoder: encoder || null, vae: vae || null } : null,
    };
    const reply = await rpc('save', { settings });
    if (!reply.ok) showError(error, reply);
    else {
      const configured = multi ? Object.values(settings.components).every(Boolean) : !!settings.model;
      snapshot = { ...snapshot, ...settings, configured, installed: settings.device === snapshot.device && snapshot.installed, phase: 'stopped', pid: null };
      dirty = false;
    }
  });
  get('[data-install]').onclick = () => run(async () => {
    const reply = await rpc('install', {}, 0);
    if (!reply.ok) showError(error, reply);
  });
  get('[data-stop]').onclick = () => run(async () => {
    const reply = await rpc('stop');
    if (!reply.ok) showError(error, reply);
  });
  refreshDialog = paint;
  paint();
  void refresh();
}
