// ============================================================
// Áudio: gravação via microfone, codificação WAV, resampling,
// player de baixa latência para PCM16 (modo voz em tempo real)
// ============================================================

export const TARGET_RATE = 24000; // taxa do modelo (24 kHz)

// ---- resampling linear ----
export function resampleLinear(src, srcRate, dstRate) {
  if (srcRate === dstRate) return src;
  const n = Math.max(1, Math.round((src.length * dstRate) / srcRate));
  const out = new Float32Array(n);
  const step = srcRate / dstRate;
  for (let i = 0; i < n; i++) {
    const pos = i * step;
    const i0 = Math.floor(pos);
    const i1 = Math.min(src.length - 1, i0 + 1);
    const frac = pos - i0;
    out[i] = src[i0] * (1 - frac) + src[i1] * frac;
  }
  return out;
}

function floatToInt16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    let v = f32[i] * 32768;
    v = Math.max(-32768, Math.min(32767, v));
    out[i] = v | 0;
  }
  return out;
}

// ---- codificação WAV (PCM 16-bit mono) ----
export function encodeWav(float32, sampleRate) {
  const int16 = floatToInt16(float32);
  const bytes = new Uint8Array(int16.buffer);
  const dataLen = bytes.length;
  const buffer = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buffer);

  const writeStr = (offset, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);            // PCM
  view.setUint16(22, 1, true);            // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);            // block align
  view.setUint16(34, 16, true);           // bits por amostra
  writeStr(36, 'data');
  view.setUint32(40, dataLen, true);
  new Uint8Array(buffer, 44).set(bytes);
  return buffer;
}

export function wavDataUrl(float32, sampleRate) {
  const buffer = encodeWav(float32, sampleRate);
  let bin = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return 'data:audio/wav;base64,' + btoa(bin);
}

// ---- gravação do microfone (captura completa → WAV) ----
export class Recorder {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.processor = null;
    this.chunks = [];
    this.startTime = 0;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    await this.ctx.resume();
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.processor.onaudioprocess = (e) => {
      this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    this.source.connect(this.processor);
    this.processor.connect(this.ctx.destination);
    this.startTime = performance.now();
    return true;
  }

  /** Encerra e devolve um anexo de áudio (WAV 24 kHz). */
  async stop() {
    if (this.processor) { this.processor.disconnect(); this.processor = null; }
    if (this.source) { this.source.disconnect(); this.source = null; }
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }

    const srcRate = this.ctx ? this.ctx.sampleRate : TARGET_RATE;
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const merged = new Float32Array(total);
    let off = 0;
    for (const c of this.chunks) { merged.set(c, off); off += c.length; }
    this.chunks = [];

    const duration = (performance.now() - this.startTime) / 1000;
    const resampled = resampleLinear(merged, srcRate, TARGET_RATE);
    const dataUrl = wavDataUrl(resampled, TARGET_RATE);

    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    return {
      dataUrl,
      duration,
      sampleRate: TARGET_RATE,
      name: `gravação ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.wav`,
    };
  }

  cancel() {
    if (this.processor) { this.processor.disconnect(); this.processor = null; }
    if (this.source) { this.source.disconnect(); this.source = null; }
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; }
    this.chunks = [];
  }
}

// ---- captura contínua (streaming) para o modo voz em tempo real ----
export class LiveAudioCapture {
  constructor({ rate = TARGET_RATE, onChunk }) {
    this.rate = rate;
    this.onChunk = onChunk;
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.processor = null;
    this._lastTs = 0;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    await this.ctx.resume();
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.processor = this.ctx.createScriptProcessor(8192, 1, 1);
    this.processor.onaudioprocess = (e) => {
      const raw = e.inputBuffer.getChannelData(0);

      // RMS do quadro original (para detecção de fala)
      let sum = 0;
      for (let i = 0; i < raw.length; i++) sum += raw[i] * raw[i];
      const rms = Math.sqrt(sum / raw.length);

      const now = performance.now();
      const dtMs = this._lastTs ? now - this._lastTs : 100;
      this._lastTs = now;

      const out = resampleLinear(raw, this.ctx.sampleRate, this.rate);
      this.onChunk?.({ int16: floatToInt16(out), rms, dtMs });
    };
    this.source.connect(this.processor);
    this.processor.connect(this.ctx.destination);
    return true;
  }

  stop() {
    if (this.processor) { this.processor.disconnect(); this.processor = null; }
    if (this.source) { this.source.disconnect(); this.source = null; }
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; }
  }
}

// ---- player de baixa latência (PCM16 → Web Audio) ----
export class PcmPlayer {
  constructor({ rate = TARGET_RATE, onPlaybackChange } = {}) {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.rate = rate;
    this.onPlaybackChange = onPlaybackChange;
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 1;
    this.gain.connect(this.ctx.destination);
    this.nextT = 0;
    this._paused = false;
    this.sources = new Set();
  }

  get volume() { return this.gain.gain.value; }
  set volume(v) { this.gain.gain.value = Math.max(0, Math.min(1, v)); }
  get playing() { return this.sources.size > 0; }

  pushPCM16(int16) {
    if (this._paused) return;
    const f32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768;
    const buf = this.ctx.createBuffer(1, f32.length, this.rate);
    buf.copyToChannel(f32, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      try { src.disconnect(); } catch { /* ignora */ }
      this.onPlaybackChange?.(this.playing);
    };
    const t = Math.max(this.ctx.currentTime + 0.05, this.nextT);
    src.start(t);
    this.nextT = t + buf.duration;
    this.onPlaybackChange?.(this.playing);
  }

  /** Interrompe a fila atual para iniciar outra resposta sem sobreposição. */
  reset() {
    for (const src of this.sources) {
      src.onended = null;
      try { src.stop(); } catch { /* fonte já encerrada */ }
      try { src.disconnect(); } catch { /* ignora */ }
    }
    this.sources.clear();
    this.nextT = 0;
    this.onPlaybackChange?.(false);
  }

  stop() {
    this.reset();
    this.ctx.suspend().catch(() => {});
  }

  resume() {
    this.ctx.resume().catch(() => {});
  }

  close() {
    this.reset();
    this.ctx.close().catch(() => {});
  }
}
