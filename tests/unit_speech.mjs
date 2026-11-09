import { markdownToSpeech, splitSpeechBlocks, countWords, concatWavBlobs } from '../js/utils/speech-text.js';
import { computeNPredict, requestTtsOnce, ttsSpeak } from '../js/api/tts.js';
import { encodeWav, wavDataUrl } from '../js/components/audio.js';

// ---------- markdownToSpeech ----------
const md = [
  '# Título Principal',
  '',
  'Este é um **texto em negrito** e *itálico* com `código` e ~~tachado~~.',
  '',
  'Lista:',
  '1. primeiro item',
  '2. segundo item',
  '- item com marcador',
  '',
  '> Uma citação importante.',
  '',
  'Veja [documentação oficial](https://example.com/docs).',
  '',
  '```js',
  'const x = 1;',
  '```',
].join('\n');

const out = markdownToSpeech(md);
if (out.includes('**') || out.includes('*') || out.includes('#') || out.includes('>') || out.includes('`')) {
  throw new Error('ainda contém marcadores: ' + out);
}
if (out.includes('https://example.com')) throw new Error('URL vazou');
if (!out.includes('documentação oficial')) throw new Error('link perdeu texto');
if (!out.includes('Título Principal')) throw new Error('título perdeu conteúdo');
if (!out.includes('texto em negrito')) throw new Error('negrito perdeu conteúdo');
if (!out.includes('primeiro item') || !out.includes('segundo item') || !out.includes('item com marcador')) throw new Error('lista perdeu itens');
if (!out.includes('Uma citação importante')) throw new Error('citação perdeu conteúdo');
if (!out.includes('const x = 1;')) throw new Error('bloco de código perdeu conteúdo');
const mat = markdownToSpeech('a * b e x_1 e 5 > 3 e #hashtag');
if (!mat.includes('a * b') || !mat.includes('x_1') || !mat.includes('5 > 3') || !mat.includes('#hashtag')) throw new Error('caracteres significativos removidos');
console.log('markdownToSpeech OK');

// ---------- computeNPredict ----------
if (computeNPredict('ola') !== 512) throw new Error('mínimo 512');
if (computeNPredict(' '.repeat(10)) !== 512) throw new Error('vazio -> mínimo');
if (computeNPredict(Array.from({ length: 184 }, (_, i) => 'palavra' + i).join(' ')) !== 1840) throw new Error('184 -> 1840');
if (computeNPredict(Array.from({ length: 2000 }, (_, i) => 'p' + i).join(' ')) !== 4096) throw new Error('teto 4096');
console.log('computeNPredict OK');

// ---------- splitSpeechBlocks ----------
const robo = (
  'The video is a simple 2D animated sequence set against a plain, light gray rectangular background with a thin gray border and a horizontal gray strip along the bottom edge. '
  + 'The only animated elements are two flat shapes: a solid red circle with a small white highlight dot and a soft gray drop shadow, and a solid blue square with a thin light gray horizontal line across its top and a dark blue outline. '
  + 'The red circle begins at the left side of the frame, then slides steadily to the right, passing directly above the blue square. '
  + 'The blue square drifts slightly upward and settles near the lower-right corner. '
  + 'The shapes remain static at the end of the clip and do not change size, color, or position. '
  + 'Overlaid on the scene is a male voice speaking in a slow, monotone, robotic manner, with each phrase appearing as a distinct spoken word. '
  + 'The narration is mostly unintelligible, sounding like synthetic syllables and fragments rather than coherent sentences. '
  + 'The video has a duration of about fourteen seconds and uses a single camera angle with no cuts.'
);

const tok = (t) => normalizeSpeech(t).split(/\s+/).filter(Boolean);
function normalizeSpeech(t) {
  return t.replace(/\s+/g, ' ').trim();
}

// texto curto não é dividido
const shortBlocks = splitSpeechBlocks('Bom dia, tudo bem?', 35);
if (shortBlocks.length !== 1) throw new Error('curto deveria gerar 1 bloco');
console.log('split: curto OK');

// identidade: palavras preservadas, sem duplicação/omissão, ordem mantida
const blocks = splitSpeechBlocks(robo, 35);
const rejoin = normalizeSpeech(blocks.join(' '));
const origWords = tok(robo);
const blockWords = tok(rejoin);
if (origWords.length !== blockWords.length) throw new Error(`perda/duplicação: ${origWords.length} vs ${blockWords.length}`);
for (let i = 0; i < origWords.length; i++) {
  if (origWords[i] !== blockWords[i]) throw new Error('ordem alterada na posição ' + i);
}
if (blocks.some((b) => countWords(b) > 35)) throw new Error('bloco excede 35 palavras');
if (blocks.length < 5) throw new Error('esperava ao menos 5 blocos p/ 184 palavras (' + blocks.length + ')');
console.log(`split: identidade OK (${blocks.length} blocos, ${origWords.length} palavras)`);

// frase única longa -> subdividida sem cortar palavra
const longSentence = 'palavra '.repeat(80).trim() + '.';
const lsBlocks = splitSpeechBlocks(longSentence, 35);
if (lsBlocks.some((b) => countWords(b) > 35)) throw new Error('frase longa não subdividida');
if (tok(lsBlocks.join(' ')).length !== tok(longSentence).length) throw new Error('frase longa perdeu palavras');
console.log('split: frase longa OK');

// pontuação preservada: a concatenação normalizada deve ser idêntica ao original
if (rejoin !== normalizeSpeech(robo)) throw new Error('pontuação/espaçamento alterado');
console.log('split: pontuação preservada OK');

// ---------- concatWavBlobs ----------
const rate = 24000;
const wavA = encodeWav(new Float32Array(rate * 0.5), rate); // 0.5s
const wavB = encodeWav(new Float32Array(rate * 0.25), rate); // 0.25s

const cat0 = concatWavBlobs([wavA, wavB], { pauseMs: 0 });
const cat150 = concatWavBlobs([wavA, wavB], { pauseMs: 150 });
const dur = (buf) => (buf.byteLength - 44) / (rate * 2);
if (Math.abs(dur(cat0) - 0.75) > 0.01) throw new Error('concat sem pausa: duração ' + dur(cat0));
if (Math.abs(dur(cat150) - (0.75 + 0.15)) > 0.01) throw new Error('concat com pausa: duração ' + dur(cat150));
const v = new DataView(cat150);
if (String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3)) !== 'RIFF') throw new Error('RIFF ausente');
if (v.getUint32(24, true) !== rate) throw new Error('sample rate alterado');
if (v.getUint16(22, true) !== 1) throw new Error('canais alterados');
if (v.getUint16(34, true) !== 16) throw new Error('bits alterados');
console.log('concat: headers/duração OK');

// mapeia o chunk data e confere ordem (primeiros bytes de cada trecho)
function dataRange(buf) {
  const dv = new DataView(buf);
  let off = 12;
  while (off + 8 <= dv.byteLength) {
    const id = String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3));
    if (id === 'data') return [off + 8, dv.getUint32(off + 4, true)];
    off += 8 + dv.getUint32(off + 4, true) + (dv.getUint32(off + 4, true) % 2);
  }
  return null;
}
const [startA] = dataRange(wavA);
const [startCat] = dataRange(cat0);
if (new DataView(wavA).getUint8(startA) !== new DataView(cat0).getUint8(startCat)) throw new Error('ordem de dados não preservada');
console.log('concat: ordem dos dados OK');

// formatos incompatíveis devem lançar erro
try {
  concatWavBlobs([wavA, encodeWav(new Float32Array(rate * 0.1), 16000)], { pauseMs: 0 });
  throw new Error('deveria lançar erro de formato');
} catch (e) {
  if (!String(e.message).includes('incompatíveis')) throw new Error('erro de formato ausente');
}
console.log('concat: incompatibilidade detectada OK');

// ---------- requestTtsOnce: corpo correto (sem override) ----------
let captured = null;
globalThis.fetch = async (url, opts) => {
  captured = { url: String(url), body: JSON.parse(opts.body) };
  const ab = new ArrayBuffer(4);
  new Uint8Array(ab).set([0x52, 0x49, 0x46, 0x46]);
  return { ok: true, status: 200, headers: { get: () => 'audio/wav' }, arrayBuffer: async () => ab };
};
await requestTtsOnce({ baseUrl: 'http://x', text: 'Olá, tudo bem?' });
if (captured.body.input !== 'Olá, tudo bem?') throw new Error('input errado');
if (captured.body.voice !== 'female' || 'lang' in captured.body) throw new Error('voice/default lang');
if (typeof captured.body.n_predict !== 'number') throw new Error('n_predict ausente');
if ('repeat_penalty' in captured.body) throw new Error('não deve enviar repeat_penalty');
console.log('requestTtsOnce: corpo OK (sem override)');

// ---------- fluxo de blocos: falha interrompe sequência ----------
const RIFF_OK = (() => {
  const ab = encodeWav(new Float32Array(rate * 0.1), rate);
  return ab;
})();
let ttsCalls = 0;
globalThis.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  ttsCalls++;
  if (String(body.input).includes('blue square')) {
    throw new TypeError('Failed to fetch'); // falha controlada no 2º bloco
  }
  return { ok: true, status: 200, headers: { get: () => 'audio/wav' }, arrayBuffer: async () => RIFF_OK };
};
let erroCapturado = null;
try {
  await ttsSpeak({ baseUrl: 'http://x', text: robo });
} catch (e) {
  erroCapturado = e;
}
if (!erroCapturado) throw new Error('deveria lançar erro na falha do bloco');
const mFail = /bloco (\d+)\/(\d+)/.exec(String(erroCapturado.message));
if (!mFail) throw new Error('mensagem sem bloco: ' + erroCapturado.message);
const blocoFalho = Number(mFail[1]);
const totalBlocos = Number(mFail[2]);
if (ttsCalls !== blocoFalho) throw new Error(`falha deveria interromper após o bloco ${blocoFalho} (chamadas=${ttsCalls})`);
if (blocoFalho < 1 || blocoFalho >= totalBlocos) throw new Error('índice de bloco inválido');
console.log(`blocos: falha interrompe sequência OK (bloco ${blocoFalho}/${totalBlocos}, ${ttsCalls} chamadas)`);

// ---------- fluxo de blocos: cancelamento ----------
ttsCalls = 0;
const ac = new AbortController();
const successFetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  ttsCalls++;
  if (ttsCalls === 2) ac.abort(); // cancela durante a 2ª requisição
  return { ok: true, status: 200, headers: { get: () => 'audio/wav' }, arrayBuffer: async () => RIFF_OK };
};
globalThis.fetch = successFetch;
let abortErro = null;
try {
  await ttsSpeak({ baseUrl: 'http://x', text: robo, signal: ac.signal });
} catch (e) {
  abortErro = e;
}
if (!abortErro) throw new Error('deveria abortar');
if (abortErro.kind !== 'abort') throw new Error('tipo de erro: ' + abortErro.kind);
if (ttsCalls >= 4) throw new Error('cancelamento deveria parar de enviar blocos (chamadas=' + ttsCalls + ')');
console.log('blocos: cancelamento entre blocos OK (' + ttsCalls + ' chamadas)');

// ---------- WAV real via wavDataUrl não necessário; fim ----------
console.log('=== UNIT TESTES OK ===');
