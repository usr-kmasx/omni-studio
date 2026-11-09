import { backendRpc } from './backend-manager.js';
import { readAsDataURL, dataUrlToBase64 } from './media.js';
import { icon } from '../utils/icons.js';
import { t } from '../i18n.js';

const CHUNK = 128 * 1024;
export const historyAvailable = () => !!window.webkit?.messageHandlers?.['omni-backend'];

async function call(command, fields) {
  const reply = await backendRpc('history-' + command, fields);
  if (!reply.ok) throw Object.assign(new Error('History ' + command), { code: reply.code });
  return reply.result;
}

export const listHistory = () => call('list');
export const setActiveHistory = (id) => call('active', { id });
export const newHistoryId = () => crypto.randomUUID();

function base64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 16384) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  }
  return btoa(binary);
}

async function saveAsset(id, media) {
  const { kind, name, mime, size, duration, transcript, documentText, expired } = media;
  const metadata = { kind, name, mime, size, duration, transcript, documentText, expired };
  if (expired || media.assetId) return { ...metadata, assetId: media.assetId, expiresAt: media.expiresAt };
  const source = media.file || (media.dataUrl || media.url
    ? await fetch(media.dataUrl || media.url).then((response) => response.blob())
    : null);
  if (!source) return metadata;
  const assetId = newHistoryId();
  let result;
  for (let offset = 0; offset < source.size; offset += CHUNK) {
    const chunk = await source.slice(offset, offset + CHUNK).arrayBuffer();
    result = await call('media-write', {
      id, assetId, offset, data: base64(new Uint8Array(chunk)), last: offset + CHUNK >= source.size,
    });
  }
  if (result) {
    media.assetId = assetId;
    media.expiresAt = result.expiresAt;
  }
  return { ...metadata, assetId: media.assetId, expiresAt: media.expiresAt, size: source.size, mime: source.type || mime };
}

export async function saveHistory(id, snapshot) {
  const messages = [];
  for (const message of snapshot) {
    const media = [];
    for (const attachment of message.media || []) media.push(await saveAsset(id, attachment));
    const speech = message.speech ? await saveAsset(id, message.speech) : undefined;
    messages.push({ ...message, media, speech });
  }
  return call('save', { id, messages });
}

async function loadAsset(id, asset) {
  if (asset.expired || !asset.assetId || asset.kind === 'document') return asset;
  const chunks = [];
  try {
    for (let offset = 0; ; ) {
      const result = await call('media-read', { id, assetId: asset.assetId, offset });
      if (!result.count) break;
      chunks.push(Uint8Array.from(atob(result.data), (char) => char.charCodeAt(0)));
      offset += result.count;
      if (result.eof) break;
    }
  } catch (error) {
    if (error.code !== 'not_found') throw error;
    return { ...asset, expired: true };
  }
  const blob = new Blob(chunks, { type: asset.mime || 'application/octet-stream' });
  if (asset.kind === 'speech') return { ...asset, url: URL.createObjectURL(blob) };
  const dataUrl = await readAsDataURL(blob);
  return { ...asset, dataUrl, base64: dataUrlToBase64(dataUrl) };
}

export async function loadHistory(id) {
  const chat = await call('get', { id });
  for (const message of chat.messages) {
    const media = [];
    for (const asset of message.media || []) media.push(await loadAsset(id, asset));
    message.media = media;
    if (message.speech) message.speech = await loadAsset(id, message.speech);
    if (message.pendingTranscript && media[0]?.expired) message.pendingTranscript = false;
  }
  return chat;
}

export function openHistory({ onOpen, onDelete, onError }) {
  const host = document.getElementById('modalHost');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <section class="modal modal--tall history-modal" role="dialog" aria-modal="true" aria-labelledby="historyTitle">
      <div class="modal-head">
        <h3 id="historyTitle">${t('history.title')}</h3>
        <button class="icon-btn" type="button" data-close aria-label="${t('settings.close')}">${icon('close')}</button>
      </div>
      <div class="modal-body">
        <p data-status role="status"></p>
        <ul class="history-list"></ul>
      </div>
    </section>`;
  const status = overlay.querySelector('[data-status]');
  const list = overlay.querySelector('ul');
  let busy = false;
  const close = () => { if (!busy) overlay.remove(); };
  overlay.querySelector('[data-close]').addEventListener('click', close);
  overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  host.replaceChildren(overlay);

  function action(key, glyph, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-btn';
    button.innerHTML = icon(glyph, 16);
    button.title = t(key);
    button.setAttribute('aria-label', t(key));
    button.addEventListener('click', handler);
    return button;
  }

  async function run(operation) {
    if (busy) return;
    busy = true;
    try { await operation(); }
    catch { onError(); }
    finally { busy = false; }
  }

  function rename(row, target) {
    if (busy) return;
    const item = target.closest('li');
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 160;
    input.required = true;
    input.setAttribute('aria-label', t('history.rename'));
    input.value = row.title || '';
    const save = document.createElement('button');
    save.className = 'btn';
    save.textContent = t('settings.save');
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn';
    cancel.textContent = t('settings.cancel');
    form.append(input, save, cancel);
    const original = [...item.children];
    item.replaceChildren(form);
    input.focus();
    const cancelRename = () => { item.replaceChildren(...original); target.focus(); };
    cancel.addEventListener('click', cancelRename);
    form.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); cancelRename(); }
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      void run(async () => {
        await call('rename', { id: row.id, title: value });
        await refresh(row.id);
      });
    });
  }

  async function refresh(focusId) {
    if (!historyAvailable()) { status.textContent = t('history.desktopOnly'); return; }
    status.textContent = t('hf.loading');
    const { rows } = await listHistory();
    if (!overlay.isConnected) return;
    status.textContent = rows.length ? '' : t('history.empty');
    list.replaceChildren();
    let focusTarget;
    for (const row of rows) {
      const item = document.createElement('li');
      const title = row.title || t('history.untitled');
      const open = document.createElement('button');
      open.className = 'history-open';
      open.type = 'button';
      open.textContent = title;
      open.title = title;
      open.addEventListener('click', () => run(async () => {
        if (await onOpen(row.id)) overlay.remove();
      }));
      const edit = action('history.rename', 'edit', () => rename(row, edit));
      const pin = action(row.pinned ? 'history.unpin' : 'history.pin', 'pin', () => run(async () => {
        await call('pin', { id: row.id, pinned: !row.pinned });
        await refresh(row.id);
      }));
      pin.setAttribute('aria-pressed', String(!!row.pinned));
      const remove = action('history.delete', 'trash', () => run(async () => {
        if (!confirm(t('history.confirmDelete', { title }))) return;
        await onDelete(row.id, () => call('delete', { id: row.id }));
        await refresh();
        overlay.querySelector('[data-close]').focus();
      }));
      item.append(open, edit, pin, remove);
      list.append(item);
      if (row.id === focusId) focusTarget = open;
    }
    focusTarget?.focus();
  }

  refresh().catch(() => { status.textContent = t('history.failed'); });
}
