import { streamChatCompletion, conversationToMessages } from '../js/api/chat.js';
import { renderMarkdown } from '../js/utils/md.js';
import { markdownToSpeech } from '../js/utils/speech-text.js';
import { computeNPredict } from '../js/api/tts.js';
import { encodeWav, wavDataUrl, resampleLinear } from '../js/components/audio.js';
import { asrLanguageName } from '../js/config.js';
import { createVad, pcmFromB64 } from '../js/components/voice.js';
import { detectRunaway } from '../js/utils/repeat.js';
import { assessStreamState } from '../js/utils/guards.js';

function sseStream(lines, finish) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      (async () => {
        for (const l of lines) { c.enqueue(enc.encode(l + '\n')); await new Promise((r) => setTimeout(r, 5)); }
        c.enqueue(enc.encode('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }] }) + '\n'));
        c.enqueue(enc.encode('data: [DONE]\n'));
        c.close();
      })();
    },
  });
}

globalThis.fetch = async () => ({
  ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({}),
  body: sseStream([
    'data: {"choices":[{"delta":{"content":"Olá, "}}]}',
    'data: {"choices":[{"delta":{"content":"mundo!"}}]}',
  ], 'length'),
});

const { text, finishReason } = await streamChatCompletion({ baseUrl: 'http://x', messages: [], onDelta: () => {} });
if (text !== 'Olá, mundo!') throw new Error('SSE: ' + JSON.stringify(text));
if (finishReason !== 'length') throw new Error('finishReason: ' + finishReason);

const parts = conversationToMessages(
  [
    { role: 'user', text: 'q', media: [{ kind: 'image', dataUrl: 'data:image/jpeg;base64,AAAA' }, { kind: 'audio', base64: 'QUFB' }, { kind: 'video', base64: 'QkJCAg==' }] },
    { role: 'assistant', text: '', media: [], inFlight: true },
  ],
  { system: 'sys' }
)[1].content;
if (parts.length !== 4 || parts[1].type !== 'image_url' || parts[2].type !== 'input_audio' || parts[3].type !== 'input_video') throw new Error('multimodal');
if (markdownToSpeech('**x** e _y_ e [z](http://a)') !== 'x e y e z') throw new Error('md');
if (computeNPredict('a b c d') !== 512) throw new Error('np');

const { RealtimeSession } = await import('../js/api/realtime.js');
const s = new RealtimeSession({ baseUrl: 'http://x' });
let sent = [];
s.ws = { readyState: 1, send: (x) => sent.push(JSON.parse(x)) };
s.appendAudio(new Int16Array([1, -2, 300]));
const dec = new Int16Array(Uint8Array.from(atob(sent[0].audio), (c) => c.charCodeAt(0)).buffer);
if (dec[0] !== 1 || dec[1] !== -2 || dec[2] !== 300) throw new Error('rt b64');

const vadEvents = [];
let micVadOptions;
const micVad = {
  listening: false,
  async start() { this.listening = true; },
  async pause() { this.listening = false; },
};
const sileroVad = await createVad({
  factory: {
    async new(options) {
      micVadOptions = options;
      return micVad;
    },
  },
  onFrameProcessed: (probabilities, frame) => vadEvents.push(['frame', probabilities.isSpeech, frame.length]),
  onSpeechChange: (speaking) => vadEvents.push(['change', speaking]),
  onSpeechAccepted: () => vadEvents.push(['accepted']),
  onUtterance: (audio) => vadEvents.push(['utterance', audio.length]),
  onNoise: () => vadEvents.push(['noise']),
});
if (micVadOptions.model !== 'v6' || micVadOptions.startOnLoad !== false) throw new Error('silero-model-config');
await sileroVad.start();
micVadOptions.onFrameProcessed({ isSpeech: 0.8, notSpeech: 0.2 }, new Float32Array(512));
micVadOptions.onSpeechStart();
micVadOptions.onSpeechRealStart();
micVadOptions.onSpeechEnd(new Float32Array(2048));
micVadOptions.onVADMisfire();
await sileroVad.pause();
if (vadEvents[0]?.[0] !== 'frame' || vadEvents.at(-1)?.[0] !== 'noise') throw new Error('silero-callback-forwarding');
if (!vadEvents.some(([kind]) => kind === 'accepted') || !vadEvents.some(([kind, size]) => kind === 'utterance' && size === 2048)) throw new Error('silero-speech-events');
if (micVad.listening) throw new Error('silero-pause');

if (pcmFromB64(btoa(String.fromCharCode(1, 0, 254, 255)))[1] !== -2) throw new Error('pcm');

const md = renderMarkdown('# t\n\n**b** `c`\n\n- i\n\n```js\nx\n```\n> q');
if (!md.includes('<h1>') || !md.includes('<strong>') || !md.includes('<ul>') || !md.includes('md-code') || !md.includes('<blockquote>')) throw new Error('md');
if (new DataView(encodeWav(new Float32Array(100), 24000)).getUint32(0, true) !== 0x46464952) throw new Error('wav');
if (!wavDataUrl(new Float32Array(10), 24000).startsWith('data:audio/wav;base64,')) throw new Error('wav url');
if (resampleLinear(new Float32Array([0, 1]), 48000, 24000).length !== 1) throw new Error('rs');
if (asrLanguageName('pt') !== 'Portuguese') throw new Error('asr');
if (detectRunaway('umamolapada'.repeat(12)) === null) throw new Error('runaway');
const now = 1e5;
if (assessStreamState('umamolapada'.repeat(12), { lastDeltaAt: now, startAt: now - 1000, now }) !== 'repeat') throw new Error('guard');

console.log('=== REGRESSÃO COMPLETA OK ===');
