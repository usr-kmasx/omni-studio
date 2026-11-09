// ============================================================
// WebSocket /v1/realtime — conversa por voz em tempo real
// (protocolo OpenAI Realtime, implementado pelo llama.cpp)
// ============================================================

function b64FromInt16(int16) {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.length * 2);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export class RealtimeSession {
  /**
   * @param {object} o
   * @param {string} o.baseUrl  ex.: http://127.0.0.1:8080
   * @param {function(string, object):void} [o.onEvent]  (tipo, payload)
   * @param {function(string):void} [o.onState]  'connecting'|'connected'|'error'|'closed'
   */
  constructor(o) {
    this.baseUrl = o.baseUrl;
    this.onEvent = o.onEvent;
    this.onState = o.onState;
    this.ws = null;
    this.inRate = 24000;
    this.outRate = 24000;
    this.sessionId = null;
    this._waiters = [];
    this._closed = false;
  }

  _emit(type, payload) {
    this.onEvent?.(type, payload);
    for (let i = this._waiters.length - 1; i >= 0; i--) {
      const w = this._waiters[i];
      if (w.type === type) {
        this._waiters.splice(i, 1);
        w.resolve(payload);
      }
    }
  }

  once(type) {
    return new Promise((resolve) => this._waiters.push({ type, resolve }));
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (this.ws) this.close();
      this._closed = false;
      this.onState?.('connecting');
      const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/v1/realtime';
      const ws = new WebSocket(wsUrl);
      this.ws = ws;
      ws.onopen = () => {
        this.onState?.('connected');
        resolve();
      };
      ws.onmessage = (ev) => {
        let j;
        try { j = JSON.parse(ev.data); } catch { return; }
        if (j.type === 'session.created') {
          this.sessionId = j.session?.id || null;
          const fmt = j.session?.audio || {};
          this.inRate = fmt?.input?.format?.rate || 24000;
          this.outRate = fmt?.output?.format?.rate || 24000;
        }
        this._emit(j.type, j);
      };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        if (!this._closed) this.onState?.('closed');
      };
      ws.onerror = () => {
        this.onState?.('error');
        reject(new Error('Falha ao abrir o WebSocket de voz.'));
      };
    });
  }

  get connected() {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  send(obj) {
    if (this.connected) this.ws.send(JSON.stringify(obj));
  }

  updateSession(patch) {
    this.send({ type: 'session.update', session: patch });
  }

  appendAudio(int16) {
    this.send({ type: 'input_audio_buffer.append', audio: b64FromInt16(int16) });
  }

  commitAudio(final = false) {
    this.send({ type: 'input_audio_buffer.commit', final: !!final });
  }

  clearAudio() {
    this.send({ type: 'input_audio_buffer.clear' });
  }

  createTextItem(text) {
    this.send({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    });
  }

  createToolOutput(callId, output) {
    this.send({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output },
    });
  }

  requestResponse(overrides = {}) {
    this.send({ type: 'response.create', ...overrides });
  }

  cancelResponse() {
    this.send({ type: 'response.cancel' });
  }

  close() {
    this._closed = true;
    const socket = this.ws;
    this.ws = null;
    if (!socket || socket.readyState === 3) return Promise.resolve();
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2000);
      socket.addEventListener('close', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      try { socket.close(); } catch {
        clearTimeout(timeout);
        resolve();
      }
    });
  }
}
