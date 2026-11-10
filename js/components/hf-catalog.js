import { icon } from '../utils/icons.js';
import { newRequestId } from '../utils/id.js';
import { applyTranslations, getLocale, t } from '../i18n.js';
import { formatBytes } from './media.js';

function request(cmd, fields = {}, onProgress) {
  const bridge = window.webkit?.messageHandlers?.['omni-backend'];
  if (!bridge) return Promise.resolve({ ok: false, code: 'native' });
  return new Promise((resolve) => {
    const requestId = newRequestId();
    const timeout = ['hf-download', 'hf-resume-download'].includes(cmd) ? null : setTimeout(() => finish({ ok: false, code: 'network' }), 65000);
    function finish(result) {
      clearTimeout(timeout);
      window.removeEventListener('omni-backend-command-result', receive);
      resolve(result);
    }
    function receive({ detail }) {
      if (detail?.requestId !== requestId) return;
      if (detail.progress) onProgress?.(detail.progress);
      else finish(detail);
    }
    window.addEventListener('omni-backend-command-result', receive);
    try { bridge.postMessage(JSON.stringify({ cmd, requestId, ...fields })); }
    catch { finish({ ok: false, code: 'native' }); }
  });
}

const errorKey = {
  native: 'hf.native', network: 'hf.network', folder: 'hf.folderError',
  busy: 'hf.busy', exists: 'hf.exists', space: 'hf.space',
  variant: 'hf.variantMissing', download: 'hf.downloadError', paused: 'hf.pausedExists',
};

let activeTransfer = null;
let pausedTransfer = null;
let pauseExpiryTimer;
let transferPanel;

function showTransfer(transfer, key, vars = {}) {
  if (!transferPanel) {
    transferPanel = document.createElement('aside');
    transferPanel.className = 'hf-transfer';
    transferPanel.innerHTML = `
      <button class="icon-btn hf-transfer-toggle" type="button" aria-expanded="true"></button>
      <div class="hf-transfer-body" id="hfTransferBody">
      <strong class="hf-transfer-title"><span><span></span><span aria-hidden="true"></span></span></strong><span role="status"></span>
      <progress data-i18n-aria="hf.downloading"></progress>
      <small data-transfer-stats></small>
      <small data-transfer-eta></small>
      <details data-transfer-results hidden><summary data-i18n="hf.transferResults"></summary><ul></ul></details>
      <div class="hf-transfer-buttons"><button class="btn" type="button" data-pause></button>
      <button class="btn" type="button" data-skip-verification hidden data-i18n="hf.skipVerification"></button>
      <button class="btn" type="button" data-stop></button></div></div>`;
    const host = document.getElementById('modalHost');
    const placePanel = () => (host.querySelector('.modal') || document.body).append(transferPanel);
    new MutationObserver(placePanel).observe(host, { childList: true });
    placePanel();
    const toggle = transferPanel.querySelector('.hf-transfer-toggle');
    const body = transferPanel.querySelector('.hf-transfer-body');
    const logo = document.createElement('img');
    logo.src = new URL('../../assets/studio.omni.app.svg', import.meta.url).href;
    logo.alt = '';
    toggle.append(logo);
    toggle.setAttribute('aria-controls', body.id);
    const setCollapsed = (collapsed) => {
      body.hidden = collapsed;
      transferPanel.classList.toggle('is-collapsed', collapsed);
      toggle.setAttribute('aria-expanded', String(!collapsed));
      const key = collapsed ? 'hf.showTransfer' : 'hf.hideTransfer';
      toggle.dataset.i18nTitle = toggle.dataset.i18nAria = key;
      toggle.title = t(key);
      toggle.setAttribute('aria-label', t(key));
    };
    setCollapsed(false);
    toggle.addEventListener('click', () => setCollapsed(!body.hidden));
    applyTranslations(transferPanel);
    const title = transferPanel.querySelector('.hf-transfer-title');
    const name = title.firstElementChild.firstElementChild;
    const fitTitle = () => {
      const overflow = Math.max(0, name.offsetWidth - title.clientWidth);
      const travel = name.offsetWidth + 28;
      title.classList.toggle('is-overflowing', title.clientWidth > 0 && overflow > 0);
      title.style.setProperty('--title-travel', `-${travel}px`);
      title.style.setProperty('--title-duration', `${Math.max(4, travel / 42)}s`);
    };
    const observer = new ResizeObserver(fitTitle);
    observer.observe(title);
    observer.observe(name);
    transferPanel.querySelector('[data-pause]').addEventListener('click', async () => {
      if (pausedTransfer) {
        const job = pausedTransfer;
        pausedTransfer = null;
        clearTimeout(pauseExpiryTimer);
        activeTransfer = job;
        job.stopping = job.pausing = job.skipping = false;
        showTransfer(job, 'hf.downloading');
        const result = await request('hf-resume-download', {}, (sample) => updateTransfer(job, sample));
        finishTransfer(job, result);
        if (!result.ok) {
          const status = await request('hf-download-status');
          if (status.ok && status.result && !activeTransfer) showPaused(status.result, 'hf.resumeError');
        }
        return;
      }
      const job = activeTransfer;
      if (!job || job.stopping || job.pausing) return;
      job.pausing = true;
      showTransfer(job, 'hf.pausingDownload');
      const response = await request('hf-pause-download');
      if (!response.ok && activeTransfer === job) {
        job.pausing = false;
        showTransfer(job, 'hf.pauseError');
      }
    });
    transferPanel.querySelector('[data-skip-verification]').addEventListener('click', async () => {
      const job = activeTransfer;
      if (!job || !job.verifying || job.skipping) return;
      job.skipping = true;
      showTransfer(job, 'hf.finalizing');
      const result = await request('hf-skip-verification');
      if (!result.ok && activeTransfer === job) {
        job.skipping = false;
        showTransfer(job, 'hf.verifying');
      }
    });
    transferPanel.querySelector('[data-stop]').addEventListener('click', async () => {
      if (pausedTransfer) {
        const job = pausedTransfer;
        const result = await request('hf-cancel-download');
        if (pausedTransfer !== job) return;
        if (result.ok) {
          pausedTransfer = null;
          clearTimeout(pauseExpiryTimer);
          showTransfer(job, 'hf.discardedPause');
          } else showTransfer(job, 'hf.cancelDownloadError');
        return;
      }
      const job = activeTransfer;
      if (!job) { transferPanel.hidden = true; return; }
      if (job.stopping) return;
      job.stopping = true;
      showTransfer(job, 'hf.stoppingDownload');
      const result = await request('hf-cancel-download');
      if (!result.ok && activeTransfer === job) {
        job.stopping = false;
        showTransfer(job, 'hf.cancelDownloadError');
      }
    });
  }
  transferPanel.hidden = false;
  const title = transferPanel.querySelector('.hf-transfer-title');
  const [name, repeat] = title.firstElementChild.children;
  if (name.textContent !== transfer.model) {
    name.textContent = repeat.textContent = transfer.model;
    title.title = transfer.model;
  }
  const status = transferPanel.querySelector('[role="status"]');
  status.dataset.i18n = key;
  for (const name of ['Index', 'Count', 'Folder', 'Date']) delete status.dataset['i18nVar' + name];
  for (const [name, value] of Object.entries(vars)) {
    status.dataset['i18nVar' + name[0].toUpperCase() + name.slice(1)] = value;
  }
  const message = t(key, vars);
  if (status.textContent !== message) status.textContent = message;
  const progress = transferPanel.querySelector('progress');
  progress.hidden = activeTransfer !== transfer;
  if (transfer.total > 0) {
    progress.max = transfer.total;
    progress.value = transfer.bytes;
  } else progress.removeAttribute('value');
  const stats = transferPanel.querySelector('[data-transfer-stats]');
  const eta = transferPanel.querySelector('[data-transfer-eta]');
  const bytes = transfer.bytes || 0;
  const total = transfer.total;
  const hasTotal = total > 0;
  stats.hidden = progress.hidden;
  stats.textContent = hasTotal
    ? formatBytes(bytes) + ' / ' + formatBytes(total) + ' · ' +
      (transfer.verifying || bytes >= total ? t('hf.finalizing') :
        new Intl.NumberFormat(getLocale(), { style: 'percent' }).format(Math.min(bytes / total, 0.99)))
    : t('hf.bytesDownloaded', { size: formatBytes(bytes) });
  const remaining = hasTotal && transfer.speed > 0 ? Math.ceil((total - bytes) / transfer.speed) : null;
  eta.hidden = progress.hidden || transfer.stopping || transfer.pausing || transfer.verifying || (hasTotal && bytes >= total);
  if (!eta.hidden && (!transfer.etaAt || performance.now() - transfer.etaAt >= 1000)) {
    transfer.etaAt = performance.now();
    if (remaining > 0 && Number.isFinite(remaining)) {
      const minutes = Math.floor(remaining / 60);
      const clock = minutes >= 60
        ? [Math.floor(minutes / 60), minutes % 60, remaining % 60]
        : [minutes, remaining % 60];
      const time = clock.map((part, index) => index ? String(part).padStart(2, '0') : String(part)).join(':');
      eta.textContent = t('hf.timeRemaining', { time });
    } else eta.textContent = t('hf.estimatingTime');
  }
  const resultPanel = transferPanel.querySelector('[data-transfer-results]');
  resultPanel.hidden = activeTransfer === transfer || !transfer.results?.length;
  if (!resultPanel.hidden) {
    const list = resultPanel.querySelector('ul');
    list.replaceChildren();
    for (const item of transfer.results) {
      const row = document.createElement('li');
      const label = document.createElement('span');
      label.dataset.i18n = item.code === 'done' ? 'hf.itemDone' : errorKey[item.code] || 'hf.downloadError';
      label.textContent = t(label.dataset.i18n);
      row.append(item.name + ' — ', label);
      list.append(row);
    }
  } else resultPanel.open = false;
  const pauseButton = transferPanel.querySelector('[data-pause]');
  pauseButton.hidden = activeTransfer !== transfer && pausedTransfer !== transfer;
  pauseButton.disabled = !!(activeTransfer === transfer && (transfer.pausing || transfer.stopping));
  pauseButton.dataset.i18n = pausedTransfer === transfer ? 'hf.resumeDownload' : 'hf.pauseDownload';
  pauseButton.textContent = t(pauseButton.dataset.i18n);
  transferPanel.querySelector('[data-skip-verification]').hidden =
    activeTransfer !== transfer || !transfer.verifying || transfer.skipping || transfer.stopping || transfer.pausing;
  const button = transferPanel.querySelector('[data-stop]');
  button.disabled = activeTransfer === transfer && transfer.stopping;
  button.dataset.i18n = activeTransfer === transfer || pausedTransfer === transfer ? 'hf.stopDownload' : 'settings.close';
  button.textContent = t(button.dataset.i18n);
}


function showPaused(transfer, key = 'hf.downloadPaused') {
  pausedTransfer = transfer;
  const date = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'short', timeStyle: 'short' })
    .format(new Date(transfer.expires * 1000));
  showTransfer(transfer, key, { date });
  clearTimeout(pauseExpiryTimer);
  pauseExpiryTimer = setTimeout(() => { void restoreHfDownload(); },
    Math.max(1000, transfer.expires * 1000 - Date.now() + 1000));
}

export async function restoreHfDownload() {
  const response = await request('hf-download-status');
  if (!response.ok || activeTransfer) return;
  if (response.result) showPaused(response.result);
  else if (pausedTransfer) {
    const expired = pausedTransfer;
    pausedTransfer = null;
    showTransfer(expired, 'hf.pauseExpired');
  }
}

function updateTransfer(transfer, { bytes, total, speed, index, count, verifying }) {
  Object.assign(transfer, { bytes, total, speed, verifying });
  const key = transfer.stopping ? 'hf.stoppingDownload' : transfer.pausing ? 'hf.pausingDownload'
    : verifying ? (transfer.skipping ? 'hf.finalizing' : 'hf.verifying') : 'hf.batchProgress';
  showTransfer(transfer, key, { index, count });
}

function finishTransfer(transfer, response) {
  activeTransfer = null;
  if (response.paused) {
    showPaused(response.paused);
    if (transfer.stopping) transferPanel.querySelector('[data-stop]').click();
    return {};
  }
  let key;
  let folder;
  if (!response.ok) key = errorKey[response.code] || 'hf.downloadError';
  else if (!response.cancelled) {
    ({ folder } = response.result);
    const { items, interrupted } = response.result;
    transfer.results = items;
    if (interrupted) key = items.some((item) => item.code === 'done')
      ? 'hf.downloadStopped' : 'hf.downloadStoppedEmpty';
    else key = items.every((item) => item.code === 'done') ? 'hf.done' : 'hf.batchFinished';
  }
  if (key) showTransfer(transfer, key, folder ? { folder } : {});
  return { key, folder };
}


const browserLabels = {
  en: ['Back', 'Forward', 'Reload', 'Open in browser', 'Downloads in Omni Studio'],
  pt: ['Voltar', 'Avançar', 'Recarregar', 'Abrir no navegador', 'Downloads no Omni Studio'],
  es: ['Atrás', 'Adelante', 'Recargar', 'Abrir en el navegador', 'Descargas en Omni Studio'],
  fr: ['Précédent', 'Suivant', 'Actualiser', 'Ouvrir dans le navigateur', 'Téléchargements dans Omni Studio'],
  de: ['Zurück', 'Vorwärts', 'Neu laden', 'Im Browser öffnen', 'Downloads in Omni Studio'],
};

async function downloadSiteSelection(selection) {
  if (!selection || activeTransfer || pausedTransfer) return;
  const { repo, revision, variant } = selection;
  if ([repo, revision, variant].some(value => typeof value !== 'string' || !value)) return;
  const transfer = { model: repo, stopping: false };
  activeTransfer = transfer;
  const response = await request('hf-download', {
    repo, revision, variants: [variant],
    folderTitle: t('hf.chooseFolder'),
    acceptLabel: t('hf.download'),
    cancelLabel: t('settings.cancel'),
  }, sample => updateTransfer(transfer, sample));
  finishTransfer(transfer, response);
}

window.addEventListener('omni-hf-site-download', ({ detail }) => {
  void downloadSiteSelection(detail);
});

export async function openHfCatalog({ onBack }) {
  const [back, forward, reload, external, downloads] = browserLabels[getLocale()] ?? browserLabels.en;
  const response = await request('hf-open-site', {
    labels: { back, forward, reload, external, downloads, close: t('hf.back'),
      loading: t('hf.loading'), error: t('hf.variantMissing'), busy: t('hf.busy') },
  });
  if (response.ok) return;

  const host = document.getElementById('modalHost');
  const dialog = document.createElement('section');
  dialog.className = 'modal hf-page';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', t('hf.title'));
  const header = document.createElement('header');
  header.className = 'hf-header';
  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'btn';
  backButton.dataset.i18n = 'hf.back';
  backButton.addEventListener('click', onBack);
  const heading = document.createElement('h2');
  heading.dataset.i18n = 'hf.title';
  header.append(backButton, heading);
  const content = document.createElement('div');
  content.className = 'hf-content';
  const message = document.createElement('p');
  message.dataset.i18n = errorKey[response.code] || 'hf.network';
  const link = document.createElement('a');
  link.href = 'https://huggingface.co/models';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = external;
  content.append(message, link);
  dialog.append(header, content);
  applyTranslations(dialog);
  host.replaceChildren(dialog);
  backButton.focus();
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') onBack();
  });
}
