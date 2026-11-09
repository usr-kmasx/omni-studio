// ============================================================
// Componente de conversa: balões, anexos, players, markdown.
// ============================================================

import { renderMarkdown } from '../utils/md.js';
import { icon } from '../utils/icons.js';
import { appToast } from '../utils/toast.js';
import { formatBytes } from './media.js';
import { t } from '../i18n.js';

// ---- utilitários de DOM ----

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---- lightbox ----
let lightboxEl = null;
export function showLightbox(src) {
  if (!lightboxEl) lightboxEl = document.getElementById('lightbox');
  lightboxEl.innerHTML = `<img src="${src}" alt="">`;
  lightboxEl.classList.remove('hidden');
}
export function hideLightbox() {
  if (!lightboxEl) lightboxEl = document.getElementById('lightbox');
  lightboxEl.innerHTML = '';
  lightboxEl.classList.add('hidden');
}

// ---- player de áudio (controles próprios) ----
export function mountAudioPlayer(host, { src, title = '', autoplay = false }) {
  const audio = new Audio(src);
  audio.preload = 'metadata';
  let playing = false;

  host.innerHTML = `
    <div class="audio-player">
      <button class="pp-btn" type="button" data-i18n-title="chat.playPause" title="Play/pause">${icon('play', 16)}</button>
      <div class="pp-info">
        <div class="pp-title">${title}</div>
        <div class="pp-time">0:00 / 0:00</div>
      </div>
      <div class="vol" title="${t('chat.volume')}" data-i18n-title="chat.volume">
        ${icon('volume', 15)}
        <input type="range" min="0" max="1" step="0.05" value="1">
      </div>
      <a class="dl-btn" href="${src}" download title="${t('chat.downloadAudio')}">${icon('download', 15)}</a>
    </div>`;

  const btn = host.querySelector('.pp-btn');
  const timeEl = host.querySelector('.pp-time');
  const vol = host.querySelector('input[type=range]');

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };
  const paint = () => {
    timeEl.textContent = `${fmt(audio.currentTime || 0)} / ${fmt(audio.duration || 0)}`;
    if (audio.duration && !Number.isNaN(audio.duration) && audio.duration > 0) {
      timeEl.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
    }
  };

  const setPlaying = (p) => {
    playing = p;
    btn.innerHTML = icon(p ? 'pause' : 'play', 16);
    btn.dataset.i18nTitle = p ? 'chat.pause' : 'chat.play';
    btn.title = t(btn.dataset.i18nTitle);
  };

  btn.addEventListener('click', () => {
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play().catch(() => {}); setPlaying(true); }
  });
  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('ended', () => setPlaying(false));
  audio.addEventListener('timeupdate', paint);
  audio.addEventListener('loadedmetadata', paint);
  vol.addEventListener('input', () => { audio.volume = Number(vol.value); });

  if (autoplay) audio.play().catch(() => {});

  return {
    audio,
    play: () => audio.play().catch(() => {}),
    pause: () => audio.pause(),
    destroy: () => { audio.pause(); audio.src = ''; },
  };
}

// ---- player compacto (mini) para áudios dentro das mensagens ----
// Controle único, circular/compacto: play/pause + rótulo. Não expõe
// volume, barra de busca nem download. Reutiliza uma única instância
// de Audio por mensagem.

export function mountMiniAudioPlayer(host, { src, title = '' }) {
  const audio = new Audio(src);
  audio.preload = 'metadata';
  let playing = false;

  host.innerHTML = `
    <button class="mini-audio" type="button" title="Reproduzir/pausar">
      <span class="ma-icon">${icon('play', 15)}</span>
      <span class="ma-label"></span>
    </button>`;

  const btn = host.querySelector('.mini-audio');
  const iconEl = btn.querySelector('.ma-icon');
  const labelEl = btn.querySelector('.ma-label');
  labelEl.textContent = title;

  const setPlaying = (p) => {
    playing = p;
    btn.classList.toggle('playing', p);
    iconEl.innerHTML = icon(p ? 'pause' : 'play', 15);
    btn.dataset.i18nTitle = p ? 'chat.pause' : 'chat.play';
    btn.title = t(btn.dataset.i18nTitle);
  };

  btn.addEventListener('click', () => {
    if (playing) audio.pause();
    else audio.play().catch(() => {});
  });
  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('ended', () => setPlaying(false));
  audio.addEventListener('loadedmetadata', () => {
    if (audio.duration && !Number.isNaN(audio.duration)) {
      const m = Math.floor(audio.duration / 60);
      const s = Math.floor(audio.duration % 60);
      labelEl.textContent = `${title} · ${m}:${String(s).padStart(2, '0')}`;
    }
  });

  return {
    audio,
    play: () => audio.play().catch(() => {}),
    pause: () => audio.pause(),
    destroy: () => { audio.pause(); audio.src = ''; },
  };
}

function audioAttachmentChip(att) {
  // Representação única e compacta: [▶] nome · duração
  const host = el(`<div class="media-chip audio-compact"></div>`);
  const src = att.dataUrl || att.previewUrl;
  if (src) {
    mountMiniAudioPlayer(host, { src, title: att.name });
  } else {
    host.innerHTML = `
      <button class="mini-audio" type="button" disabled title="${t('media.audio')}">
        <span class="ma-icon">${icon('music', 15)}</span>
        <span class="ma-label"></span>
      </button>`;
    host.querySelector('.ma-label').textContent = att.name;
  }
  return { node: host };
}

function renderMedia(media) {
  const wrap = el('<div class="media-grid"></div>');
  for (const att of media || []) {
    if (att.expired) {
      const expired = el('<div class="media-chip media-item history-expired"></div>');
      expired.textContent = t('history.mediaExpired', { name: att.name || t('media.audio') });
      if (att.transcript) {
        const transcript = document.createElement('div');
        transcript.textContent = att.transcript;
        expired.appendChild(transcript);
      }
      wrap.appendChild(expired);
    } else if (att.kind === 'image') {
      const item = el(`<div class="media-item"></div>`);
      const img = el(`<img src="${att.dataUrl || att.thumbUrl}" alt="imagem anexada" loading="lazy">`);
      img.addEventListener('click', () => showLightbox(att.dataUrl || att.thumbUrl));
      item.appendChild(img);
      wrap.appendChild(item);
    } else if (att.kind === 'video') {
      const item = el('<div class="media-item video"></div>');
      const v = el('<video controls preload="metadata"></video>');
      v.src = att.previewUrl || att.dataUrl;
      item.appendChild(v);
      const cap = el(`<div class="media-cap" data-i18n="chat.videoFrames">${t('chat.videoFrames')}</div>`);
      item.appendChild(cap);
      wrap.appendChild(item);
    } else if (att.kind === 'document') {
      const card = el(`<div class="media-chip media-item"><span class="file-ico">${icon('paperclip')}</span><div class="file-meta"><div class="file-name"></div><div class="file-size"></div></div></div>`);
      const name = card.querySelector('.file-name');
      name.textContent = att.name;
      name.title = att.name;
      card.querySelector('.file-size').textContent = formatBytes(att.size);
      wrap.appendChild(card);
    } else if (att.kind === 'audio') {
      const { node } = audioAttachmentChip(att);
      wrap.appendChild(node);
      if (att.transcript) {
        const tr = el(
          `<div class="transcript"><span class="tr-label" data-i18n="chat.transcript">${t('chat.transcript')}</span><span></span></div>`
        );
        tr.querySelector('span:last-child').textContent = att.transcript;
        wrap.appendChild(tr);
      }
    }
  }
  return wrap;
}

// ---- balões ----

export function createUserBubble(msg) {
  const row = el(`<div class="msg user"></div>`);
  const avatar = el(`<div class="avatar">${icon('user', 16)}</div>`);
  const body = el('<div class="body"></div>');

  if (msg.text && msg.text.trim()) {
    body.appendChild(el(`<div class="bubble"><div class="plain"></div></div>`));
    body.querySelector('.plain').textContent = msg.text;
  }
  if (msg.media && msg.media.length) {
    body.appendChild(renderMedia(msg.media));
  }
  row.append(avatar, body);
  return row;
}

export function createAssistantBubble(msg, { onSpeak, onSpeechReady }) {
  const row = el(`<div class="msg assistant"></div>`);
  const avatar = el(`<div class="avatar">${icon('bot', 16)}</div>`);
  const body = el('<div class="body"></div>');

  const bubble = el('<div class="bubble hidden"></div>');
  const contentHost = el('<div class="md"></div>');
  bubble.appendChild(contentHost);

  const thinking = el(
    `<div class="thinking" role="status">${icon('spark', 15)}<span data-i18n="chat.processingPrompt">${t('chat.processingPrompt')}</span><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span></div>`
  );
  const reasoning = el(`
    <details class="reasoning-preview hidden" open>
      <summary data-i18n="chat.reasoningPreview">${t('chat.reasoningPreview')}</summary>
      <div class="reasoning-text" tabindex="0" data-i18n-aria="chat.reasoningPreview" aria-label="${t('chat.reasoningPreview')}"></div>
    </details>`);
  const reasoningText = reasoning.querySelector('.reasoning-text');
  body.append(thinking, reasoning, bubble);

  const footer = el('<div class="msg-footer"></div>');
  body.appendChild(footer);

  const actions = el('<div class="msg-actions"></div>');
  footer.appendChild(actions);

  const usageEl = el('<div class="usage"></div>');
  footer.appendChild(usageEl);

  const errorEl = el('<div class="msg-error hidden"></div>');
  body.appendChild(errorEl);

  // Status de síntese de áudio (indicador + cancelamento próprio da mensagem)
  const speechStatus = el('<div class="speech-status hidden"></div>');
  body.appendChild(speechStatus);
  let speechAbort = new AbortController(); // novo a cada tentativa

  const setSpeechStatus = (mode, { progress = null } = {}) => {
    if (mode !== 'generating') {
      speechStatus.classList.add('hidden');
      speechStatus.innerHTML = '';
      return;
    }
    speechStatus.classList.remove('hidden');
    if (progress) {
      const pct = Math.max(2, Math.round((progress.index / progress.total) * 100));
      speechStatus.innerHTML = `
        <div class="speech-progress">
          <span class="speech-label" data-i18n="chat.generatingAudio" data-i18n-var-index="${progress.index}" data-i18n-var-total="${progress.total}">${t('chat.generatingAudio', progress)}</span>
          <span class="speech-bar"><i style="width:${pct}%"></i></span>
          <button class="speech-stop" type="button" data-i18n="chat.stopAudio" data-i18n-title="chat.stopSynthesis" title="Stop audio synthesis">${t('chat.stopAudio')}</button>
        </div>`;
    } else {
      speechStatus.innerHTML = `
        <div class="speech-progress indeterminate">
          <span class="speech-label" data-i18n="chat.generatingAudioEllipsis">${t('chat.generatingAudioEllipsis')}</span>
          <span class="speech-spinner"></span>
          <button class="speech-stop" type="button" data-i18n="chat.stopAudio" data-i18n-title="chat.stopSynthesis" title="Stop audio synthesis">${t('chat.stopAudio')}</button>
        </div>`;
    }
    speechStatus.querySelector('.speech-stop').addEventListener('click', cancelSpeech);
  };

  const cancelSpeech = () => {
    if (speech.status !== 'generating') return;
    speech.cancelled = true;
    speechAbort.abort();
    setSpeechStatus('hidden');
  };

  let text = '';
  let rafPending = false;
  let lastRendered = '';

  const paint = () => {
    rafPending = false;
    bubble.classList.toggle('hidden', !text.trim());
    const rendered = renderMarkdown(text);
    if (rendered !== lastRendered) {
      lastRendered = rendered;
      contentHost.innerHTML = rendered;
    }
  };

  let speakBtn = null;
  let player = null;

  // ---- fala (TTS) idempotente ----
  // estados: idle → generating → ready; ready reproduz o mesmo áudio, nunca regenera.
  const speech = { status: 'idle', url: null, cancelled: false, runId: 0 };

  const updateSpeakBtn = () => {
    if (!speakBtn) return;
    const map = {
      idle: [t('chat.listen'), false],
      generating: [t('chat.generatingVoice'), true],
      ready: [t('chat.listenAgain'), false],
    };
    const [label, disabled] = map[speech.status] || map.idle;
    speakBtn.dataset.i18nTitle = 'chat.listenResponse';
    speakBtn.querySelector('span').dataset.i18n = speech.status === 'generating' ? 'chat.generatingVoice' : speech.status === 'ready' ? 'chat.listenAgain' : 'chat.listen';
    speakBtn.querySelector('span').textContent = label;
    speakBtn.disabled = disabled;
  };

  const generateSpeech = async () => {
    if (!onSpeak || !text) return;
    if (speech.status === 'generating') return;       // ignora reentrada
    if (speech.status === 'ready') {                  // já gerado: apenas reproduz
      player?.play();
      return;
    }
    // Cada tentativa recebe um ciclo de vida independente: novo AbortController,
    // estado de cancelamento limpo e id de execução (evita que uma tentativa
    // antiga — já cancelada — atualize o estado de uma mais recente).
    speechAbort = new AbortController();
    speech.status = 'generating';
    speech.cancelled = false;
    speech.progress = null;
    const runId = ++speech.runId;
    updateSpeakBtn();
    setSpeechStatus('generating', { progress: null });
    try {
      const { url, buffer } = await onSpeak(text, speechAbort.signal, (p) => {
        if (runId !== speech.runId) return;
        setSpeechStatus('generating', { progress: p });
      });
      if (runId !== speech.runId) return; // tentativa antiga: ignora
      if (speech.cancelled) return; // cancelado durante a última espera
      speech.status = 'ready';
      // Substituição: se houver player/URL anterior, libera antes de associar o novo.
      if (player) {
        try { player.destroy(); } catch { /* ignora */ }
        player = null;
      }
      if (speech.url && speech.url !== url) {
        try { URL.revokeObjectURL(speech.url); } catch { /* ignora */ }
      }
      speech.url = url;
      onSpeechReady?.(buffer);
      setSpeechStatus('hidden');
      // Remove o botão "ouvir" (ação de gerar) e deixa apenas o mini player.
      if (speakBtn) {
        speakBtn.remove();
        speakBtn = null;
      }
      const audioHost = el('<div></div>');
      body.insertBefore(audioHost, footer);
      player = mountMiniAudioPlayer(audioHost, { src: url, title: '' });
      player.audio.play().catch(() => {});
    } catch (e) {
      if (runId !== speech.runId) return; // tentativa antiga: ignora
      const isAbort = e?.kind === 'abort' || e?.name === 'AbortError';
      if (isAbort) {
        speech.status = 'idle';
        setSpeechStatus('hidden');
        appToast(t('chat.audioInterrupted'), 'warn', 2500);
      } else {
        speech.status = 'idle';
        setSpeechStatus('hidden');
        appToast(e.message || t('chat.voiceFailed'), 'error');
      }
    } finally {
      if (runId === speech.runId) updateSpeakBtn();
    }
  };

  // Cria o botão "ouvir" da mensagem (idempotente). Disponibilizado tanto
  // para respostas concluídas quanto para respostas parciais (interrompidas).
  const ensureSpeakButton = () => {
    if (!onSpeak || !text.trim() || speakBtn) return;
    speakBtn = el(
      `<button class="mini-btn" type="button" data-i18n-title="chat.listenResponse" title="${t('chat.listenResponse')}">${icon('play', 13)}<span data-i18n="chat.listen">${t('chat.listen')}</span></button>`
    );
    speakBtn.addEventListener('click', generateSpeech);
    actions.appendChild(speakBtn);
    updateSpeakBtn();
  };

  const controller = {
    setThinking(on) {
      thinking.classList.toggle('hidden', !on || !reasoning.classList.contains('hidden'));
    },

    setReasoning(value) {
      if (!value.trim()) return;
      const atEnd = reasoningText.scrollHeight - reasoningText.scrollTop - reasoningText.clientHeight < 12;
      reasoningText.textContent = value;
      reasoning.classList.remove('hidden');
      this.setThinking(false);
      if (atEnd) reasoningText.scrollTop = reasoningText.scrollHeight;
    },

    setMd(t) {
      text = t;
      if (text.trim()) this.setThinking(false);
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(paint);
      }
    },

    getText: () => text,

    finish({ usage, ctxSize } = {}) {
      this.setThinking(false);
      if (text) {
        paint();
        if (speakBtn) speakBtn.remove();
        speakBtn = null;
        ensureSpeakButton();
      }
      if (usage && ctxSize) {
        const total = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
        const pct = Math.min(100, Math.round((total / ctxSize) * 100));
        usageEl.textContent = `⚡ ${total.toLocaleString()} ${t('chat.tokensContext', { percent: pct })}`;
      }
    },

    setInterrupted(note) {
      this.setThinking(false);
      if (text && !lastRendered) paint();
      this.appendNote(note || '(interrompido)');
      // Texto parcial continua elegível para síntese de voz.
      ensureSpeakButton();
    },

    /** Adiciona uma nota discreta no rodapé da mensagem. */
    appendNote(note) {
      const n = el(`<span style="color:var(--text-faint);font-size:12px">${note}</span>`);
      footer.appendChild(n);
    },

    setError(message) {
      this.setThinking(false);
      errorEl.innerHTML = `${icon('alert', 15)}<span></span>`;
      errorEl.querySelector('span').textContent = message;
      errorEl.classList.remove('hidden');
    },

    appendAudioPlayer(url, title) {
      const audioHost = el('<div></div>');
      body.insertBefore(audioHost, footer);
      player = mountAudioPlayer(audioHost, { src: url, title: title || 'Resposta falada' });
      return player;
    },

    restoreSpeech(url) {
      if (speakBtn) { speakBtn.remove(); speakBtn = null; }
      speech.url = url;
      speech.status = 'ready';
      const host = el('<div></div>');
      body.insertBefore(host, footer);
      player = mountMiniAudioPlayer(host, { src: url, title: '' });
    },

    showExpiredSpeech() {
      this.disposeAudio();
      this.appendNote(t('history.speechExpired'));
      ensureSpeakButton();
    },

    speak: generateSpeech,

    /**
     * Descarta o áudio da mensagem (idempotente): pausa/destrói o player,
     * revoga a Blob URL e restaura o estado de áudio. Usado quando a
     * mensagem ou a conversa é descartada.
     */
    disposeAudio() {
      if (speech.status === 'generating') {
        speech.cancelled = true;
        speechAbort.abort();
      }
      if (player) {
        try { player.destroy(); } catch { /* ignora */ }
        player = null;
      }
      if (speech.url) {
        try { URL.revokeObjectURL(speech.url); } catch { /* ignora */ }
        speech.url = null;
      }
      speech.status = 'idle';
      setSpeechStatus('hidden');
    },

    addDivider(text) {
      const d = el(`<div class="divider"><span></span></div>`);
      d.querySelector('span').textContent = text;
      body.appendChild(d);
    },
  };

  row.append(avatar, body);
  return { row, controller };
}

// ---- delegação global na área de chat (copiar código, lightbox) ----


export function attachChatDelegation(listEl) {
  listEl.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.md-copy');
    if (copyBtn) {
      const codeEl = copyBtn.closest('.md-code')?.querySelector('code');
      if (codeEl) {
        navigator.clipboard?.writeText(codeEl.innerText).then(() => {
          const prev = copyBtn.textContent;
          copyBtn.dataset.i18n = 'chat.copied';
          copyBtn.dataset.i18n = 'chat.copied';
          copyBtn.textContent = t('chat.copied');
          setTimeout(() => { copyBtn.textContent = prev; delete copyBtn.dataset.i18n; }, 1400);
        }).catch(() => {});
      }
      return;
    }
    const img = e.target.closest('.media-item img');
    if (img) showLightbox(img.src);
  });
}
