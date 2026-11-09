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

async function tts(label, text, { nPredict, repeatPenalty, seed = 42 } = {}) {
  const speech = markdownToSpeech(text);
  const body = { input: speech, voice: 'female', lang: 'pt', n_predict: nPredict, seed };
  if (repeatPenalty !== undefined) body.repeat_penalty = repeatPenalty;

  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
    body: JSON.stringify(body),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const file = `/tmp/tts_cmp_${label}.wav`;
  writeFileSync(file, buf);
  const dur = wavDurationSec(file);
  const maxDur = (nPredict * 0.08);
  const truncated = dur >= maxDur - 0.25;
  console.log(
    `${label.padEnd(28)} | palavras=${speech.trim().split(/\s+/).filter(Boolean).length}` +
    ` | n=${nPredict} | rp=${repeatPenalty ?? 'default(1.05)'}` +
    ` | status=${res.status} | duração=${dur.toFixed(2)}s | max=${maxDur.toFixed(2)}s | truncado=${truncated}`
  );
  return { dur, truncated };
}

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

const natural = (
  'A inteligência artificial é um campo da ciência da computação que busca criar sistemas capazes de realizar tarefas que normalmente exigiriam inteligência humana. '
  + 'Isso inclui aprendizado, raciocínio, percepção e compreensão de linguagem natural. '
  + 'Os primeiros estudos sobre inteligência artificial começaram na década de 1950, com pesquisadores como Alan Turing propondo testes para avaliar a capacidade de máquinas de simular o pensamento humano. '
  + 'Desde então, o campo evoluiu muito, passando por períodos de grande otimismo e também por invernos de financiamento. '
  + 'Nos anos 2000, o avanço das redes neurais profundas, impulsionado pelo aumento da capacidade computacional e pela disponibilidade de grandes volumes de dados, trouxe progressos significativos em áreas como visão computacional, reconhecimento de fala e tradução automática. '
  + 'Hoje, a inteligência artificial está presente em muitos aspectos do nosso dia a dia, desde assistentes virtuais em smartphones até sistemas de recomendação em plataformas de streaming e mecanismos de busca. '
  + 'Também é utilizada em áreas críticas como medicina, para auxiliar no diagnóstico de doenças; finanças, para detectar fraudes; e transporte, para desenvolver veículos autônomos. '
  + 'Entretanto, o uso da inteligência artificial também levanta questões éticas importantes, como privacidade, viés algorítmico, impacto no emprego e a necessidade de transparência nas decisões tomadas por sistemas automáticos. '
  + 'A comunidade científica e os órgãos reguladores discutem formas de garantir que essas tecnologias sejam desenvolvidas e utilizadas de maneira responsável. '
  + 'O futuro da inteligência artificial dependerá da nossa capacidade de equilibrar inovação com ética, colaboração global e atenção aos impactos sociais. '
  + 'A pesquisa continua avançando em direção a modelos mais eficientes, interpretáveis e alinhados com os valores humanos.'
);

console.log('=== A) curto (sem override) ===');
await tts('A_curto', 'Bom dia, sejam bem-vindos.', { nPredict: 512 });

console.log('=== B) médio natural 99p (sem override) ===');
const medio = natural.split(' ').slice(0, 99).join(' ');
await tts('B_medio', medio, { nPredict: 990 });

console.log('=== C) robótico 184p n=2000: 1.05 vs 1.2 ===');
await tts('C_robo_105', robo, { nPredict: 2000, repeatPenalty: 1.05 });
await tts('C_robo_12', robo, { nPredict: 2000, repeatPenalty: 1.2 });

console.log('=== D) natural 260p n=2000: 1.05 vs 1.2 ===');
await tts('D_nat_105', natural, { nPredict: 2000, repeatPenalty: 1.05 });
await tts('D_nat_12', natural, { nPredict: 2000, repeatPenalty: 1.2 });

console.log('=== E) robótico 184p com a REGRA do app (n=1840, sem override) ===');
const nE = computeNPredict(robo);
await tts('E_robo_regra', robo, { nPredict: nE });
console.log('n_predict aplicado (regra atual, sem repeat_penalty)=' + nE);
