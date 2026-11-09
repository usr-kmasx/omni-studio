import { markdownToSpeech } from '../js/utils/speech-text.js';
import { computeNPredict } from '../js/api/tts.js';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8080/tts';

function wavDurationSec(file) {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${file}`,
    { encoding: 'utf8' }
  ).trim();
  return parseFloat(out);
}

async function ttsReal(label, text) {
  const speech = markdownToSpeech(text);
  const nPredict = computeNPredict(speech);
  const body = JSON.stringify({ input: speech, voice: 'female', lang: 'pt', n_predict: nPredict });
  const t0 = Date.now();
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
    body,
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const ms = Date.now() - t0;
  const file = `/tmp/tts_new_${label}.wav`;
  writeFileSync(file, buf);
  const dur = wavDurationSec(file);
  const words = speech.trim().split(/\s+/).filter(Boolean).length;
  const truncated = dur >= (nPredict * 0.08) - 0.25;
  console.log(JSON.stringify({ label, words, nPredict, status: res.status, bytes: buf.length, durationSec: dur, truncated, elapsedMs: ms }, null, 1));
  return { dur, nPredict, truncated };
}

const curto = 'Bom dia, sejam bem-vindos.';
const medio = Array.from({ length: 100 }, (_, i) => 'palavra' + i).join(' ') + '. Frase final.';
const longo = [
  'The video is a simple 2D animated sequence set against a plain, light gray rectangular background with a thin gray border and a horizontal gray strip along the bottom edge.',
  'The only animated elements are two flat shapes: a solid red circle with a small white highlight dot and a soft gray drop shadow, and a solid blue square with a thin light gray horizontal line across its top and a dark blue outline.',
  'The red circle begins at the left side of the frame, then slides steadily to the right, passing directly above the blue square.',
  'The blue square drifts slightly upward and settles near the lower-right corner.',
  'The shapes remain static at the end of the clip and do not change size, color, or position.',
  'Overlaid on the scene is a male voice speaking in a slow, monotone, robotic manner, with each phrase appearing as a distinct spoken word.',
  'The narration is mostly unintelligible, sounding like synthetic syllables and fragments rather than coherent sentences.',
  'The video has a duration of about fourteen seconds and uses a single camera angle with no cuts.',
].join(' ');

await ttsReal('curto', curto);
await ttsReal('medio', medio);
await ttsReal('longo', longo);
