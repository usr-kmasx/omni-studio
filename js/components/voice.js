// ============================================================
// Modo de voz em tempo real — suporte:
//  - VAD (detecção de fala) para escuta contínua
//  - decode de chunks PCM16 base64 do protocolo Realtime
// (A reprodução ao vivo usa PcmPlayer direto no app.js,
//  sem elementos visuais/barra inferior.)
// ============================================================

/** Cria o VAD Silero v6 executado localmente no navegador via ONNX Runtime Web. */
export async function createVad({
  factory = globalThis.vad?.MicVAD,
  onFrameProcessed,
  onUtterance,
  onNoise,
  onSpeechAccepted,
  onSpeechChange,
} = {}) {
  if (!factory?.new) throw new Error('O VAD Silero não foi carregado.');

  const assetBasePath = new URL('../../vendor/voice-vad/', import.meta.url).href;
  if (globalThis.ort?.env?.wasm) {
    globalThis.ort.env.wasm.wasmPaths = assetBasePath;
    globalThis.ort.env.wasm.numThreads = 1;
  }

  const micVad = await factory.new({
    model: 'v6',
    startOnLoad: false,
    baseAssetPath: assetBasePath,
    onnxWASMBasePath: assetBasePath,
    positiveSpeechThreshold: 0.35,
    negativeSpeechThreshold: 0.25,
    minSpeechMs: 350,
    redemptionMs: 650,
    preSpeechPadMs: 320,
    onFrameProcessed,
    onSpeechStart: () => onSpeechChange?.(true),
    onSpeechRealStart: () => onSpeechAccepted?.(),
    onSpeechEnd: (audio) => {
      onSpeechChange?.(false);
      onUtterance?.(audio);
    },
    onVADMisfire: () => {
      onSpeechChange?.(false);
      onNoise?.();
    },
  });

  return {
    start: () => micVad.start(),
    pause: () => micVad.pause(),
    get listening() { return micVad.listening; },
  };
}

/** Decodifica um delta de áudio base64 (PCM16 mono) em Int16Array. */
export function pcmFromB64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}
