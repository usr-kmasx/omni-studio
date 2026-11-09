// ============================================================
// Composer: campo de texto, anexos, arrastar/soltar, colar,
// botão de microfone (grava anexo de áudio) e envio/parada.
// ============================================================

import { icon } from '../utils/icons.js';
import { appToast } from '../utils/toast.js';
import {
  makeDraftAttachment,
  prepareAttachment,
  captureVideoThumb,
  formatBytes,
} from './media.js';
import { Recorder } from './audio.js';
import { t } from '../i18n.js';

export function createComposer(hostEl, handlers = {}) {
  const { onSubmit, onStop, onRecordingChange, onLive } = handlers;

  const root = el(`
    <div class="composer">
      <textarea rows="1" data-i18n-placeholder="composer.placeholder" placeholder="Ask anything…"></textarea>
      <div class="att-row"></div>
      <div class="composer-actions">
        <div class="attach-group">
          <button class="icon-btn" data-attach type="button" data-i18n-title="composer.attachFiles" data-i18n-aria="composer.attachFiles" title="${t('composer.attachFiles')}" aria-label="${t('composer.attachFiles')}">${icon('plus')}</button>
          <input type="file" hidden multiple accept="image/*,audio/*,video/*,.txt,.md,.markdown,.pdf,.docx">
        </div>
        <div class="composer-metrics" hidden></div>
        <div class="composer-actions-right">
          <button class="icon-btn mic-btn" data-i18n-title="composer.record" data-i18n-aria="composer.record" title="${t('composer.record')}" aria-label="${t('composer.record')}" type="button">${icon('mic')}</button>
          <button class="icon-btn live-btn" type="button" aria-pressed="false">${icon('waveform', 19)}</button>
          <button class="send-btn" data-i18n-title="composer.send" title="Send" type="button">${icon('send', 19)}</button>
        </div>
      </div>
    </div>
  `);
  hostEl.replaceChildren(root);

  const attRow = root.querySelector('.att-row');
  const textarea = root.querySelector('textarea');
  const fileInput = root.querySelector('input[type=file]');
  const sendBtn = root.querySelector('.send-btn');
  const metrics = root.querySelector('.composer-metrics');
  let metricSpeed = null;
  let metricUsed = null;
  let metricLimit = null;

  function paintMetrics() {
    metrics.hidden = false;
    const speed = metricSpeed == null ? '—' : metricSpeed.toFixed(1);
    const context = metricUsed == null ? t('composer.contextPending')
      : metricLimit > 0 ? t('composer.contextUsage', {
        used: metricUsed, limit: metricLimit, percent: Math.min(100, Math.round(100 * metricUsed / metricLimit)),
      }) : t('composer.contextTokens', { used: metricUsed });
    const value = t('composer.tokenRate', { speed }) + ' · ' + context;
    if (metrics.textContent !== value) metrics.textContent = value;
  }
  paintMetrics();
  window.addEventListener('omni-locale-change', paintMetrics);
  const micBtn = root.querySelector('.mic-btn');
  const liveBtn = root.querySelector('.live-btn');
  liveBtn.addEventListener('click', () => {
    if (recording) cancelRecording();
    else onLive?.();
  });

  const media = []; // rascunhos de anexos
  let busy = false;
  let recording = false;
  let micPending = false;
  let live = false;
  let recorder = null;

  function updateActionButtons() {
    const hasPendingContent = media.length > 0 || textarea.value.trim().length > 0;
    const showSend = busy || hasPendingContent;
    sendBtn.hidden = !showSend;
    sendBtn.disabled = !busy && (recording || micPending);
    micBtn.hidden = busy && !recording;
    micBtn.disabled = live || micPending;
    liveBtn.disabled = busy || micPending;
    const label = recording ? 'composer.cancelRecording' : live ? 'voice.liveEnd' : 'voice.liveStart';
    liveBtn.classList.toggle('cancel-recording', recording);
    liveBtn.innerHTML = icon(recording ? 'stop' : 'waveform', 19);
    liveBtn.dataset.i18nTitle = label;
    liveBtn.dataset.i18nAria = label;
    liveBtn.title = t(label);
    liveBtn.setAttribute('aria-label', t(label));
    if (recording) liveBtn.removeAttribute('aria-pressed');
    else liveBtn.setAttribute('aria-pressed', String(live));
  }

  // ---- textarea auto-crescimento ----
  const autosize = () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(180, textarea.scrollHeight) + 'px';
  };
  textarea.addEventListener('input', () => {
    autosize();
    updateActionButtons();
  });
  updateActionButtons();

  // ---- seleção de arquivos ----
  root.querySelector('[data-attach]').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const files = [...fileInput.files];
    fileInput.value = '';
    for (const file of files) await addFile(file);
  });

  async function addFile(file) {
    const att = await makeDraftAttachment(file);
    if (!att) {
      appToast(t('composer.unsupported', { name: file.name }), 'warn');
      return;
    }
    if (att.kind === 'document') {
      try {
        await prepareAttachment(att);
      } catch {
        appToast(t('composer.documentInvalid', { name: att.name }), 'error');
        return;
      }
      if (!att.documentText) {
        appToast(t('composer.documentEmpty', { name: att.name }), 'warn');
        return;
      }
    }
    if (att.kind === 'audio' && !att.dataUrl) {
      att.dataUrl = await prepareAttachment(att).then(() => att.dataUrl).catch(() => null);
    }
    if (att.kind === 'video') {
      att.previewUrl = URL.createObjectURL(file);
      att.thumbUrl = await captureVideoThumb(file);
    }
    media.push(att);
    renderChips();
    updateActionButtons();
  }

  // ---- colar imagens ----
  root.addEventListener('paste', (e) => {
    const items = [...(e.clipboardData?.items || [])];
    const imgs = items.filter((i) => i.type.startsWith('image/'));
    if (!imgs.length) return;
    e.preventDefault();
    for (const it of imgs) {
      const f = it.getAsFile();
      if (f) addFile(f);
    }
  });

  // ---- arrastar e soltar ----
  let dragDepth = 0;
  root.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth++;
    root.style.borderColor = 'var(--accent)';
  });
  root.addEventListener('dragover', (e) => e.preventDefault());
  root.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) root.style.borderColor = '';
  });
  root.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    root.style.borderColor = '';
    for (const f of [...(e.dataTransfer?.files || [])]) addFile(f);
  });

  // ---- chips de anexos ----
  function renderChips() {
    attRow.innerHTML = '';
    for (let i = 0; i < media.length; i++) {
      const att = media[i];
      const chip = el('<div class="att-chip"></div>');

      let thumb = '';
      if (att.kind === 'image' && att.thumbUrl) {
        thumb = `<img class="att-thumb" src="${att.thumbUrl}" alt="">`;
      } else if (att.kind === 'video' && att.thumbUrl) {
        thumb = `<img class="att-thumb" src="${att.thumbUrl}" alt="">`;
      } else {
        const ic = att.kind === 'audio' ? 'music' : att.kind === 'video' ? 'film' : att.kind === 'document' ? 'paperclip' : 'image';
        thumb = `<span class="att-ico">${icon(ic, 16)}</span>`;
      }

      let extra = '';
      if (att.kind === 'audio' && !att.transcript) {
        extra = `<button class="att-act" data-action="transcribe" data-i18n="composer.transcribeAction" data-i18n-title="composer.transcribe" title="Transcribe this audio (ASR)">🔤 ${t('composer.transcribeAction')}</button>`;
      }

      chip.innerHTML = `
        ${thumb}
        <div class="att-meta">
          <div class="att-name">${escapeHtml(att.name)}</div>
          <div class="att-size"><span data-i18n="media.${att.kind}">${t(`media.${att.kind}`)}</span> · ${formatBytes(att.size)}${att.duration ? ` · ${att.duration.toFixed(1)}s` : ''}</div>
        </div>
        ${extra}
        <button class="att-x" data-action="remove" data-i18n-title="composer.remove" title="Remove">${icon('close', 13)}</button>
      `;
      chip.querySelector('[data-action=remove]').addEventListener('click', () => {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
        media.splice(i, 1);
        renderChips();
        updateActionButtons();
      });
      const trBtn = chip.querySelector('[data-action=transcribe]');
      if (trBtn) {
        trBtn.addEventListener('click', async () => {
          trBtn.disabled = true;
          trBtn.dataset.i18n = 'composer.transcribing';
          trBtn.textContent = t('composer.transcribing');
          try {
            const text = await handlers.onTranscribe?.(att);
            if (text) {
              att.transcript = text;
              textarea.value = (textarea.value ? textarea.value + '\n' : '') + text;
              autosize();
              appToast(t('composer.transcriptInserted'), 'ok', 3000);
            } else {
              appToast(t('composer.noTranscript'), 'warn');
            }
          } catch (e) {
            appToast(e.message || t('composer.transcriptionFailed'), 'error');
          } finally {
            trBtn.disabled = false;
            const i2 = media.indexOf(att);
            if (i2 >= 0) renderChips();
          }
        });
      }
      attRow.appendChild(chip);
    }
  }

  // ---- microfone (grava anexo) ----
  async function toggleMic() {
    if (live || busy || micPending) return;
    micPending = true;
    updateActionButtons();
    try {
      await recordOnce();
    } finally {
      micPending = false;
      updateActionButtons();
    }
  }

  async function recordOnce() {
    if (recording) {
      recording = false;
      micBtn.classList.remove('rec');
      onRecordingChange?.(false);
      try {
        const rec = await recorder.stop();
        const att = {
          kind: 'audio',
          name: rec.name,
          size: Math.round((rec.dataUrl.length * 3) / 4),
          mime: 'audio/wav',
          dataUrl: rec.dataUrl,
          base64: rec.dataUrl.split(',')[1],
          previewUrl: null,
          thumbUrl: null,
          duration: rec.duration,
          transcript: null,
        };
        const draft = { text: textarea.value.trim(), media: [...media, att] };
        media.length = 0;
        textarea.value = '';
        autosize();
        renderChips();
        updateActionButtons();
        onSubmit?.(draft);
      } catch (e) {
        appToast(t('composer.recordFailed'), 'error');
      }
      return;
    }

    try {
      recorder = new Recorder();
      await recorder.start();
      recording = true;
      micBtn.classList.add('rec');
      onRecordingChange?.(true);
      appToast(t('composer.recording'), 'info', 2600);
    } catch (e) {
      // Diagnóstico: preserva o erro real no console para distinguir
      // permissão, dispositivo indisponível e falhas de captura.
      console.warn('[omni-mic] falha ao iniciar gravação:', e?.name, e?.message || e);
      appToast(t('composer.micUnavailable'), 'error');
    }
  }
  function cancelRecording() {
    if (!recording) return;
    recording = false;
    recorder?.cancel();
    recorder = null;
    micBtn.classList.remove('rec');
    onRecordingChange?.(false);
    updateActionButtons();
  }

  micBtn.addEventListener('click', toggleMic);

  // ---- envio / parada ----
  function setBusy(b) {
    busy = b;
    updateActionButtons();
    sendBtn.classList.toggle('stop', b);
    sendBtn.innerHTML = icon(b ? 'stop' : 'send', 19);
    sendBtn.dataset.i18nTitle = b ? 'composer.interrupted' : 'composer.send';
    sendBtn.title = t(sendBtn.dataset.i18nTitle);
    textarea.disabled = b;
  }

  sendBtn.addEventListener('click', () => {
    if (busy) { onStop?.(); return; }
    submit();
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!busy && !recording && !micPending) submit();
    }
  });

  function submit() {
    const text = textarea.value.trim();
    const draft = media.splice(0, media.length);
    renderChips();
    if (!text && !draft.length) return;
    textarea.value = '';
    autosize();
    updateActionButtons();
    onSubmit?.({ text, media: draft });
  }

  return {
    root,
    setMetrics(speed, used, limit) {
      if (speed != null) metricSpeed = speed;
      if (used != null) metricUsed = used;
      if (limit != null) metricLimit = limit;
      paintMetrics();
    },
    clearMetrics() {
      metricSpeed = metricUsed = metricLimit = null;
      paintMetrics();
    },
    setBusy,
    setLive: (active) => { live = active; updateActionButtons(); },
    get recording() { return recording || micPending; },
    restoreDraft: (draft) => {
      textarea.value = [draft.text, textarea.value].filter(Boolean).join('\n');
      media.unshift(...draft.media);
      renderChips();
      autosize();
      updateActionButtons();
    },
    focus: () => textarea.focus({ preventScroll: true }),
    get hasDraft() { return media.length > 0 || textarea.value.trim().length > 0; },
    clear: () => {
      media.forEach((m) => m.previewUrl && URL.revokeObjectURL(m.previewUrl));
      media.length = 0;
      textarea.value = '';
      renderChips();
      autosize();
      updateActionButtons();
    },
    cancelRecording,
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
