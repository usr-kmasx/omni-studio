import { textModelConversation } from './image-generation.js';
// ============================================================
// Chat Completions (OpenAI-compatível) com streaming SSE.
// Suporta texto, imagem, áudio e vídeo (partes multimodais).
// ============================================================

import { apiFetch } from './client.js';

export function mediaToPart(media) {
  if (media.expired && media.kind !== 'document') return null;
  switch (media.kind) {
    case 'document':
      if (!media.documentText?.trim()) return null;
      return { type: 'text', text: 'Attached document (reference material):\n' + JSON.stringify({
        name: media.name,
        text: media.documentText,
      }) };
    case 'image':
      // data URL completa (data:image/...;base64,...)
      return { type: 'image_url', image_url: { url: media.dataUrl } };
    case 'audio':
      // base64 bruto (formato detectado automaticamente pelo servidor)
      return { type: 'input_audio', input_audio: { data: media.base64 } };
    case 'video':
      return { type: 'input_video', input_video: { data: media.base64 } };
    default:
      return null;
  }
}

// Converte uma mensagem da conversa (interna) em parte(s) de conteúdo OpenAI.
export function messageToContent(msg, opts = {}) {
  const parts = [];
  const text = (msg.text || '').trim();
  const media = (msg.media || []).filter((attachment) => !attachment.expired || attachment.kind === 'document');
  if (text) {
    parts.push({ type: 'text', text: msg.text });
  } else if (
    opts.mediaFallbackText &&
    msg.role === 'user' &&
    media.length
  ) {
    // Mensagem só com mídia (ex.: vídeo) e sem pergunta explícita:
    // orienta o modelo de forma natural a descrever o conteúdo.
    parts.push({ type: 'text', text: opts.mediaFallbackText });
  } else if (
    msg.role === 'user' &&
    !media.some((m) => m.kind === 'video' || m.kind === 'document') &&
    media.some((m) => m.kind === 'audio')
  ) {
    // Mensagem só com áudio (sem texto digitado): a fala é a própria
    // mensagem e INSTRUÇÃO do usuário. O modelo deve executá-la e
    // responder no mesmo idioma da fala — não transcrever/confirmar.
    parts.push({
      type: 'text',
      text:
        'The attached audio contains the user\'s message and instruction. ' +
        'Understand what was said and execute the request directly. ' +
        'Reply in the SAME LANGUAGE as the speech in the audio ' +
        '(e.g., if the user speaks Portuguese, reply in Portuguese; ' +
        'if English, reply in English; if Spanish, reply in Spanish). ' +
        'Do not merely transcribe, repeat, or confirm the instruction. ' +
        'Do not ask the user to provide text that you were asked to produce.',
    });
  }
  for (const m of media) {
    // Mensagem transcrita (ASR): o áudio já foi convertido em texto e não
    // deve ser reenviado como modalidade no chat principal.
    if (msg.transcribed && m.kind === 'audio') continue;
    const p = mediaToPart(m);
    if (p) parts.push(p);
  }
  return parts;
}

export function conversationToMessages(conversation, opts = {}) {
  const messages = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  for (const msg of textModelConversation(conversation)) {
    if (msg.role === 'assistant' && msg.inFlight) continue; // resposta em andamento
    const content = messageToContent(msg, opts);
    if (!content.length) continue;
    messages.push({ role: msg.role, content });
  }
  return messages;
}

/**
 * Envia um chat completion com streaming.
 * @param {object} o
 * @param {string} o.baseUrl
 * @param {Array} o.messages  já no formato OpenAI
 * @param {object} o.extra    parâmetros extras (max_tokens etc.)
 * @param {AbortSignal} [o.signal]
 * @param {function(string):void} [o.onReasoning] recebe o raciocínio acumulado
 * @param {function(string):void} o.onDelta  recebe o texto acumulado
 * @returns {Promise<{text:string, usage:object|null}>}
 */
export async function streamChatCompletion(o) {
  const body = {
    model: 'default',
    messages: o.messages,
    stream: true,
    ...o.extra,
  };

  const res = await apiFetch(o.baseUrl, '/v1/chat/completions', {
    method: 'POST',
    body,
    signal: o.signal,
    timeout: 0, // streaming: sem timeout global; abort é controlado pelo signal
    rawResponse: true,
  });

  if (!res.body) throw new Error('Resposta sem corpo (streaming indisponível).');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  let reasoning = '';
  let usage = null;
  let finishReason = null;
  let abortHandled = false;

  const abortError = () => {
    const e = new Error('Geração interrompida.');
    e.kind = 'abort';
    return e;
  };
  const handleAbort = () => {
    if (abortHandled) return;
    abortHandled = true;
    try { reader.cancel(); } catch { /* ignora */ }
  };
  if (o.signal) {
    if (o.signal.aborted) handleAbort();
    else o.signal.addEventListener('abort', handleAbort, { once: true });
  }

  try {
    for (;;) {
      if (abortHandled) throw abortError();
      const { done, value } = await reader.read();
      if (abortHandled) throw abortError();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        let j;
        try { j = JSON.parse(data); } catch { continue; }
        if (j.usage) usage = j.usage;
        if (j.timings || j.usage) o.onMetrics?.(j.timings, j.usage);
        const choice = j.choices?.[0];
        const delta = choice?.delta;
        if (typeof delta?.reasoning_content === 'string' && delta.reasoning_content) {
          reasoning += delta.reasoning_content;
          o.onReasoning?.(reasoning);
        }
        if (delta && typeof delta.content === 'string') {
          text += delta.content;
          o.onDelta?.(text);
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (j.error) throw new Error(j.error.message || 'Erro do servidor');
      }
    }
  } catch (e) {
    // Sempre tenta encerrar o stream, mesmo em abort/erro, para liberar
    // a conexão e o slot do servidor o quanto antes.
    try { await reader.cancel(); } catch { /* ignora */ }
    throw e;
  } finally {
    if (o.signal) o.signal.removeEventListener('abort', handleAbort);
  }

  return { text, usage, finishReason };
}
