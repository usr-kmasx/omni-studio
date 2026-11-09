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
    const logo = document.querySelector('#topbar .logo svg');
    if (logo) toggle.append(logo.cloneNode(true));
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
          notifyTransferChange();
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

function notifyTransferChange() {
  document.querySelector('.hf-page')?.dispatchEvent(new Event('hf-transfer-ended'));
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
  notifyTransferChange();
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
    notifyTransferChange();
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
  notifyTransferChange();
  return { key, folder };
}

function safeUrl(value, base) {
  try {
    const url = new URL(value, base);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch { /* link inválido */ }
  return null;
}

const readmeTags = new Set((
  'a abbr b blockquote br caption code dd del details div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 ' +
  'hr i img kbd li mark ol p pre s small span strong sub summary sup table tbody td th thead tfoot tr ul'
).split(' '));
const discardedReadmeTags = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template']);

function copyReadmeNode(node, target, linkBase, assetBase) {
  if (node.nodeType === Node.TEXT_NODE) {
    target.append(document.createTextNode(node.data));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || node.namespaceURI !== 'http://www.w3.org/1999/xhtml') return;
  const tag = node.localName;
  if (discardedReadmeTags.has(tag)) return;

  const element = readmeTags.has(tag) ? document.createElement(tag) : null;
  if (element) {
    if (tag === 'a') {
      const raw = node.getAttribute('href');
      if (raw) {
        // Alguns READMEs usam a sintaxe Markdown dentro do atributo HTML.
        const markdownLink = /^\[[^\]]*\]\((https?:\/\/[^\s]+)\)$/.exec(raw.trim());
        const href = safeUrl(markdownLink?.[1] || raw, linkBase);
        if (href) element.href = href;
      }
    }
    if (tag === 'img') {
      const raw = node.getAttribute('src');
      const src = raw && safeUrl(raw, assetBase);
      if (!src) return;
      element.loading = 'lazy';
      element.referrerPolicy = 'no-referrer';
      element.alt = node.getAttribute('alt') || '';
      element.src = src;
    }
    if (['img', 'td', 'th', 'table'].includes(tag)) {
      const width = node.getAttribute('width') || '';
      if (/^\d{1,4}%?$/.test(width)) element.style.width = width.endsWith('%') ? width : width + 'px';
    }
    const align = node.getAttribute('align');
    if (['div', 'p', 'td', 'th'].includes(tag) && ['left', 'center', 'right'].includes(align)) {
      element.style.textAlign = align;
    }
    for (const attr of ['colspan', 'rowspan']) {
      const value = node.getAttribute(attr) || '';
      if (['td', 'th'].includes(tag) && /^\d{1,2}$/.test(value)) element.setAttribute(attr, value);
    }
    if (tag === 'details') element.open = node.hasAttribute('open');
    if (tag === 'ol' && /^-?\d{1,8}$/.test(node.getAttribute('start') || '')) {
      element.setAttribute('start', node.getAttribute('start'));
    }
    if (node.hasAttribute('title')) element.title = node.getAttribute('title');
    target.append(element);
  }
  for (const child of node.childNodes) copyReadmeNode(child, element || target, linkBase, assetBase);
}

async function renderReadme(markdown, repoUrl, revision) {
  const module = await import('../../vendor/markdown-it/markdown-it.min.js');
  const parser = (module.default || globalThis.markdownit)({ html: true, linkify: true });
  // O template é inerte. Apenas nós e atributos reconstruídos entram na página.
  const template = document.createElement('template');
  template.innerHTML = parser.render(markdown);
  const content = document.createDocumentFragment();
  const linkBase = repoUrl + '/blob/' + revision + '/README.md';
  const assetBase = repoUrl + '/resolve/' + revision + '/README.md';
  for (const node of template.content.childNodes) copyReadmeNode(node, content, linkBase, assetBase);
  return content;
}

export function openHfCatalog({ onBack }) {
  const host = document.getElementById('modalHost');
  const page = document.createElement('div');
  page.className = 'hf-page modal';
  page.setAttribute('role', 'dialog');
  page.setAttribute('aria-modal', 'true');
  page.setAttribute('aria-labelledby', 'hfTitle');
  page.innerHTML = `
    <header class="hf-header">
      <button class="btn ghost" type="button" data-back data-i18n="hf.back"></button>
      <h2 id="hfTitle" data-i18n="hf.title"></h2>
    </header>
    <section class="hf-content">
      <div class="hf-toolbar">
        <p data-intro data-i18n="hf.intro"></p>
        <label class="hf-search">${icon('search', 16)}
          <input type="search" maxlength="160" data-i18n-aria="hf.search" data-i18n-placeholder="hf.search">
        </label>
        <h3 data-i18n="hf.trending"></h3>
      </div>
      <div class="hf-scroll">
        <p class="hf-status" role="status"></p>
        <ul class="hf-list"></ul>
        <div class="hf-download-controls" hidden>
          <button class="btn" type="button" data-expand hidden></button>
          <span data-selected></span>
          <button class="btn" type="button" data-download>${icon('download', 16)} <span data-i18n="hf.downloadSelected"></span></button>
        </div>
        <ul class="hf-results" aria-live="polite"></ul>
        <section class="hf-readme" hidden>
          <h4 data-i18n="hf.description"></h4>
          <div class="md"></div>
        </section>
        <a class="hf-repo" hidden data-i18n="hf.repository"></a>
      </div>
    </section>`;
  const back = page.querySelector('[data-back]');
  const intro = page.querySelector('[data-intro]');
  const search = page.querySelector('input');
  const heading = page.querySelector('h3');
  const status = page.querySelector('.hf-status');
  const scroll = page.querySelector('.hf-scroll');
  const list = page.querySelector('.hf-list');
  const controls = page.querySelector('.hf-download-controls');
  const expand = page.querySelector('[data-expand]');
  const downloadButton = page.querySelector('[data-download]');
  const countLabel = page.querySelector('[data-selected]');
  const readme = page.querySelector('.hf-readme');
  const repoLink = page.querySelector('.hf-repo');
  const results = page.querySelector('.hf-results');
  let models = [];
  let detail = null;
  let downloading = false;
  let searchTimer;
  let searchVersion = 0;
  let catalogPosition = 0;
  let catalogFocus = '';

  function label(element, key, vars = {}) {
    element.dataset.i18n = key;
    for (const name of Object.keys(element.dataset)) {
      if (name.startsWith('i18nVar')) delete element.dataset[name];
    }
    for (const [name, value] of Object.entries(vars)) {
      element.dataset['i18nVar' + name[0].toUpperCase() + name.slice(1)] = value;
    }
    const value = t(key, vars);
    if (element.textContent !== value) element.textContent = value;
  }
  function showStatus(key, vars) {
    if (key) label(status, key, vars);
    else {
      delete status.dataset.i18n;
      status.textContent = '';
    }
  }

  function row(name, description, action) {
    const item = document.createElement('li');
    const info = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = name;
    info.append(title, description);
    if (action.matches('input[type="checkbox"]')) {
      const label = document.createElement('label');
      label.className = 'hf-variant-choice';
      label.append(info, action);
      item.classList.add('hf-variant-row');
      item.append(label);
    } else item.append(info, action);
    list.append(item);
  }

  function showModels(restoreFocus = false) {
    label(heading, search.value.trim() ? 'hf.searchResults' : 'hf.trending');
    list.replaceChildren();
    let previousButton;
    for (const model of models) {
      const author = document.createElement('small');
      author.textContent = model.author;
      const button = document.createElement('button');
      button.className = 'btn';
      button.type = 'button';
      button.innerHTML = `${icon('file', 16)} <span></span>`;
      label(button.querySelector('span'), 'hf.viewModel');
      button.addEventListener('click', () => showDetail(model));
      row(model.name, author, button);
      if (model.id === catalogFocus) previousButton = button;
    }
    if (restoreFocus) {
      (previousButton || search).focus({ preventScroll: true });
      scroll.scrollTop = catalogPosition;
    }
  }

  function searchCatalog() {
    const version = ++searchVersion;
    const query = search.value.trim();
    clearTimeout(searchTimer);
    models = [];
    showModels();
    scroll.scrollTop = 0;
    showStatus('hf.loading');
    searchTimer = setTimeout(async () => {
      const response = await request(query ? 'hf-search' : 'hf-trending', { query });
      if (!page.isConnected || detail || version !== searchVersion) return;
      models = response.ok ? response.result : [];
      showModels();
      showStatus(!response.ok ? errorKey[response.code] || 'hf.network'
        : models.length ? null : query ? 'hf.emptySearch' : 'hf.empty');
    }, query ? 280 : 0);
  }

  function updateSelection() {
    const selected = detail.variants.filter((variant) => detail.selected.has(variant.name));
    const known = selected.length > 0 && selected.every((variant) => variant.size != null);
    const vars = { count: selected.length, size: known ? formatBytes(selected.reduce((sum, variant) => sum + variant.size, 0)) : '' };
    label(countLabel, known ? 'hf.selectedSize' : 'hf.selectedCount', vars);
    downloadButton.disabled = !!activeTransfer || !!pausedTransfer || downloading || !selected.length;
  }

  function renderVariants() {
    list.replaceChildren();
    expand.hidden = detail.variants.length <= 3;
    label(expand, detail.expanded ? 'hf.showPreview' : 'hf.allFiles');
    expand.setAttribute('aria-expanded', String(detail.expanded));
    controls.hidden = !detail.variants.length;
    for (const variant of detail.expanded ? detail.variants : detail.variants.slice(0, 3)) {
      const meta = document.createElement('small');
      if (variant.projector) {
        const badge = document.createElement('span');
        label(badge, 'hf.projector');
        meta.append(badge, ' · ');
      }
      if (variant.files.length > 1) {
        const parts = document.createElement('span');
        label(parts, 'hf.parts', { count: variant.files.length });
        meta.append(parts, ' · ');
      }
      const size = document.createElement('span');
      if (variant.size != null) size.textContent = formatBytes(variant.size);
      else label(size, 'hf.unknownSize');
      meta.append(size);
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.setAttribute('aria-label', variant.name);
      checkbox.checked = detail.selected.has(variant.name);
      checkbox.disabled = downloading;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) detail.selected.add(variant.name);
        else detail.selected.delete(variant.name);
        updateSelection();
      });
      row(variant.name, meta, checkbox);
    }
    updateSelection();
  }

  async function showDetail(model) {
    catalogPosition = scroll.scrollTop;
    catalogFocus = model.id;
    const current = { model, variants: [], selected: new Set(), expanded: false };
    detail = current;
    intro.hidden = true;
    search.closest('label').hidden = true;
    delete heading.dataset.i18n;
    heading.textContent = model.id;
    label(back, 'hf.backCatalog');
    list.replaceChildren();
    results.replaceChildren();
    back.focus();
    scroll.scrollTop = 0;
    showStatus('hf.loading');
    const repoUrl = 'https://huggingface.co/' + model.id.split('/').map(encodeURIComponent).join('/');
    repoLink.href = repoUrl;
    repoLink.hidden = false;

    const response = await request('hf-variants', { repo: model.id });
    if (!page.isConnected || detail !== current) return;
    if (!response.ok) { showStatus(errorKey[response.code] || 'hf.network'); return; }
    current.variants = response.result.variants;
    current.revision = response.result.revision;
    showStatus(current.variants.length ? null : 'hf.emptyVariants');
    renderVariants();

    const description = await request('hf-readme', { repo: model.id, revision: current.revision });
    if (!description.ok || !description.result || !page.isConnected || detail !== current) return;
    try {
      const content = await renderReadme(description.result, repoUrl, current.revision);
      if (!page.isConnected || detail !== current) return;
      readme.querySelector('.md').replaceChildren(content);
      readme.hidden = false;
    } catch (error) { console.warn('Hugging Face README:', error); }
  }

  function setDownloading(value) {
    downloading = value;
    expand.disabled = value;
    list.querySelectorAll('input').forEach((input) => { input.disabled = value; });
    updateSelection();
  }

  async function downloadSelected() {
    if (activeTransfer || pausedTransfer || downloading || !detail?.selected.size) return;
    const current = detail;
    const transfer = { model: current.model.id, stopping: false };
    activeTransfer = transfer;
    setDownloading(true);
    results.replaceChildren();
    showStatus('hf.chooseFolder');
    const response = await request('hf-download', {
      repo: current.model.id,
      revision: current.revision,
      variants: [...current.selected],
      folderTitle: t('hf.chooseFolder'),
      acceptLabel: t('hf.download'),
      cancelLabel: t('settings.cancel'),
    }, (sample) => {
      updateTransfer(transfer, sample);
      if (page.isConnected && detail === current) showStatus(null);
    });
    downloading = false;
    const { key, folder } = finishTransfer(transfer, response);
    if (!page.isConnected || detail !== current) return;
    setDownloading(false);
    showStatus(key, folder ? { folder } : {});
    if (response.ok && !response.cancelled && !response.paused) {
      const { items } = response.result;
      for (const item of items) {
        const line = document.createElement('li');
        const result = document.createElement('span');
        label(result, item.code === 'done' ? 'hf.itemDone' : errorKey[item.code] || 'hf.downloadError');
        line.append(item.name + ' — ', result);
        results.append(line);
      }
    }
  }

  page.addEventListener('hf-transfer-ended', () => { if (detail) updateSelection(); });
  search.addEventListener('input', searchCatalog);
  expand.addEventListener('click', () => {
    detail.expanded = !detail.expanded;
    renderVariants();
  });
  downloadButton.addEventListener('click', downloadSelected);
  page.addEventListener('click', async (event) => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    event.preventDefault();
    const url = safeUrl(link.href);
    if (url && !(await request('hf-open-link', { url })).ok) showStatus('hf.linkError');
  });
  back.addEventListener('click', () => {
    if (!detail) { clearTimeout(searchTimer); onBack(); return; }
    detail = null;
    controls.hidden = readme.hidden = repoLink.hidden = true;
    results.replaceChildren();
    readme.querySelector('.md').replaceChildren();
    intro.hidden = search.closest('label').hidden = false;
    label(back, 'hf.back');
    showStatus(null);
    showModels(true);
  });
  page.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') back.click();
  });
  applyTranslations(page);
  host.replaceChildren(page);
  searchCatalog();
}
