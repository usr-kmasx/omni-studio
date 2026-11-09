import { ttsSpeak, requestTtsOnce, computeNPredict } from '../js/api/tts.js';
import { markdownToSpeech, splitSpeechBlocks, countWords } from '../js/utils/speech-text.js';
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BASE = 'http://127.0.0.1:8080';

function wavDurationSec(buf) {
  const file = `/tmp/hibrido_${Date.now()}_${Math.floor(Math.random() * 1e4)}.wav`;
  writeFileSync(file, Buffer.from(buf));
  const d = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${file}`, { encoding: 'utf8' }).trim());
  return { d, file };
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
  + 'Nos anos 2000, o avanço das redes neurais profundas trouxe progressos significativos em áreas como visão computacional, reconhecimento de fala e tradução automática. '
  + 'Hoje, a inteligência artificial está presente em muitos aspectos do nosso dia a dia, desde assistentes virtuais em smartphones até sistemas de recomendação. '
  + 'Também é utilizada em áreas críticas como medicina, finanças e transporte. '
  + 'Entretanto, o uso também levanta questões éticas importantes, como privacidade, viés algorítmico e impacto no emprego. '
  + 'O futuro dependerá da nossa capacidade de equilibrar inovação com ética. '
  + 'A pesquisa continua avançando em direção a modelos mais eficientes, interpretáveis e alinhados com os valores humanos.'
);

const markdown = [
  '# Relatório Sintético',
  '',
  'Este é um **resumo** com *ênfase* e uma `variável`.',
  '',
  'Lista numerada:',
  '1. primeiro ponto',
  '2. segundo ponto',
  '',
  'Citação: > a verdade está lá fora.',
  '',
  'Veja a [documentação](https://example.com).',
].join('\n');

console.log('=== A) curto (4p) — esperado: 1 requisição ===');
{
  const r = await ttsSpeak({ baseUrl: BASE, text: 'Bom dia, sejam bem-vindos.' });
  console.log('estratégia:', r.meta.strategy, '| duração:', r.meta.durationSec, 's | truncated:', r.meta.truncated);
  const { d } = wavDurationSec(r.buffer);
  console.log('ffprobe:', d, 's');
}

console.log('=== B) médio (99p) — esperado: 1 requisição ===');
{
  const texto = natural.split(' ').slice(0, 99).join(' ');
  const r = await ttsSpeak({ baseUrl: BASE, text: texto });
  console.log('estratégia:', r.meta.strategy, '| duração:', r.meta.durationSec, 's | truncated:', r.meta.truncated);
}

console.log('=== C) robótico 184p — esperado: blocos ===');
for (let run = 1; run <= 2; run++) {
  const r = await ttsSpeak({ baseUrl: BASE, text: robo });
  const { d } = wavDurationSec(r.buffer);
  console.log(`run ${run}: estratégia=${r.meta.strategy} blocos=${r.meta.blocks} | palavras por bloco=${r.meta.blockWords} | durações=${r.meta.durations} | truncated=${r.meta.truncated} | total meta=${r.meta.totalDurationSec}s | ffprobe=${d}s`);
}

console.log('=== D) natural 260p — esperado: blocos ===');
{
  const r = await ttsSpeak({ baseUrl: BASE, text: natural });
  const { d } = wavDurationSec(r.buffer);
  console.log('estratégia:', r.meta.strategy, '| blocos:', r.meta.blocks, '| total meta:', r.meta.totalDurationSec, 's | ffprobe:', d, 's | truncated:', r.meta.truncated);
}

console.log('=== E) markdown — esperado: normalização antes da segmentação ===');
{
  const speech = markdownToSpeech(markdown);
  const r = await ttsSpeak({ baseUrl: BASE, text: markdown });
  console.log('palavras normalizadas:', countWords(speech), '| estratégia:', r.meta.strategy, '| duração:', r.meta.durationSec ?? r.meta.totalDurationSec, 's');
}

console.log('=== CALIBRAÇÃO: bloco a bloco (robo, n_predict por bloco) ===');
for (const maxWords of [35, 30, 25]) {
  const blocks = splitSpeechBlocks(markdownToSpeech(robo), maxWords);
  let truncados = 0;
  const durations = [];
  for (const b of blocks) {
    const r = await requestTtsOnce({ baseUrl: BASE, text: b });
    if (r.meta.truncated) truncados++;
    durations.push(r.meta.durationSec);
  }
  console.log(`maxWords=${maxWords}: blocos=${blocks.length} truncados=${truncados} durações=${durations}`);
}
