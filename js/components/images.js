import { icon } from '../utils/icons.js';
import { backendRpc } from './backend-manager.js';
import { applyTranslations, t } from '../i18n.js';
import { imageDefaults, imageFields, imageGenerationPayload } from '../api/image-generation.js';
import { imageChatLabel } from './image-chat-labels.js';

const desktop = () => !!window.webkit?.messageHandlers?.['omni-backend'];
const rpc = (command, args = {}, timeout) => backendRpc(`image-${command}`, args, timeout);
let snapshot = {};
let polling = false;
let refreshDialog = () => {};

async function refresh() {
  if (!desktop() || polling) return;
  polling = true;
  try {
    const reply = await rpc('status', {}, 3000);
    if (reply.ok) snapshot = reply.result;
    refreshDialog();
  } catch { /* A later status refresh can retry. */ } finally {
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

let legacyDraft;
async function savedGeneration(state) {
  if (state?.generation) return state.generation;
  legacyDraft ??= backendRpc('draft-image-get').then(({ ok, result }) => {
    if (!ok || !result) return null;
    const migrated = Object.fromEntries(Object.keys(imageDefaults)
      .filter((name) => typeof result[name] === 'string').map((name) => [name, result[name]]));
    try { return imageGenerationPayload(migrated); }
    catch { return null; }
  }).catch(() => null);
  const legacy = await legacyDraft;
  if (!legacy) return imageGenerationPayload();
  const reply = await rpc('migrate-generation', { parameters: legacy }).catch(() => null);
  return reply?.ok && reply.result ? reply.result : legacy;
}

function imageError(reply) {
  const label = document.createElement('span');
  showError(label, reply);
  return label.textContent;
}

export async function generateChatImage(prompt, { signal, onProgress }) {
  if (!desktop()) throw new Error(t('image.desktop'));
  const status = await rpc('status');
  if (!status.ok) throw new Error(imageError(status));
  snapshot = status.result;
  if (signal.aborted) return null;
  if (!snapshot.installed || !snapshot.configured || snapshot.installing || snapshot.busy) {
    throw new Error(stateLabel());
  }
  const parameters = await savedGeneration(snapshot);
  if (signal.aborted) return null;
  onProgress({ label: t('image.generating') });

  let done = false;
  let cancelSent = false;
  async function tick() {
    if (done) return;
    try {
      const reply = await rpc('status', {}, 3000);
      if (done) return;
      if (reply.ok) {
        snapshot = reply.result;
        if (signal.aborted && snapshot.busy && !cancelSent) {
          cancelSent = true;
          const response = await rpc('cancel');
          if (!response.ok) cancelSent = false;
        }
        if (!done) {
          const { completed, total } = snapshot.progress || {};
          onProgress({
            label: signal.aborted ? t('image.cancelling') : snapshot.busy ? stateLabel() : t('image.generating'),
            completed, total,
          });
        }
      }
    } catch { cancelSent = false; }
    if (!done) timer = setTimeout(tick, 350);
  }
  let timer = setTimeout(tick, 0);
  try {
    const reply = await rpc('generate', { ...parameters, prompt }, 0);
    if (signal.aborted || reply.result?.cancelled) return null;
    if (!reply.ok || reply.result?.error || !reply.result?.png) throw new Error(imageError(reply));
    return {
      kind: 'image', name: 'omni-image.png', mime: 'image/png',
      dataUrl: 'data:image/png;base64,' + reply.result.png,
    };
  } finally {
    done = true;
    clearTimeout(timer);
    void refresh();
  }
}

export async function exportChatImage(media) {
  const png = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(media.dataUrl || '')?.[1];
  if (!png) throw new Error(t('image.failed'));
  const reply = await rpc('export', { ...dialogLabels('image.export'), png }, 0);
  if (!reply.ok) throw new Error(imageError(reply));
}

export function openImageSettings(onBack) {
  const host = document.getElementById('modalHost');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <section class="modal modal--tall omni-panel image-settings" role="dialog" aria-modal="true" aria-labelledby="imageSettingsTitle">
      <div class="modal-head omni-panel-header">
        <button class="btn omni-panel-icon" type="button" data-back data-dialog-focus data-i18n-title="backend.back" data-i18n-aria="backend.back"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 5-7 7 7 7M5 12h14"/></svg></button>
        <h3>${icon('image', 20)} <span id="imageSettingsTitle" data-i18n="image.settings"></span></h3>
        <button class="btn omni-panel-icon" type="button" data-close data-i18n-title="settings.close" data-i18n-aria="settings.close">${icon('close', 18)}</button>
      </div>
      <div class="modal-body">
        <section class="image-settings-card image-backend-card">
          <div>
            <strong>${imageChatLabel('backend')}</strong>
            <div class="image-backend-meta"><span class="image-state-dot" aria-hidden="true"></span><span role="status"></span><small data-version></small></div>
          </div>
          <div class="image-settings-actions">
            <button class="btn" type="button" data-install data-i18n="image.install"></button>
            <button class="btn" type="button" data-stop data-i18n="image.stop"></button>
          </div>
        </section>
        <section class="image-settings-card image-settings-grid">
          <div class="field">
            <label for="imageDevice" data-i18n="image.device"></label>
            <select id="imageDevice"><option value="cpu">CPU</option><option value="vulkan">Vulkan</option></select>
          </div>
          <div class="field">
            <label for="imageModelMode" data-i18n="image.modelType"></label>
            <select id="imageModelMode">
              <option value="checkpoint" data-i18n="image.checkpoint"></option>
              <option value="components" data-i18n="image.components"></option>
            </select>
          </div>
        </section>
        <section class="image-settings-card image-model-card">
          <strong>${imageChatLabel('model')}</strong>
          <div class="image-weight-row" data-checkpoint>
            <div><span data-i18n="image.checkpoint"></span><b data-path="model"></b></div>
            <button class="btn" type="button" data-weight="model" data-i18n="image.choose"></button>
          </div>
          <div data-components hidden>
            ${['diffusion', 'encoder', 'vae'].map((part) => `
              <div class="image-weight-row">
                <div><span data-i18n="image.${part}"></span><b data-path="${part}"></b></div>
                <button class="btn" type="button" data-weight="${part}" data-i18n="backend.choose"></button>
              </div>`).join('')}
          </div>
        </section>
        <form class="image-settings-card image-generation-options">
          <strong>${imageChatLabel('parameters')}</strong>
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
        </form>
        <p role="alert"></p>
      </div>
      <div class="modal-foot">
        <button class="btn" type="button" data-close data-i18n="settings.close"></button>
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
  const form = get('.image-generation-options');
  const fields = [...form.querySelectorAll('[id]')].filter((field) => Object.hasOwn(imageDefaults, field.id));
  let initialized = false;
  let closed = false;
  const timer = setInterval(() => {
    if (!overlay.isConnected) clearInterval(timer);
    else void refresh();
  }, 500);
  const close = () => {
    if (pending) return;
    closed = true;
    clearInterval(timer);
    refreshDialog = () => {};
    overlay.remove();
    onBack?.();
  };
  get('[data-back]').onclick = close;
  overlay.querySelectorAll('[data-close]').forEach((button) => { button.onclick = close; });
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
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
    get('[data-version]').textContent = snapshot.version ? `· sd-server · ${snapshot.version}` : '';
    get('.image-state-dot').classList.toggle('is-ready', snapshot.phase === 'ready');
    const disabled = pending || !desktop() || !snapshot.device || snapshot.installing || snapshot.busy;
    device.disabled = mode.disabled = disabled;
    for (const field of fields) field.disabled = disabled || !initialized;
    for (const button of weightButtons) {
      const part = button.dataset.weight;
      const path = get(`[data-path="${part}"]`);
      path.textContent = paths[part]?.split('/').pop() || '—';
      path.title = paths[part] || '';
      button.disabled = disabled;
    }
    get('[data-save]').disabled = disabled || !initialized || !dirty;
    get('[data-install]').hidden = !!snapshot.installed;
    get('[data-stop]').hidden = !snapshot.pid;
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
  device.onchange = mode.onchange = form.oninput = () => { dirty = true; paint(); };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    get('[data-save]').click();
  });
  form.addEventListener('invalid', (event) => {
    const advanced = event.target.closest('details');
    if (advanced) advanced.open = true;
  }, true);
  for (const button of weightButtons) {
    button.onclick = () => run(async () => {
      const key = button.dataset.i18n;
      const reply = await rpc('select-model', { ...dialogLabels(key), accept: t(key) }, 0);
      if (!reply.ok) showError(error, reply);
      else if (!reply.cancelled) { paths[button.dataset.weight] = reply.result.path; dirty = true; }
    });
  }
  get('[data-save]').onclick = () => {
    if (!form.reportValidity()) return;
    return run(async () => {
      const generation = imageGenerationPayload(Object.fromEntries(fields.map(({ id, value }) => [id, value])));
      const multi = mode.value === 'components';
      const { model, diffusion, encoder, vae } = paths;
      const settings = {
        device: device.value,
        generation,
        model: model || null,
        components: multi ? { diffusion: diffusion || null, encoder: encoder || null, vae: vae || null } : null,
      };
      const reply = await rpc('save', { settings });
      if (!reply.ok) showError(error, reply);
      else {
        const backendChanged = settings.device !== snapshot.device ||
          !!settings.components !== !!snapshot.components || settings.model !== snapshot.model ||
          ['diffusion', 'encoder', 'vae'].some((key) => settings.components?.[key] !== snapshot.components?.[key]);
        const configured = multi ? Object.values(settings.components).every(Boolean) : !!settings.model;
        snapshot = { ...snapshot, ...settings, configured, installed: settings.device === snapshot.device && snapshot.installed, ...(backendChanged && { phase: 'stopped', pid: null }) };
        dirty = false;
      }
    });
  };
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
  void (async () => {
    await refresh();
    if (closed || !overlay.isConnected) return;
    const defaults = await savedGeneration(snapshot);
    if (closed || !overlay.isConnected) return;
    const values = imageFields(defaults);
    for (const field of fields) field.value = values[field.id];
    initialized = true;
    paint();
  })();
}
