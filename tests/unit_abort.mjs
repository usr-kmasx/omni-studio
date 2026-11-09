import { apiFetch, ApiError } from '../js/api/client.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 1) composição: o fetch recebe um sinal ligado ao externo ----------
{
  let capturedSignal = null;
  globalThis.fetch = async (_url, opts) => {
    capturedSignal = opts.signal;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      body: new ReadableStream({ start(c) { c.close(); } }),
    };
  };

  const ac = new AbortController();
  await apiFetch('http://x', '/v1/chat/completions', {
    method: 'POST',
    body: { stream: true },
    signal: ac.signal,
    rawResponse: true,
  });
  if (!capturedSignal) throw new Error('fetch não recebeu signal');
  ac.abort();
  await sleep(10);
  if (!capturedSignal.aborted) throw new Error('signal externo não está ligado ao fetch');
  console.log('composição de sinais OK');
}

// ---------- 2) abort antes dos cabeçalhos ----------
{
  globalThis.fetch = async (_u, opts) => {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    await new Promise(() => {});
  };
  const ac = new AbortController();
  ac.abort();
  let err = null;
  try { await apiFetch('http://x', '/health', { signal: ac.signal, timeout: 500 }); }
  catch (e) { err = e; }
  if (!(err instanceof ApiError) || err.kind !== 'abort') throw new Error('abort pré-fetch: kind=' + (err && err.kind));
  console.log('abort antes dos cabeçalhos OK');
}

// ---------- 3) abort DURANTE a espera de cabeçalhos ----------
{
  globalThis.fetch = async (_u, opts) => {
    return new Promise((_, rej) => {
      opts.signal?.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')), { once: true });
      if (opts.signal?.aborted) rej(new DOMException('Aborted', 'AbortError'));
    });
  };
  const ac = new AbortController();
  const pending = apiFetch('http://x', '/health', { signal: ac.signal, timeout: 5000 });
  setTimeout(() => ac.abort(), 30);
  let err = null;
  try { await pending; } catch (e) { err = e; }
  if (!(err instanceof ApiError) || err.kind !== 'abort') throw new Error('abort durante cabeçalhos: kind=' + (err && err.kind));
  console.log('abort durante cabeçalhos OK');
}

// ---------- 4) timeout interno ----------
{
  globalThis.fetch = async (_u, opts) => {
    return new Promise((_, rej) => {
      opts.signal?.addEventListener('abort', () => rej(new DOMException('Timeout', 'TimeoutError')), { once: true });
      if (opts.signal?.aborted) rej(new DOMException('Timeout', 'TimeoutError'));
    });
  };
  let err = null;
  try { await apiFetch('http://x', '/health', { timeout: 80 }); }
  catch (e) { err = e; }
  if (!(err instanceof ApiError) || err.kind !== 'timeout') throw new Error('timeout: kind=' + (err && err.kind));
  console.log('timeout interno OK');
}

// ---------- 5) conclusão normal JSON ----------
{
  globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ status: 'ok' }) });
  const r = await apiFetch('http://x', '/health');
  if (r.status !== 'ok') throw new Error('JSON normal falhou');
  console.log('JSON normal OK');
}

// ---------- 6) binário com meta ----------
{
  globalThis.fetch = async () => {
    const ab = new ArrayBuffer(4);
    new Uint8Array(ab).set([0x52, 0x49, 0x46, 0x46]);
    return { ok: true, status: 200, headers: { get: () => 'audio/wav' }, arrayBuffer: async () => ab };
  };
  const r = await apiFetch('http://x', '/tts', { method: 'POST', body: {}, binary: true, withMeta: true });
  if (r.status !== 200 || r.contentType !== 'audio/wav' || r.data.byteLength !== 4) throw new Error('binário falhou');
  console.log('binário withMeta OK');
}

console.log('=== UNIT ABORT OK (teste funcional de streaming no navegador) ===');
