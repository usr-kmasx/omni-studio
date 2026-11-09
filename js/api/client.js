// ============================================================
// Cliente HTTP base para o servidor llama.cpp
// ============================================================

export class ApiError extends Error {
  constructor(message, { kind = 'unknown', status = null, detail = null, cause = null, diag = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;      // 'network' | 'http' | 'parse' | 'abort' | 'timeout' | 'unknown'
    this.status = status;
    this.detail = detail;  // corpo da resposta (quando houver)
    this.cause = cause;    // erro original (para diagnóstico)
    this.diag = diag;      // { endpoint, elapsedMs, attempts, ... }
  }
}

function friendlyNetworkMessage() {
  return (
    'Falha de rede ao falar com o servidor (o navegador não recebeu resposta). ' +
    'O llama.cpp pode ter reiniciado ou caído. Verifique se ele está ativo e tente novamente.'
  );
}

export async function apiFetch(baseUrl, path, { method = 'GET', body = null, signal, timeout = 60000, binary = false, rawResponse = false, headers = null, withMeta = false } = {}) {
  const url = baseUrl + path;
  const t0 = performance.now();
  const diag = { endpoint: path, kind: null };
  const ctrl = new AbortController();
  let timer = null;
  if (timeout > 0) {
    timer = setTimeout(() => ctrl.abort(new DOMException('Timeout', 'TimeoutError')), timeout);
  }

  // Composição de sinais: o sinal externo deve permanecer conectado durante
  // TODO o ciclo de vida da resposta (inclusive o corpo SSE/binário), mesmo
  // depois de apiFetch retornar. AbortSignal.any preserva essa ligação sem
  // depender de listener temporário.
  let fetchSignal = ctrl.signal;
  if (signal) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
      fetchSignal = AbortSignal.any([ctrl.signal, signal]);
    } else {
      // fallback: mantém o listener ligado (não remove no finally) para que o
      // cancelamento externo alcance o fetch durante a leitura do corpo.
      const onAbort = () => ctrl.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort);
    }
  }

  try {
    let res;
    try {
      res = await fetch(url, {
        method,
        signal: fetchSignal,
        headers: headers || (body != null ? { 'Content-Type': 'application/json' } : undefined),
        body: body != null ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      });
    } catch (e) {
      // abort/timeout (timer interno ou signal externo) passam para o catch externo
      if (e instanceof ApiError) throw e;
      const isAbort = e?.name === 'AbortError' || e?.name === 'TimeoutError' || ctrl.signal.aborted;
      if (isAbort) throw e;
      // TypeError de fetch = falha de rede (conexão recusada, reiniciada ou caiu).
      throw new ApiError(friendlyNetworkMessage(), {
        kind: 'network',
        cause: e,
        diag: { ...diag, elapsedMs: Math.round(performance.now() - t0) },
      });
    }

    diag.status = res.status;
    diag.hasResponse = true;
    if (!res.ok) {
      let detail = null;
      let raw = '';
      try { detail = await res.json(); } catch {
        try { raw = (await res.text()).slice(0, 300); } catch { /* corpo ilegível */ }
      }
      const serverMsg = detail?.error?.message || detail?.message || (raw ? raw : null);
      const msg = serverMsg
        ? `O servidor respondeu com erro HTTP ${res.status}: ${serverMsg}`
        : `O servidor respondeu com erro HTTP ${res.status}.`;
      throw new ApiError(msg, {
        kind: 'http',
        status: res.status,
        detail: detail || raw,
        diag: { ...diag, elapsedMs: Math.round(performance.now() - t0) },
      });
    }

    const ct = res.headers.get('content-type') || '';
    if (rawResponse) return res;
    if (binary) {
      const buf = await res.arrayBuffer();
      if (withMeta) return { data: buf, status: res.status, contentType: ct };
      return buf;
    }
    if (ct.includes('application/json')) return await res.json();
    return await res.text();
  } catch (e) {
    if (e.name === 'AbortError' || e.name === 'TimeoutError') {
      if (signal?.aborted) {
        throw new ApiError('Geração interrompida.', {
          kind: 'abort',
          diag: { ...diag, elapsedMs: Math.round(performance.now() - t0) },
        });
      }
      throw new ApiError('O servidor demorou demais para responder.', {
        kind: 'timeout',
        diag: { ...diag, elapsedMs: Math.round(performance.now() - t0) },
      });
    }
    if (e instanceof ApiError) throw e;
    throw new ApiError('Erro inesperado na comunicação com o servidor: ' + (e?.message || e), {
      kind: 'unknown',
      cause: e,
      diag: { ...diag, elapsedMs: Math.round(performance.now() - t0) },
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function apiGet(baseUrl, path, opts) {
  return apiFetch(baseUrl, path, { ...opts, method: 'GET' });
}

export function apiPost(baseUrl, path, body, opts) {
  return apiFetch(baseUrl, path, { ...opts, method: 'POST', body });
}

// ---- verificação de saúde / informações ----

export async function checkHealth(baseUrl) {
  try {
    const r = await apiGet(baseUrl, '/health', { timeout: 5000 });
    return { online: r?.status === 'ok', status: r?.status, error: null };
  } catch (e) {
    return { online: false, status: null, error: e };
  }
}

export async function fetchModelInfo(baseUrl) {
  try {
    const r = await apiGet(baseUrl, '/v1/models', { timeout: 5000 });
    const m = r?.data?.[0] || null;
    const arch = m?.architecture || null;
    const inputMod = Array.isArray(arch?.input_modalities) ? arch.input_modalities : null;
    const outputMod = Array.isArray(arch?.output_modalities) ? arch.output_modalities : null;
    return {
      ok: true,
      model: m,
      inputModalities: inputMod,
      outputModalities: outputMod,
      caps: {
        image: !inputMod || inputMod.includes('image'),
        audio: !inputMod || inputMod.includes('audio'),
        video: !inputMod || inputMod.includes('video'),
        audioOut: !outputMod || outputMod.includes('audio'),
      },
    };
  } catch (e) {
    return { ok: false, model: null, caps: null, error: e };
  }
}

export async function fetchProps(baseUrl) {
  try {
    return await apiGet(baseUrl, '/props', { timeout: 5000 });
  } catch {
    return null;
  }
}

export function summarizeError(e) {
  if (e instanceof ApiError) return e.message;
  return e?.message || 'Erro inesperado.';
}
