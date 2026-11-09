// ============================================================
// Proteção contra geração descontrolada (repetição patológica).
// Detecta caudas de texto com um bloco repetido muitas vezes
// (ex.: "padapadapada..."), sem afetar respostas normais.
// ============================================================

const MIN_REPS = 6;
const MIN_PERIOD = 3;
const MAX_PERIOD = 40;

export function detectRunaway(text) {
  const t = String(text || '').trimEnd();
  if (t.length < 80) return null;

  for (let p = MIN_PERIOD; p <= MAX_PERIOD; p++) {
    if (t.length < p * (MIN_REPS + 1)) continue;

    const block = t.slice(-p);
    // Blocos de pontuação pura só contam se forem longos
    // (ex.: "......" repetido é suspeito, mas "..." final não).
    if (!/[a-z0-9]/i.test(block) && block.length < 5) continue;

    let reps = 0;
    for (let i = t.length - p; i >= 0 && reps < 24; i -= p) {
      if (t.slice(i, i + p) === block) reps++;
      else break;
    }
    if (reps >= MIN_REPS) return p;
  }
  return null;
}
