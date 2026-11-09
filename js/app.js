// ============================================================
// Omni Studio — aplicação principal
// Interface web para LFM3-Omni-2B via llama.cpp (local)
// ============================================================

import { loadSettings, saveSettings, asrLanguageName } from './config.js';
import { icon } from './utils/icons.js';
import { appToast } from './utils/toast.js';
import { checkHealth, fetchModelInfo, fetchProps, summarizeError, apiGet } from './api/client.js';
import { streamChatCompletion, conversationToMessages, mediaToPart } from './api/chat.js';
import { ttsSpeak } from './api/tts.js';
import { liveContext, submissionRoute } from './api/live-context.js';
import { RealtimeSession } from './api/realtime.js';
import { prepareAttachment } from './components/media.js';
import { PcmPlayer, resampleLinear, wavDataUrl } from './components/audio.js';
import { createComposer } from './components/composer.js';
import { createVad, pcmFromB64 } from './components/voice.js';
import { detectRunaway } from './utils/repeat.js';
import {
  assessStreamState,
} from './utils/guards.js';
import { newRequestId } from './utils/id.js';
import { detectTextLanguage } from './utils/lang-detect.js';
import {
  createUserBubble,
  createAssistantBubble,
  attachChatDelegation,
  showLightbox,
  hideLightbox,
  el,
} from './components/chat.js';
import { restoreHfDownload } from './components/hf-catalog.js';
import { backendRpc } from './components/backend-manager.js';
import { historyAvailable, listHistory, loadHistory, newHistoryId, openHistory, saveHistory, setActiveHistory } from './components/history.js';
import { openSettings } from './components/settings.js';
import { setLocale, t } from './i18n.js';
import { applyTheme } from './theme.js';
import { installKeyboardFocus } from './utils/keyboard-focus.js';

// ---------- estado ----------
const settings = loadSettings();
setLocale(settings.uiLanguage);
applyTheme(settings.theme);

const state = {
  busy: false,
  abort: null,
  activeReqId: null,   // id da geração ativa (diagnóstico de cancelamento)
  caps: null,          // {image,audio,video,audioOut} — null = desconhecido
  ctxSize: null,
  textConv: [],
  pendingLiveCommits: [],
  liveItems: new Map(),
  liveReply: null,
  rt: null,            // RealtimeSession
  voiceVad: null,      // Silero VAD v6 (captura e detecção contínua)
  voiceVadInit: null,
  voiceVadActive: false,
  voiceVadPreRoll: [],
  voiceVadBatch: [],
  voicePlayer: null,   // PcmPlayer (reprodução ao vivo, sem elementos visuais)
  listening: false,    // escuta contínua ativa
  generating: false,
  voiceEnded: false,
  voiceClear: false,   // descartar eventos após cancelamento
  voiceBargeIn: false, // resposta atual cancelada para priorizar nova fala
  voiceBargeInReady: false, // nova fala aguardando o fim do cancelamento
  voiceGuardNote: false, // nota de proteção já exibida no balão atual
  voiceTextAcc: '',    // texto acumulado da resposta de voz em andamento
  voiceAssistant: null,// controller da resposta atual
  textControllers: new Set(), // controllers de mensagens (para liberação de áudio)
};

function baseUrl() {
  // URL ativa resolvida pelo gerenciador de backends (Rust); fallback para
  // a URL configurada no site.
  const bk = window.__omniBackend;
  if (bk && bk.activeUrl) return bk.activeUrl;
  return settings.serverUrl;
}

// Instrução de vídeo (corrigida): usa a instrução oficial da Liquid AI e
// evita o loop de transcrição de fala ininteligível (comprovado via HTTP).
const VIDEO_SYSTEM_PROMPT =
  'Answer questions about the video using what you see and hear. ' +
  'Do not transcribe or repeat unintelligible speech; describe the visuals and summarize the audio in general terms.';

const VIDEO_FALLBACK_TEXT =
  'Describe this video in detail: the visual elements, their positions and movement, the background, and the audio.';

// Regra de consistência linguística (chat textual): acompanha a última
// mensagem do usuário, salvo solicitação explícita de outro idioma.
const LINGUISTIC_SYSTEM =
  "Respond in the same language as the user's latest message unless the user explicitly requests another language. " +
  'When an output language is explicitly requested, use that language consistently.';

// Instrução de sessão do modo Voz (Live): mesmo princípio para texto e fala.
const LIVE_LINGUISTIC_INSTRUCTIONS =
  'Respond in the same language used by the user in each turn. ' +
  'Keep spoken and textual responses in the same language. ' +
  'If the user explicitly requests another language, use that language.';

// Evita autoapresentação espontânea (identidade só quando perguntada).
const NO_SPONTANEOUS_IDENTITY =
  'Answer directly what the user asked. Do not introduce yourself spontaneously and do not add your ' +
  'model name, version, manufacturer, creator, or any identity description unless explicitly asked. ' +
  'When asked about your identity, name, or origin, respond concisely with reliable information; ' +
  'do not invent names, versions, or specifications.';

function buildSystemPrompt(hasVideo) {
  const parts = [LINGUISTIC_SYSTEM, NO_SPONTANEOUS_IDENTITY];
  if (hasVideo) parts.push(VIDEO_SYSTEM_PROMPT);
  return parts.filter(Boolean).join(' ');
}

function buildLiveInstructions() {
  return LIVE_LINGUISTIC_INSTRUCTIONS;
}

// ---------- DOM ----------
const chatArea = document.getElementById('chatArea');
const statusChip = document.getElementById('statusChip');
const statusDot = document.getElementById('statusDot');
const statusLabel = document.getElementById('statusLabel');
const modelLabel = document.getElementById('modelLabel');
const composerHost = document.getElementById('composerHost');

// Um contêiner para os turnos do Chat e do Live.
const textList = el('<div class="chat-inner"></div>');
attachChatDelegation(textList);

// ---------- hero / vazio ----------
function hero(iconName, titleKey, bodyKey) {
  return el(`
    <div class="hero">
      <div class="hero-icon">${icon(iconName, 44)}</div>
      <h2 data-i18n="${titleKey}">${t(titleKey)}</h2>
      <p data-i18n="${bodyKey}">${t(bodyKey)}</p>
      <div class="chips">
        <span class="chip">${icon('image', 14)} ${t('media.image')}</span>
        <span class="chip">${icon('music', 14)} ${t('media.audio')}</span>
        <span class="chip">${icon('video', 14)} ${t('media.video')}</span>
        <span class="chip">${icon('mic', 14)} ${t('media.voice')}</span>
        <span class="chip">${icon('waveform', 14)} ${t('media.speech')}</span>
      </div>
    </div>`);
}

function mountView() {
  chatArea.innerHTML = '';
  chatArea.appendChild(textList);
  chatArea.scrollTop = chatArea.scrollHeight;
}

// ---------- status / conexão ----------
let healthTimer = null;
let statusRefreshRunning = false;
let healthUrl = null;
let healthFailures = 0;
let confirmedOnline = false;

let serverTransition = null;

function nativeServerState() {
  if (!window.webkit?.messageHandlers?.['omni-backend']) return null;
  const backend = window.__omniBackend;
  if (!backend) return { unknown: true };
  const process = serverTransition || backend.state?.processState;
  const external = backend.kind === 'external'
    ? !(healthUrl === baseUrl() && healthFailures >= 2)
    : !backend.integratedRunning && healthUrl === settings.serverUrl && confirmedOnline;
  return { process, external, running: backend.integratedRunning };
}

function renderServerControl() {
  const server = nativeServerState();
  const transitioning = server?.process === 'starting' || server?.process === 'stopping';
  statusChip.setAttribute('aria-disabled', String(!server || server.unknown || server.external || transitioning));
  if (!server || server.unknown) {
    statusChip.dataset.i18nAria = 'status.readOnly';
    statusChip.setAttribute('aria-label', t('status.readOnly'));
    return;
  }
  const online = server.external || server.running;
  const label = transitioning ? 'backend.' + server.process : online ? 'status.online' : 'status.offline';
  const hint = transitioning ? label : server.external ? 'status.externalReadOnly'
    : server.running ? 'backend.stop' : 'backend.start';
  statusDot.className = transitioning ? 'dot busy' : online ? 'dot ok' : 'dot err';
  statusLabel.dataset.i18n = label;
  statusLabel.textContent = t(label);
  statusChip.dataset.i18nTitle = statusChip.dataset.i18nAria = hint;
  statusChip.title = t(hint);
  statusChip.setAttribute('aria-label', t(hint));
}

async function toggleIntegratedServer() {
  const server = nativeServerState();
  if (!server || server.unknown || server.external || serverTransition ||
      ['starting', 'stopping'].includes(server.process)) return;
  const stop = server.running;
  if (stop && (state.busy || state.generating || state.voicePlayer?.playing)) {
    if (!confirm(t('backend.stopConfirm'))) return;
    state.abort?.abort();
  }
  if (stop && state.rt) endVoiceSession();
  serverTransition = stop ? 'stopping' : 'starting';
  renderServerControl();
  try {
    const result = await backendRpc(stop ? 'stop-integrated' : 'start-integrated', {
      activate: !stop,
      externalUrl: settings.serverUrl,
    }, 180000);
    if (result.state) window.__omniBackend = result.state;
    if (!result.ok) {
      const errors = {
        not_installed: 'status.installIntegrated',
        no_model_selected: 'status.chooseIntegratedModel',
        external_backend_active: 'status.externalReadOnly',
      };
      appToast(t(errors[result.error?.code] || (stop ? 'backend.stopFailed' : 'backend.startFailed')), 'error');
    }
  } finally {
    serverTransition = null;
    renderServerControl();
    void refreshStatus();
  }
}

async function refreshStatus() {
  if (statusRefreshRunning) return;
  const url = baseUrl();
  if (state.rt && state.rt.baseUrl !== url) endVoiceSession();
  if (url !== healthUrl) {
    healthUrl = url;
    state.ctxSize = null;
    healthFailures = 0;
    confirmedOnline = false;
  }
  statusRefreshRunning = true;
  try {
    await refreshStatusForUrl(url);
  } finally {
    statusRefreshRunning = false;
    renderServerControl();
    if (url !== baseUrl()) void refreshStatus();
  }
}

async function refreshStatusForUrl(url) {
  const h = await checkHealth(url);
  if (url !== baseUrl()) return;

  if (h.online) {
    healthFailures = 0;
    confirmedOnline = true;
    statusDot.className = 'dot ok';
    statusLabel.textContent = t('status.online');
    statusLabel.dataset.i18n = 'status.online';
    updateStatusBusy();
    const [info, props] = await Promise.all([fetchModelInfo(url), fetchProps(url)]);
    if (url !== baseUrl()) return;
    if (state.rt && info.model?.id && state.rt.modelId && state.rt.modelId !== info.model.id) endVoiceSession();
    if (info.model?.id) state.modelId = info.model.id;
    const id = info.model?.id ? info.model.id.split('/').pop() : t('status.modelLoaded');
    modelLabel.textContent = id;
    delete modelLabel.dataset.i18n;
    document.title = `Omni Studio — ${id}`;
    const ins = info.inputModalities ? info.inputModalities.join(', ') : ['media.text', 'media.image', 'media.audio', 'media.video'].map((key) => t(key)).join(', ');
    const outs = info.outputModalities ? info.outputModalities.join(', ') : ['media.text', 'media.speech'].map((key) => t(key)).join(', ');
    statusChip.title = t('status.modelTooltip', { id, inputs: ins, outputs: outs });
    statusChip.dataset.i18nTitle = 'status.modelTooltip';
    statusChip.dataset.i18nVarId = id;
    statusChip.dataset.i18nVarInputs = ins;
    statusChip.dataset.i18nVarOutputs = outs;
    if (info.caps) state.caps = info.caps;
    const generation = props?.default_generation_settings;
    const contextLimit = generation?.n_ctx ?? generation?.params?.n_ctx;
    if (Number.isFinite(contextLimit) && contextLimit > 0) state.ctxSize = contextLimit;
  } else {
    healthFailures = Math.min(healthFailures + 1, 2);
    if (healthFailures < 2) {
      if (!state.busy && !state.generating && statusDot.classList.contains('busy')) {
        const label = confirmedOnline ? 'status.online' : 'status.connecting';
        statusDot.className = confirmedOnline ? 'dot ok' : 'dot';
        statusLabel.textContent = t(label);
        statusLabel.dataset.i18n = label;
      }
      return;
    }
    confirmedOnline = false;
    statusDot.className = 'dot err';
    statusLabel.textContent = t('status.offline');
    statusLabel.dataset.i18n = 'status.offline';
    modelLabel.textContent = t('status.serverOffline');
    modelLabel.dataset.i18n = 'status.serverOffline';
    document.title = 'Omni Studio';
    statusChip.title = t('status.unavailable');
    statusChip.dataset.i18nTitle = 'status.unavailable';
    delete statusChip.dataset.i18nVarId;
    delete statusChip.dataset.i18nVarInputs;
    delete statusChip.dataset.i18nVarOutputs;
    state.caps = null;
    // Fallback integrado: pede ao gerenciador nativo que resolva o backend
    // ativo (inicia o llama.cpp isolado se habilitado) e reavalia.
    if (window.__omniBackend?.integratedEnabled && !window.__omniBackend.state?.manualStop && !serverTransition && !state.resolvePending) {
      state.resolvePending = true;
      try {
        window.webkit?.messageHandlers?.['omni-backend']?.postMessage(JSON.stringify({
          cmd: 'resolve',
          externalUrl: settings.serverUrl,
        }));
        setTimeout(() => { state.resolvePending = false; refreshStatus(); }, 2500);
      } catch { state.resolvePending = false; }
    }
  }
  updateStatusBusy();
}

function updateStatusBusy() {
  // Exposto para o gerenciador de backends saber se há geração ativa.
  window.__omniChatBusy = !!state.busy || !!state.generating;
  if (nativeServerState()) {
    renderServerControl();
    return;
  }
  if (state.busy || state.generating) {
    statusDot.className = 'dot busy';
    statusLabel.textContent = t('status.processing');
    statusLabel.dataset.i18n = 'status.processing';
  } else if (statusDot.classList.contains('busy')) {
    refreshStatus();
  }
}

// ---------- texto: envio ----------
const composer = createComposer(composerHost, {
  onSubmit: trackedSubmit,
  onLive: toggleLive,
  onStop: () => {
    const reqId = state.activeReqId || '?';
    console.info(`[omni] Parar clicado [${reqId}]`, {
      instante: new Date().toISOString(),
      temController: !!state.abort,
      busy: state.busy,
    });
    state.abort?.abort();
  },
  onRecordingChange: (on) => { if (on) composerRoot.classList.add('rec-active'); else composerRoot.classList.remove('rec-active'); },
  onTranscribe: transcribeAttachment,
});
const composerRoot = composer.root;

async function transcribeAttachment(att, signal) {
  await prepareAttachment(att);
  const lang = asrLanguageName(settings.asrLang);
  // STT em `auto`: instrução genérica, sem forçar idioma fixo.
  const systemPrompt = lang ? `Perform ASR in ${lang}.` : 'Perform ASR.';
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: [mediaToPart(att)] },
  ];
  const { text } = await streamChatCompletion({
    baseUrl: baseUrl(),
    messages,
    extra: { max_tokens: 512 },
    signal,
    onDelta: () => {},
  });
  return text.trim();
}

async function sendText({ text, media: rawMedia }) {
  if (state.busy) return;
  if (!text && !rawMedia.length) return;

  state.busy = true;
  updateStatusBusy();
  composer.setBusy(true);
  hideHero(textList);

  // Controller de cancelamento criado ANTES de qualquer await: o botão
  // Parar funciona durante a preparação de anexos, não só durante o stream.
  const abort = new AbortController();
  state.abort = abort;
  state.activeReqId = newRequestId();
  const reqId = state.activeReqId;
  let interruptReason = null; // 'user' | 'repeat' | 'stall'
  let lastDeltaAt = 0;
  let textGuardTimer = null;

  const stopByGuard = (reason) => {
    if (interruptReason) return;
    interruptReason = reason;
    abort.abort();
  };

  // Guardas periódicas: stall (sem delta).
  const armGuardTimer = () => {
    clearInterval(textGuardTimer);
    textGuardTimer = setInterval(() => {
      const v = assessStreamState(controller.getText(), {
        lastDeltaAt,
        now: performance.now(),
      });
      if (v === 'stall') stopByGuard(v);
    }, 5000);
  };

  // prepara anexos (dataURL/base64)
  const media = [];
  for (const att of rawMedia) {
    try {
      await prepareAttachment(att);
      media.push(att);
    } catch {
      appToast(t('composer.prepareFailed', { name: att.name }), 'error');
    }
  }
  const hasVideo = media.some((m) => m.kind === 'video');

  // mensagens só-áudio (sem texto digitado): ASR → chat textual.
  // Executado DENTRO do try para que erros/aborts passem pelo finally
  // (liberando busy e controles) mesmo em falha.
  const onlyAudio = !text.trim() && media.length > 0 && media.every((m) => m.kind === 'audio');

  const umsg = { role: 'user', text, media, transcribed: false };
  state.textConv.push(umsg);
  const ulEl = createUserBubble(umsg);
  textList.appendChild(ulEl);

  const amsg = { role: 'assistant', text: '', media: [], inFlight: true };
  state.textConv.push(amsg);
  umsg.row = ulEl;
  const { row, controller } = buildAssistant(amsg, state.textConv);
  textList.appendChild(row);
  followChatSize();

  // Rollback do turno que não chegou a ser enviado ao modelo (falha/abort
  // no ASR): remove user+assistant do histórico e da UI para não poluir
  // conversas seguintes com mídia não transcrita.
  const rollbackFailedTurn = () => {
    const n = state.textConv.length;
    if (n > 0 && state.textConv[n - 1] === amsg) state.textConv.pop();
    if (state.textConv.length > 0 && state.textConv[state.textConv.length - 1] === umsg) state.textConv.pop();
    state.textControllers.delete(controller);
    [ulEl, row].forEach((el) => {
      if (el?.parentNode === textList) textList.removeChild(el);
    });
  };

  try {
    // Guarda periódica (stall sem deltas / duração máxima) — precisa ser
    // armada a cada envio para proteger o stream.
    armGuardTimer();

    // ASR para mensagens só-áudio (dentro do try → finally sempre roda)
    if (onlyAudio) {
      const att = media[0];
      let transcript = null;
      try {
        transcript = await transcribeAttachment(att, abort.signal);
      } catch (e) {
        if (e?.kind === 'abort' || e?.name === 'AbortError') {
          const ab = new Error(t('composer.transcriptAborted'));
          ab.kind = 'abort';
          throw ab;
        }
        const asrErr = new Error(t('composer.asrFailure'));
        asrErr.kind = 'asr';
        throw asrErr;
      }
      if (!transcript) {
        const asrErr = new Error(t('composer.asrFailure'));
        asrErr.kind = 'asr';
        throw asrErr;
      }
      text = transcript;
      umsg.text = transcript;
      umsg.transcribed = true;
      const transcribedRow = createUserBubble(umsg);
      umsg.row.replaceWith(transcribedRow);
      umsg.row = transcribedRow;
    }

    void persistConversation();
    let rate = null;
    let usedTokens = null;
    const { text: out, usage, finishReason } = await streamChatCompletion({
      baseUrl: baseUrl(),
      // Instrução oficial da Liquid AI para vídeo: pede para usar o que se VÊ e se OUVE.
      messages: conversationToMessages(state.textConv, {
        system: buildSystemPrompt(hasVideo),
        // Sem pergunta explícita + vídeo: orienta a descrever o visual e o sonoro.
        mediaFallbackText: hasVideo ? VIDEO_FALLBACK_TEXT : undefined,
      }),
      signal: abort.signal,
      extra: { timings_per_token: true, stream_options: { include_usage: true } },
      onMetrics: (timings, usage) => {
        if (interruptReason || abort.signal.aborted) return;
        if (Number.isFinite(timings?.predicted_per_second)) rate = timings.predicted_per_second;
        if (Number.isFinite(usage?.total_tokens)) usedTokens = usage.total_tokens;
        else if (Number.isFinite(timings?.prompt_n) && Number.isFinite(timings?.predicted_n)) {
          usedTokens = timings.prompt_n + (timings.cache_n || 0) + timings.predicted_n;
        }
        composer.setMetrics(rate, usedTokens, state.ctxSize);
        lastDeltaAt = performance.now();
      },
      onReasoning: (reasoning) => {
        if (interruptReason) return;
        lastDeltaAt = performance.now();
        controller.setReasoning(reasoning);
        const v = assessStreamState(reasoning, { lastDeltaAt, now: lastDeltaAt });
        if (v) stopByGuard(v);
      },
      onDelta: (t) => {
        if (interruptReason) return; // após abort, ignora fragmentos tardios
        lastDeltaAt = performance.now();
        controller.setMd(t);
        // Proteção contra geração descontrolada (repetição / tamanho).
        const v = assessStreamState(t, { lastDeltaAt, now: lastDeltaAt });
        if (v) stopByGuard(v);
      },
    });

    amsg.inFlight = false;
    amsg.text = out;
    amsg.usage = usage;
    amsg.finishReason = finishReason || null;
    controller.finish();

    // Informa quando o servidor encerra a resposta por seu limite de tokens.
    if (finishReason === 'length') {
      controller.appendNote('Resposta interrompida ao atingir o limite de tokens do servidor.');
    }

    // Fala automática: mesmo caminho idempotente do botão (uma única geração por resposta).
    if (settings.autoSpeak && out.trim() && state.caps?.audioOut !== false) {
      controller.speak();
    }
  } catch (e) {
    amsg.inFlight = false;
    const isAbort = e?.kind === 'abort' || e?.name === 'AbortError' || e?.name === 'TimeoutError';
    if (isAbort) {
      const isAsrAbort = interruptReason === null && onlyAudio && !umsg.transcribed;
      if (isAsrAbort) {
        // Abort durante o ASR: nada foi enviado ao modelo; turno é descartado.
        console.info(`[omni] abort ASR [${reqId}]`, {
          instante: new Date().toISOString(),
          motivo: interruptReason || 'user',
        });
        rollbackFailedTurn();
        appToast(t('composer.transcriptAborted'), 'warn', 4000);
      } else {
        console.info(`[omni] abort concluído [${reqId}]`, {
          instante: new Date().toISOString(),
          motivo: interruptReason || 'user',
          charAtAbort: controller.getText().length,
        });
        amsg.text = controller.getText();
        const noteKey = ({ repeat: 'guard.repeatNote', stall: 'guard.stallNote' })[interruptReason];
        const toastKey = ({ repeat: 'voice.repeatToast', stall: 'guard.stallToast' })[interruptReason];
        const note = noteKey ? t(noteKey) : t('guard.interruptedNote');
        controller.setInterrupted(note);
        appToast(
          toastKey ? t(toastKey) : t('guard.interruptedToast'),
          'warn',
          4000
        );
        probeSlotsAfterAbort(reqId);

        // AutoSpeak respeitado para respostas parciais: o texto já produzido
        // antes do cancelamento é elegível para síntese de voz. Uma única
        // tentativa por encerramento textual (generateSpeech é idempotente).
        const partial = (amsg.text || '').trim();
        if (!historySwitching && settings.autoSpeak && partial && state.caps?.audioOut !== false) {
          controller.speak();
        }
      }
    } else if (e?.kind === 'asr') {
      rollbackFailedTurn();
      const msg = e.message || t('composer.asrFailure');
      appToast(msg, 'error');
      console.warn('[omni] falha na transcrição:', e?.kind || e?.name, e?.diag || '', e?.cause || '');
    } else {
      const msg = summarizeError(e);
      amsg.text = controller.getText();
      controller.setError(msg);
      appToast(msg, 'error');
      console.warn('[omni] falha na geração:', e?.kind || e?.name, e?.diag || '', e?.cause || '');
    }
  } finally {
    void persistConversation();
    clearInterval(textGuardTimer);
    state.busy = false;
    state.abort = null;
    state.activeReqId = null;
    composer.setBusy(false);
    if (document.activeElement === document.body && !document.querySelector('#modalHost .modal')) composer.focus();
    updateStatusBusy();
  }
}

function hideHero(listEl) {
  const h = listEl.querySelector('.hero');
  if (h) h.remove();
}

/**
 * Após um abort, consulta GET /slots (somente leitura) para evidenciar se o
 * llama.cpp realmente liberou o processamento. Diagnóstico no console —
 * não altera o servidor.
 */
function probeSlotsAfterAbort(reqId = '?') {
  const check = (at) => {
    apiGet(baseUrl(), '/slots', { timeout: 4000 })
      .then((slots) => {
        const arr = Array.isArray(slots) ? slots : [];
        const states = arr.map((s) => ({ slot: s.id, processing: !!s.is_processing }));
        const algumProcessando = states.some((s) => s.processing);
        console.info(`[omni] slots após abort [${reqId}] @${at}`, {
          instante: new Date().toISOString(),
          slots: states,
        });
        if (algumProcessando && at === '1.5s') {
          console.info(`[omni] [${reqId}] ainda processando em 1.5s — consultando novamente em 4s (back end cancela em até ~3s).`);
        } else if (!algumProcessando) {
          console.info(`[omni] [${reqId}] slots livres em ${at} — o backend respeitou a desconexão.`);
        }
      })
      .catch(() => { /* probe não essencial */ });
  };
  check('1.5s');
  setTimeout(() => check('5s'), 5000);
}

const jumpToLatest = el(`<button class="icon-btn chat-jump-latest" type="button" hidden
  data-i18n-title="chat.jumpLatest" data-i18n-aria="chat.jumpLatest"
  title="${t('chat.jumpLatest')}" aria-label="${t('chat.jumpLatest')}">
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v15m-6-6 6 6 6-6"/></svg>
</button>`);

let followingLatest = true;

function followChatSize() {
  if (followingLatest) chatArea.scrollTop = chatArea.scrollHeight;
  updateJumpToLatest();
}

function onChatScroll() {
  followingLatest = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight < 120;
  updateJumpToLatest();
}

function updateJumpToLatest() {
  jumpToLatest.hidden = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight < 120;
}

function scrollBottom() {
  followingLatest = true;
  followChatSize();
}

const historyIds = new WeakMap();
let historyWrites = Promise.resolve();
let historySwitching = false;
let pendingChat = null;
let historyErrorShown = false;

function historyError() {
  appToast(t('history.failed'), 'error');
}

function persistConversation(conversation = state.textConv) {
  if (!historyAvailable() || !conversation.some((message) => message.role === 'user')) return historyWrites;
  let id = historyIds.get(conversation);
  if (!id) {
    id = newHistoryId();
    historyIds.set(conversation, id);
  }
  const snapshot = conversation
    .filter((message) => message.role === 'user' || !!message.text?.trim())
    .map(({ role, text, media, speech, transcribed, pendingTranscript, live }) => ({
      role, text, media: [...(media || [])], speech, transcribed, pendingTranscript, live,
    }));
  historyWrites = historyWrites.then(async () => {
    await saveHistory(id, snapshot);
    if (conversation === state.textConv) await setActiveHistory(id);
    historyErrorShown = false;
  }).catch(() => {
    if (!historyErrorShown) historyError();
    historyErrorShown = true;
  });
  return historyWrites;
}

function trackedSubmit(draft) {
  if (historySwitching || pendingChat) {
    composer.restoreDraft(draft);
    return;
  }
  const pending = submitChat(draft);
  pendingChat = pending;
  pending.finally(() => { if (pendingChat === pending) pendingChat = null; }).catch(console.error);
}

function buildAssistant(message, conversation) {
  const { row, controller } = createAssistantBubble(message, {
    onSpeak: message.live ? null : (text, signal, onProgress) => {
      const detected = detectTextLanguage(text);
      const lang = settings.ttsLang === 'auto' ? detected : settings.ttsLang;
      return ttsSpeak({ baseUrl: baseUrl(), text, voice: settings.ttsVoice, lang, signal, onProgress });
    },
    onSpeechReady: (buffer) => {
      if (!buffer || conversation !== state.textConv) return;
      message.speech = { kind: 'speech', mime: 'audio/wav', file: new Blob([buffer], { type: 'audio/wav' }) };
      void persistConversation(conversation);
    },
  });
  message.historyController = controller;
  state.textControllers.add(controller);
  return { row, controller };
}

function restoreConversation(chat) {
  newTextConversation();
  if (!chat) return;
  state.textConv = chat.messages;
  historyIds.set(state.textConv, chat.id);
  hideHero(textList);
  for (const message of state.textConv) {
    if (message.role === 'user') {
      message.row = createUserBubble(message);
      textList.appendChild(message.row);
    } else {
      const { row, controller } = buildAssistant(message, state.textConv);
      textList.appendChild(row);
      controller.setMd(message.text || '');
      controller.finish();
      if (message.speech?.url) controller.restoreSpeech(message.speech.url);
      else if (message.speech?.expired) controller.showExpiredSpeech();
    }
  }
  scrollBottom();
}

async function switchConversation(id, confirmActivity = true) {
  if (historySwitching) return false;
  if (id && id === historyIds.get(state.textConv)) return true;
  const active = state.busy || state.rt || liveStarting || state.generating || state.voicePlayer?.playing;
  if (active && confirmActivity && !confirm(t('history.confirmSwitch'))) return false;
  historySwitching = true;
  try {
    state.abort?.abort();
    closeVoiceSession();
    await pendingChat;
    await liveClosing;
    await persistConversation();
    const chat = id ? await loadHistory(id) : null;
    if (historyAvailable()) await setActiveHistory(id);
    restoreConversation(chat);
    return true;
  } finally {
    historySwitching = false;
  }
}

function expireVisibleMedia() {
  const timestamp = Date.now();
  const expired = (asset) => {
    if (!asset || asset.expired || !(asset.expiresAt <= timestamp)) return false;
    if (asset.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(asset.previewUrl);
    asset.expired = true;
    delete asset.file;
    delete asset.previewUrl;
    delete asset.thumbUrl;
    delete asset.dataUrl;
    delete asset.base64;
    return true;
  };
  for (const message of state.textConv) {
    let changed = false;
    for (const asset of message.media || []) if (expired(asset)) changed = true;
    if (changed && message.role === 'user' && message.row) {
      if (message.media[0]?.expired) message.pendingTranscript = false;
      const replacement = createUserBubble(message);
      message.row.replaceWith(replacement);
      message.row = replacement;
    }
    if (expired(message.speech)) {
      message.historyController?.showExpiredSpeech();
      delete message.speech.url;
    }
  }
}

async function restoreSavedHistory() {
  if (!historyAvailable()) return;
  historySwitching = true;
  try {
    const { active, rows } = await listHistory();
    if (active && rows.some((row) => row.id === active)) restoreConversation(await loadHistory(active));
  } catch { historyError(); }
  finally { historySwitching = false; }
}

// ---------- nova conversa (texto) ----------
function newTextConversation() {
  composer.clearMetrics();
  closeVoiceSession();
  composer.cancelRecording();
  if (state.busy) { state.abort?.abort(); }
  // Libera os áudios das mensagens da conversa anterior (players + Blob URLs).
  for (const c of state.textControllers) {
    try { c.disposeAudio?.(); } catch { /* ignora */ }
  }
  state.textControllers.clear();
  state.textConv = [];
  textList.innerHTML = '';
  textList.appendChild(hero('spark', 'hero.textTitle', 'hero.textBody'));
  composer.clear();
  composer.focus();
  scrollBottom();
}

// ---------- voz (tempo real via /v1/realtime) ----------
const voiceBarHost = el('<div></div>');
let textListenBtn = null;
let voiceEndBtn = null;
let voiceCancelBtn = null;
let voiceStatusEl = null;
let voiceStatusDot = null;
let voiceWatchdog = null;
let voiceStatusKey = null;

function buildVoiceUI() {
  voiceBarHost.innerHTML = `
    <div class="voice-bar">
      <span class="vb-dot" id="vbDot"></span>
      <span class="vb-text" id="vbText">${t('voice.mode')}</span>
      <button class="vb-btn primary" id="vbListen" type="button">${icon('mic', 14)} <span>${t('voice.listen')}</span></button>
      <button class="vb-btn danger" id="vbCancel" hidden type="button" title="${t('voice.cancelTitle')}">${icon('stop', 14)} ${t('voice.cancel')}</button>
      <button class="vb-btn danger" id="vbEnd" type="button" title="${t('voice.endTitle')}">${t('voice.end')}</button>
      <button class="vb-btn" id="vbReconnect" hidden type="button">${t('voice.reconnect')}</button>
    </div>
  `;
  voiceStatusDot = voiceBarHost.querySelector('#vbDot');
  voiceStatusEl = voiceBarHost.querySelector('#vbText');
  textListenBtn = voiceBarHost.querySelector('#vbListen');
  voiceCancelBtn = voiceBarHost.querySelector('#vbCancel');
  voiceEndBtn = voiceBarHost.querySelector('#vbEnd');
  const reconnect = voiceBarHost.querySelector('#vbReconnect');
  reconnect.addEventListener('click', toggleLive);
  textListenBtn.addEventListener('click', toggleListen);
  voiceCancelBtn.addEventListener('click', cancelVoiceResponse);
  voiceEndBtn.addEventListener('click', () => { endVoiceSession(); });

  voiceBarHost.hidden = true;
  voiceStatusEl.setAttribute('role', 'status');
  composerHost.insertBefore(voiceBarHost, composer.root);

}

function setVoiceStatus(mode, text) {
  if (!voiceStatusDot) return;
  voiceStatusKey = /^(voice|composer)\./.test(text || '') ? text : null;
  voiceStatusDot.className = 'vb-dot ' + mode;
  voiceStatusEl.textContent = voiceStatusKey ? t(voiceStatusKey) : (text || '');
  if (textListenBtn) {
    textListenBtn.disabled = mode === 'connecting';
    textListenBtn.classList.toggle('active', mode === 'listen' || mode === 'rec');
    textListenBtn.innerHTML = `${icon('mic', 14)} <span>${state.listening ? t('voice.pause') : t('voice.listen')}</span>`;
  }
  if (voiceEndBtn) voiceEndBtn.disabled = mode === 'connecting';
  updateVoiceCancelButton();
  updateStatusBusy();
}

window.addEventListener('omni-locale-change', () => {
  if (!voiceStatusEl) return;
  if (voiceStatusKey) voiceStatusEl.textContent = t(voiceStatusKey);
  if (textListenBtn) textListenBtn.innerHTML = `${icon('mic', 14)} <span>${t(state.listening ? 'voice.pause' : 'voice.listen')}</span>`;
  if (voiceCancelBtn) voiceCancelBtn.innerHTML = `${icon('stop', 14)} ${t('voice.cancel')}`;
  if (voiceEndBtn) voiceEndBtn.textContent = t('voice.end');
  voiceCancelBtn.title = t('voice.cancelTitle');
  voiceEndBtn.title = t('voice.endTitle');
  voiceBarHost.querySelector('#vbReconnect').textContent = t('voice.reconnect');
  composer.setLive(!!state.rt || liveStarting);
});

function updateVoiceCancelButton() {
  if (voiceCancelBtn) {
    voiceCancelBtn.hidden = !((state.generating && !state.voiceClear) || state.voicePlayer?.playing);
  }
}

async function ensureVoiceSession() {
  if (state.rt?.connected) return true;
  state.voiceEnded = false;
  const session = new RealtimeSession({
    baseUrl: baseUrl(),
    onEvent: (type, event) => { if (state.rt === session) handleRtEvent(type, event); },
    onState: (mode) => { if (state.rt === session) handleRtState(mode); },
  });
  session.modelId = state.modelId;
  state.rt = session;
  setVoiceStatus('connecting', 'voice.connecting');
  try {
    await withTimeout(Promise.all([session.once('session.created'), session.connect()]), 10000);
    if (state.rt !== session) return false;
    const updated = session.once('session.updated');
    session.updateSession({
      type: 'realtime',
      instructions: buildLiveInstructions() + '\nPrior conversation, provided as reference data:\n' + JSON.stringify(liveContext(state.textConv)),
      output_modalities: ['text', 'audio'],
    });
    await withTimeout(updated, 10000);
    if (state.rt !== session) return false;
    // Player PCM direto (sem elementos visuais / barra inferior).
    state.voicePlayer = new PcmPlayer({
      rate: state.rt.outRate,
      onPlaybackChange: updateVoiceCancelButton,
    });
    setVoiceStatus('ok', 'voice.ready');
    return true;
  } catch {
    if (state.rt !== session) return false;
    closeVoiceSession();
    voiceBarHost.hidden = false;
    setVoiceStatus('err', 'voice.connectFailed');
    return false;
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// watchdog: evita "gerando" preso se o servidor não responder
function armWatchdog() {
  clearTimeout(voiceWatchdog);
  voiceWatchdog = setTimeout(() => {
    if (state.generating) {
      state.generating = false;
      state.voiceBargeIn = false;
      state.voiceBargeInReady = false;
      state.rt?.clearAudio();
      closeVoiceSession();
      voiceBarHost.hidden = false;
      setVoiceStatus('err', 'voice.timeout');
    }
  }, 25000);
}
function clearWatchdog() { clearTimeout(voiceWatchdog); }

function closeVoiceSession() {
  liveEpoch++;
  liveStarting = false;
  livePreparation?.abort();
  finalizeLiveReply();
  voiceBarHost.hidden = true;
  composer.setLive(false);
  clearWatchdog();
  state.listening = false;
  state.generating = false;
  const microphone = state.voiceVad?.pause().catch(() => {});
  resetVoiceVadAudio(true);
  const session = state.rt;
  state.rt = null;
  if (session || microphone) {
    const closing = Promise.all([liveClosing, session?.close(), microphone]);
    liveClosing = closing;
    closing.then(() => { if (liveClosing === closing) liveClosing = null; });
  }
  state.pendingLiveCommits.length = 0;
  state.liveItems.clear();
  state.voicePlayer?.close();
  state.voicePlayer = null;
  state.voiceAssistant = null;
  state.voiceTextAcc = '';
  state.voiceClear = false;
  state.voiceBargeIn = false;
  state.voiceBargeInReady = false;
  state.voiceGuardNote = false;
  state.voiceEnded = true;
}

/** Encerra a sessão manualmente (mantém o histórico visual). */
function endVoiceSession() {
  closeVoiceSession();
  if (voiceStatusDot) setVoiceStatus('ok', 'voice.ended');
}

function handleRtState(mode) {
  if (!state.rt) return;
  if (mode === 'closed' || mode === 'error') {
    closeVoiceSession();
    voiceBarHost.hidden = false;
    setVoiceStatus('err', mode === 'error' ? 'voice.sessionError' : 'voice.sessionEnded');
    const rc = voiceBarHost.querySelector('#vbReconnect');
    if (rc) rc.hidden = false;
  } else if (mode === 'connected') {
    const rc = voiceBarHost.querySelector('#vbReconnect');
    if (rc) rc.hidden = true;
  }
}

// ---- escuta contínua com VAD ----

async function initVad() {
  if (state.voiceVad) return state.voiceVad;
  if (state.voiceVadInit) return state.voiceVadInit;
  state.voiceVadInit = createVad({
    onFrameProcessed: feedSileroFrame,
    onUtterance: (audio) => {
      state.voiceVadActive = false;
      state.voiceVadPreRoll = [];
      flushSileroFrames();
      commitUtterance(audio);
    },
    onSpeechAccepted: interruptPlaybackForBargeIn,
    onNoise: () => { resetVoiceVadAudio(true); },
    onSpeechChange: (sp) => {
      if (!state.listening) return;
      setVoiceStatus(sp ? 'rec' : 'listen', sp ? 'voice.speaking' : 'voice.listening');
    },
  }).then((vad) => {
    state.voiceVad = vad;
    return vad;
  }).finally(() => {
    state.voiceVadInit = null;
  });
  return state.voiceVadInit;
}

async function toggleListen() {
  if (state.listening) {
    state.listening = false;
    try { await state.voiceVad?.pause(); } catch { /* encerra captura */ }
    resetVoiceVadAudio(true);
    setVoiceStatus('ok', 'voice.paused');
    return;
  }
  const ok = await ensureVoiceSession();
  if (!ok) return;
  const session = state.rt;

  try {
    await initVad();
    if (state.rt !== session) return;
    resetVoiceVadAudio(true);
    state.listening = true;
    setVoiceStatus('listen', 'voice.listening');
    await state.voiceVad.start();
    if (!state.rt && !state.listening) await state.voiceVad.pause();
  } catch (error) {
    if (state.rt !== session) return;
    console.error('Falha ao iniciar o VAD no modo voz:', error);
    state.listening = false;
    resetVoiceVadAudio(true);
    setVoiceStatus('err', 'voice.vadFailed');
  }
}

function feedSileroFrame(probabilities, frame) {
  if (!state.listening || !state.rt?.connected) return;
  const voiced = Number.isFinite(probabilities?.isSpeech) && probabilities.isSpeech >= 0.35;

  if (voiced && !state.voiceVadActive) {
    state.voiceVadActive = true;
    for (const previousFrame of state.voiceVadPreRoll) queueSileroFrame(previousFrame);
    state.voiceVadPreRoll = [];
  }

  if (state.voiceVadActive) {
    queueSileroFrame(frame);
  } else {
    state.voiceVadPreRoll.push(new Float32Array(frame));
    if (state.voiceVadPreRoll.length > 10) state.voiceVadPreRoll.shift();
  }
}

function queueSileroFrame(frame) {
  state.voiceVadBatch.push(new Float32Array(frame));
  if (state.voiceVadBatch.length >= 4) flushSileroFrames();
}

function flushSileroFrames() {
  if (!state.voiceVadBatch.length) return;
  const frames = state.voiceVadBatch;
  state.voiceVadBatch = [];
  const sampleCount = frames.reduce((total, frame) => total + frame.length, 0);
  const merged = new Float32Array(sampleCount);
  let offset = 0;
  for (const frame of frames) {
    merged.set(frame, offset);
    offset += frame.length;
  }

  const sampleRate = state.rt?.inRate || 24000;
  const resampled = resampleLinear(merged, 16000, sampleRate);
  const pcm16 = new Int16Array(resampled.length);
  for (let i = 0; i < resampled.length; i++) {
    const sample = Math.max(-1, Math.min(1, resampled[i]));
    pcm16[i] = sample < 0 ? sample * 32768 : sample * 32767;
  }
  state.rt?.appendAudio(pcm16);
}

function resetVoiceVadAudio(clearServerBuffer = false) {
  state.voiceVadActive = false;
  state.voiceVadPreRoll = [];
  state.voiceVadBatch = [];
  if (clearServerBuffer) state.rt?.clearAudio();
}

function interruptPlaybackForBargeIn() {
  if (!state.generating && !state.voicePlayer?.playing) return;
  state.voicePlayer?.reset();
  if (!state.generating || state.voiceBargeIn) return;

  state.voiceBargeIn = true;
  state.voiceClear = true;
  state.rt?.cancelResponse();
  setVoiceStatus('ok', 'voice.bargeIn');
}

function commitUtterance(audio) {
  if (!state.listening || !state.rt?.connected || !audio?.length) return;
  if (state.generating && !state.voiceBargeIn) {
    state.rt.clearAudio();
    return;
  }
  const dataUrl = wavDataUrl(audio, 16000);
  const message = addVoiceUserBubble('', [{
    kind: 'audio', name: t('media.voice'), dataUrl, base64: dataUrl.split(',')[1],
  }]);
  message.pendingTranscript = true;
  state.pendingLiveCommits.push(message);
  clearWatchdog();
  if (state.generating) {
    state.rt.commitAudio(false);
    state.voiceBargeInReady = true;
    armWatchdog();
    return;
  }

  state.generating = true;
  state.voiceBargeIn = false;
  state.voiceBargeInReady = false;
  state.rt.commitAudio(false);
  state.rt.requestResponse();
  setVoiceStatus('ok', 'voice.processingSpeech');
  armWatchdog();
}

let liveStarting = false;
let liveEpoch = 0;
let liveClosing = null;
let livePreparation = null;

async function resolveLiveTranscripts(signal) {
  const conversation = state.textConv;
  for (const message of conversation) {
    if (!message.pendingTranscript) continue;
    const text = await transcribeAttachment(message.media[0], signal);
    if (signal?.aborted || conversation !== state.textConv || !text) throw new Error('ASR');
    applyLiveTranscript(message, text);
  }
}

async function toggleLive() {
  if (historySwitching) return;
  if (state.rt || liveStarting) { endVoiceSession(); return; }
  if (state.busy || composer.recording) return;
  const epoch = ++liveEpoch;
  liveStarting = true;
  composer.setLive(true);
  voiceBarHost.hidden = false;
  voiceBarHost.querySelector('#vbReconnect').hidden = true;
  setVoiceStatus('connecting', 'voice.connecting');
  const preparation = new AbortController();
  livePreparation = preparation;
  try {
    await liveClosing;
    if (epoch !== liveEpoch) return;
    await resolveLiveTranscripts(preparation.signal);
    if (epoch !== liveEpoch) return;
    expireVisibleMedia();
    await toggleListen();
  } catch {
    if (epoch === liveEpoch) {
      closeVoiceSession();
      voiceBarHost.hidden = false;
      setVoiceStatus('err', 'composer.asrFailure');
    }
  } finally {
    if (livePreparation === preparation) livePreparation = null;
    if (epoch === liveEpoch) {
      liveStarting = false;
      composer.setLive(!!state.rt);
    }
  }
}

async function submitChat(draft) {
  expireVisibleMedia();
  if (state.busy) { composer.restoreDraft(draft); return; }
  const route = submissionRoute(!!state.rt || liveStarting, draft.media);
  if (route === 'live') {
    if (!state.rt?.connected || liveStarting || state.generating || state.voicePlayer?.playing) {
      composer.restoreDraft(draft);
      return;
    }
    addVoiceUserBubble(draft.text);
    state.generating = true;
    state.rt.createTextItem(draft.text);
    state.rt.requestResponse();
    armWatchdog();
    setVoiceStatus('ok', 'voice.processing');
    return;
  }
  const leavingLive = !!state.rt || liveStarting;
  if (leavingLive) endVoiceSession();
  if (liveClosing || state.textConv.some((message) => message.pendingTranscript)) {
    const conversation = state.textConv;
    const abort = new AbortController();
    state.abort = abort;
    state.busy = true;
    composer.setBusy(true);
    let ready = false;
    try {
      await liveClosing;
      if (!abort.signal.aborted) await resolveLiveTranscripts(abort.signal);
      ready = !abort.signal.aborted && conversation === state.textConv;
    } catch {
      if (!abort.signal.aborted) appToast(t('composer.asrFailure'), 'error');
    } finally {
      state.abort = null;
      state.busy = false;
      composer.setBusy(false);
    }
    if (!ready) {
      if (conversation === state.textConv) composer.restoreDraft(draft);
      return;
    }
  }
  return sendText(draft);
}

function addVoiceUserBubble(text, media = []) {
  const message = { role: 'user', text, media };
  if (media.some((item) => item.kind === 'audio') && !text) message.pendingTranscript = true;
  state.textConv.push(message);
  message.row = createUserBubble(message);
  textList.appendChild(message.row);
  hideHero(textList);
  followChatSize();
  void persistConversation();
  return message;
}

function applyLiveTranscript(message, text) {
  message.text = text;
  message.transcribed = true;
  message.pendingTranscript = false;
  message.media[0].base64 = null;
  const row = createUserBubble(message);
  message.row.replaceWith(row);
  message.row = row;
  void persistConversation();
}

function finalizeLiveReply() {
  if (!state.liveReply) return;
  state.liveReply.text = state.voiceTextAcc;
  state.liveReply.inFlight = false;
  state.voiceAssistant?.finish();
  state.liveReply = null;
  state.voiceAssistant = null;
  void persistConversation();
}

let liveRate = null;
let liveUsedTokens = null;

function handleRtEvent(type, j) {
  if (type === 'response.created') {
    liveRate = liveUsedTokens = null;
  }
  const timing = j.timings ?? j.response?.timings;
  const usage = j.usage ?? j.response?.usage;
  if (timing || usage) {
    if (Number.isFinite(timing?.predicted_per_second)) liveRate = timing.predicted_per_second;
    if (Number.isFinite(usage?.total_tokens)) liveUsedTokens = usage.total_tokens;
    else if (Number.isFinite(timing?.prompt_n) && Number.isFinite(timing?.predicted_n)) {
      liveUsedTokens = timing.prompt_n + (timing.cache_n || 0) + timing.predicted_n;
    }
    composer.setMetrics(liveRate, liveUsedTokens, state.ctxSize);
  }
  switch (type) {
    case 'input_audio_buffer.committed': {
      const message = state.pendingLiveCommits.shift();
      if (message && j.item_id) state.liveItems.set(j.item_id, message);
      break;
    }
    case 'conversation.item.input_audio_transcription.completed': {
      const message = state.liveItems.get(j.item_id);
      if (message && j.transcript?.trim()) applyLiveTranscript(message, j.transcript.trim());
      state.liveItems.delete(j.item_id);
      break;
    }
    case 'response.created': {
      clearWatchdog();
      state.generating = true;
      state.voiceTextAcc = '';
      state.voiceClear = false;
      state.voiceBargeIn = false;
      state.voiceBargeInReady = false;
      state.voiceGuardNote = false;
      setVoiceStatus('ok', 'voice.generating');
      ensureVoiceAssistant();
      updateVoiceCancelButton();
      break;
    }
    case 'response.output_text.delta': {
      if (state.voiceClear) break; // após cancelamento, descarta fragmentos
      // Acumula os fragmentos; a bolha é UMA só e é atualizada progressivamente.
      state.voiceTextAcc += j.delta || '';
      if (!state.voiceAssistant) ensureVoiceAssistant();
      state.voiceAssistant.setThinking(false);
      state.voiceAssistant.setMd(state.voiceTextAcc);

      // Proteção contra geração descontrolada (repetição patológica).
      if (!state.voiceGuardNote && detectRunaway(state.voiceTextAcc)) {        state.voiceGuardNote = true;
        state.voiceClear = true;
        state.voicePlayer?.reset();
        state.rt?.cancelResponse();
        state.voiceAssistant.setInterrupted(t('voice.repeatInterrupted'));
        setVoiceStatus('ok', 'voice.repeatStopped');
        appToast(t('voice.repeatToast'), 'warn', 4000);
      }
      break;
    }
    case 'response.output_audio.delta': {
      if (state.voiceClear) break;
      try {
        state.voicePlayer?.pushPCM16(pcmFromB64(j.delta));
      } catch { /* chunk inválido */ }
      break;
    }
    case 'response.done': {
      clearWatchdog();
      const ctrl = state.voiceAssistant;
      state.generating = false;

      if (ctrl) {
        ctrl.setThinking(false);
        ctrl.setMd(state.voiceTextAcc || '');
        finalizeLiveReply();
      }
      state.voiceTextAcc = '';
      state.voiceClear = false;

      if (state.voiceBargeInReady && state.listening && !state.voiceEnded) {
        state.voiceBargeIn = false;
        state.voiceBargeInReady = false;
        state.generating = true;
        state.rt?.requestResponse();
        armWatchdog();
        setVoiceStatus('ok', 'voice.processingSpeech');
        break;
      }

      // escuta contínua: volta a ouvir imediatamente, sem reiniciar o microfone
      if (state.listening && !state.voiceEnded) {
        setVoiceStatus('listen', 'voice.listening');
      } else {
        setVoiceStatus('ok', 'voice.answered');
      }
      break;
    }
    case 'error': {
      appToast(j.error?.message || t('voice.sessionError'), 'error');
      if (state.generating) {
        finalizeLiveReply();
        clearWatchdog();
        state.generating = false;
        state.voicePlayer?.reset();
        if (state.listening) setVoiceStatus('listen', 'voice.listening');
      }
      break;
    }
    default:
      break;
  }
}

/** Cria a bolha do assistente se ainda não existir (resposta em andamento). */
function ensureVoiceAssistant() {
  if (state.voiceAssistant) return state.voiceAssistant;
  const amsg = { role: 'assistant', text: '', media: [], inFlight: true, live: true };
  state.textConv.push(amsg);
  state.liveReply = amsg;
  const { row, controller } = buildAssistant(amsg, state.textConv);
  state.voiceAssistant = controller;
  textList.appendChild(row);
  hideHero(textList);
  followChatSize();
  state.voicePlayer?.reset();
  return controller;
}

/** Cancela a resposta de voz em andamento (response.cancel + estado local). */
function cancelVoiceResponse() {
  const cancelGeneration = state.generating;
  if (!cancelGeneration && !state.voicePlayer?.playing) return;
  state.voiceClear = true;
  state.voiceBargeIn = false;
  state.voiceBargeInReady = false;
  state.voicePlayer?.reset();
  if (cancelGeneration) {
    state.rt?.cancelResponse();
    armWatchdog();
  }
  setVoiceStatus('ok', 'voice.responseInterrupted');
}

// ---------- configurações ----------
function applySettings(next) {
  const previousUrl = settings.serverUrl;
  Object.assign(settings, next);
  if (previousUrl !== settings.serverUrl) endVoiceSession();
  saveSettings(settings);
  setLocale(settings.uiLanguage);
  applyTheme(settings.theme);
  refreshStatus();

}

// ---------- luz de fundo (lightbox) ----------
document.getElementById('lightbox').addEventListener('click', hideLightbox);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideLightbox(); });

// ---------- topbar ----------
document.getElementById('btnSettings').addEventListener('click', () =>
  openSettings({ onSaved: applySettings })
);
document.getElementById('btnNewChat').addEventListener('click', () => {
  switchConversation(null).catch(historyError);
});
document.getElementById('btnHistory').addEventListener('click', () => {
  if (historySwitching) return;
  openHistory({
    onOpen: (id) => switchConversation(id),
    onDelete: async (id) => {
      if (id === historyIds.get(state.textConv)) return switchConversation(null, false);
      await historyWrites;
      return true;
    },
    onError: historyError,
  });
});
statusChip.addEventListener('click', toggleIntegratedServer);
window.addEventListener('omni-backend-snapshot', () => {
  renderServerControl();
  if (baseUrl() !== healthUrl) void refreshStatus();
});

// ---------- init ----------
function init() {
  void restoreHfDownload();
  installKeyboardFocus(document.getElementById('modalHost'));
  composerHost.appendChild(composer.root);
  buildVoiceUI();
  newTextConversation();
  mountView();
  composerHost.appendChild(jumpToLatest);
  jumpToLatest.addEventListener('click', (event) => {
    scrollBottom();
    if (event.detail === 0) composer.focus();
  });
  chatArea.addEventListener('scroll', onChatScroll, { passive: true });
  const chatSize = new ResizeObserver(followChatSize);
  chatSize.observe(chatArea);
  chatSize.observe(textList);
  composer.focus();
  renderServerControl();
  refreshStatus();
  healthTimer = setInterval(refreshStatus, 5000);
  void restoreSavedHistory();
  if (historyAvailable()) setInterval(() => {
    expireVisibleMedia();
    listHistory().catch(() => {});
  }, 60 * 60 * 1000);
}

window.addEventListener('beforeunload', () => {
  clearWatchdog();
  state.listening = false;
  state.voiceVad?.pause().catch(() => {});
  state.rt?.close();
  state.voicePlayer?.close();
  for (const c of state.textControllers) {
    try { c.disposeAudio?.(); } catch { /* ignora */ }
  }
  clearInterval(healthTimer);
});

init();
