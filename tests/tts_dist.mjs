import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8080/tts';
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

function dur(file) {
  const out = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${file}`, { encoding: 'utf8' }).trim();
  return parseFloat(out);
}

async function run(label, repeatPenalty, n = 1200) {
  const body = { input: robo, voice: 'female', lang: 'pt', n_predict: n };
  if (repeatPenalty !== undefined) body.repeat_penalty = repeatPenalty;
  const res = await fetch(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const buf = Buffer.from(await res.arrayBuffer());
  const f = `/tmp/dist_${label}.wav`;
  writeFileSync(f, buf);
  return dur(f);
}

console.log('distribuição sem seed, n=1200 (max=96s), texto robótico 184p');
for (const rp of [undefined, 1.2]) {
  const runs = [];
  for (let i = 1; i <= 3; i++) {
    const d = await run(`rp${rp ?? 'default'}_${i}`, rp);
    runs.push(d);
    console.log(`  rp=${rp ?? 'default'} run${i}: ${d.toFixed(2)}s ${d >= 95.75 ? '(TETO)' : ''}`);
  }
  console.log(`  rp=${rp ?? 'default'} -> ${runs.map((x) => x.toFixed(1)).join(', ')}`);
}
