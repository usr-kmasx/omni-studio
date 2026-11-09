// ============================================================
// Síntese de voz: POST /tts (retorna WAV)
// Estratégia híbrida:
//  - textos < 120 palavras: UMA requisição (comportamento atual);
//  - textos >= 120 palavras: blocos semânticos sequenciais com
//    concatenação WAV — um único áudio final.
// ============================================================

import { apiFetch, ApiError } from './client.js';
import { markdownToSpeech, splitSpeechBlocks, countWords, concatWavBlobs } from '../utils/speech-text.js';

const MAX_ATTEMPTS = 2;
const TIMEOUT_MS = 180000;
const RETRY_DELAY_MS = 500;

const TTS_FRAME_MS = 80;      // 1 frame de áudio = 80 ms (LFM3)
const TTS_MIN_FRAMES = 512;   // teto mínimo (default do servidor)
const TTS_MAX_FRAMES = 4096;  // teto máximo de segurança
const SPEECH_WORDS_PER_FRAME_RATIO = 10.0;

const SPLIT_THRESHOLD_WORDS = 120; // >= este valor → blocos
const BLOCK_MAX_WORDS = 35;         // calibrado por teste real (30/25 se necessário)
const BLOCK_PAUSE_MS = 150;         // pausa entre blocos na concatenação

/**
 * Calcula n_predict (frames de áudio) proporcional ao tamanho do texto.
 * clamp(ceil(palavras × 10), 512, 4096). Limite máximo — o modelo pode
 * encerrar antes (EOS).
 */
export function computeNPredict(text) {
  const words = countWords(text);
  const raw = Math.ceil(words * SPEECH_WORDS_PER_FRAME_RATIO);
  return Math.max(TTS_MIN_FRAMES, Math.min(TTS_MAX_FRAMES, raw));
}

function isRetriable(e) {
  if (!(e instanceof ApiError)) return false;
  if (e.kind === 'network') return true;
  if (e.kind === 'http' && e.status === 503) return true;
  return false;
}

/**
 * Requisição única a POST /tts (um bloco de texto).
 * Retorna {ok, url?, buffer?, error?, meta}.
 * - meta: { elapsedMs, status, contentType, words, nPredict, durationSec, truncated }
 */
export async function requestTtsOnce({ baseUrl, text, voice = 'female', lang, signal }) {
  const t0 = performance.now();
  const speechText = markdownToSpeech(text);
  const words = countWords(speechText);
  const nPredict = computeNPredict(speechText);

  // `lang` é opcional: quando vazio (auto sem detecção local), omite o
  // parâmetro e deixa o backend inferir o idioma (contrato confirmado).
  const body = { input: speechText, voice, n_predict: nPredict };
  if (lang) body.lang = lang;

  try {
    const { data, status, contentType } = await apiFetch(baseUrl, '/tts', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
      signal,
      timeout: TIMEOUT_MS,
      binary: true,
      withMeta: true,
    });
    if (!data || data.byteLength === 0) {
      throw new ApiError('O servidor retornou um áudio vazio (WAV com 0 bytes).', {
        kind: 'http',
        status: 200,
      });
    }

    const url = URL.createObjectURL(new Blob([data], { type: 'audio/wav' }));
    const durationSec = Math.max(0, (data.byteLength - 44) / 48000);
    const maxDurationSec = (nPredict * TTS_FRAME_MS) / 1000;
    const truncated = durationSec >= maxDurationSec - 0.25;

    if (truncated) {
      console.warn('[omni] TTS atingiu o teto de n_predict', {
        nPredict,
        estimatedDurationSec: +durationSec.toFixed(2),
        maxDurationSec: +maxDurationSec.toFixed(2),
      });
    }

    return {
      ok: true,
      url,
      buffer: data,
      error: null,
      meta: {
        elapsedMs: Math.round(performance.now() - t0),
        status,
        contentType,
        words,
        nPredict,
        durationSec: +durationSec.toFixed(2),
        truncated,
      },
    };
  } catch (e) {
    return {
      ok: false,
      url: null,
      buffer: null,
      error: e instanceof ApiError ? e : new ApiError(e?.message || String(e), { kind: 'unknown', cause: e }),
      meta: {
        elapsedMs: Math.round(performance.now() - t0),
        status: e?.status ?? null,
        contentType: null,
        words,
        nPredict,
        durationSec: null,
        truncated: null,
      },
    };
  }
}

/**
 * Gera fala a partir de texto (caminho usado pelo botão "ouvir" e pelo
 * autoSpeak).
 * - < 120 palavras: uma única requisição (comportamento anterior).
 * - >= 120 palavras: divisão em blocos semânticos, geração sequencial
 *   (nunca simultânea) e concatenação WAV — um único áudio.
 * - Se qualquer bloco falhar ou for truncado, ABORTA a sequência e lança
 *   erro (nunca entrega um áudio parcial como completo).
 * - Respeita `signal` (abort) entre blocos: nenhum novo bloco é enviado
 *   após o cancelamento.
 * @returns {Promise<{url:string, meta:object}>}
 */
export async function ttsSpeak({ baseUrl, text, voice = 'female', lang, signal, onProgress }) {
  const speechText = markdownToSpeech(text);
  const words = countWords(speechText);

  // Caso simples: texto curto/médio — uma única requisição (progresso indeterminado).
  if (words < SPLIT_THRESHOLD_WORDS) {
    let last = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const r = await requestTtsOnce({ baseUrl, text, voice, lang, signal });
      if (r.ok) return { url: r.url, buffer: r.buffer, meta: { ...r.meta, strategy: 'single' } };
      last = r;
      if (isRetriable(r.error) && attempt === 0) {
        await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
        continue;
      }
      throw r.error;
    }
    throw last.error;
  }

  // Caso longo: blocos semânticos sequenciais.
  const blocks = splitSpeechBlocks(speechText, BLOCK_MAX_WORDS);
  const buffers = [];
  const metas = [];

  for (let i = 0; i < blocks.length; i++) {
    if (signal?.aborted) {
      throw new ApiError('Geração interrompida.', { kind: 'abort' });
    }

    onProgress?.({ index: i + 1, total: blocks.length });

    const block = blocks[i];
    const r = await requestTtsOnce({ baseUrl, text: block, voice, lang, signal });
    if (!r.ok) {
      throw new ApiError(`Falha ao sintetizar o bloco ${i + 1}/${blocks.length}: ${r.error.message}`, {
        kind: r.error.kind,
        status: r.error.status,
        cause: r.error,
      });
    }
    if (r.meta.truncated) {
      throw new ApiError(`Bloco ${i + 1}/${blocks.length} atingiu o limite de frames — áudio incompleto; geração interrompida.`, {
        kind: 'http',
        status: 200,
      });
    }
    buffers.push(r.buffer);
    metas.push(r.meta);
  }

  let combined;
  try {
    combined = concatWavBlobs(buffers, { pauseMs: BLOCK_PAUSE_MS });
  } catch (e) {
    throw new ApiError('Falha ao concatenar os blocos de áudio: ' + (e?.message || e), {
      kind: 'unknown',
      cause: e,
    });
  }

  const url = URL.createObjectURL(new Blob([combined], { type: 'audio/wav' }));
  const totalDuration = Math.max(0, (combined.byteLength - 44) / 48000);

  return {
    url,
    buffer: combined,
    meta: {
      strategy: 'blocks',
      blocks: blocks.length,
      blockWords: blocks.map((b) => countWords(b)),
      durations: metas.map((m) => m.durationSec),
      truncated: metas.some((m) => m.truncated),
      totalDurationSec: +totalDuration.toFixed(2),
    },
  };
}
