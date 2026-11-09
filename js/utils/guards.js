// ============================================================
// Guardas de geração (texto streamado) — puras e testáveis.
// Avaliam o estado do fluxo e retornam o motivo de violação,
// ou null se tudo estiver normal.
// ============================================================

import { detectRunaway } from './repeat.js';

export const STREAM_LIMITS = {
  stallMs: 60000,           // sem delta por 60s => geração parada
};

export function assessStreamState(text, { lastDeltaAt = 0, now = 0 } = {}) {
  if (detectRunaway(text)) return 'repeat';
  if (lastDeltaAt && now - lastDeltaAt > STREAM_LIMITS.stallMs) return 'stall';
  return null;
}

export const STREAM_VIOLATION_NOTES = {
  repeat: '(interrompido — repetição detectada)',
  stall: '(interrompido — geração parada sem resposta)',
};

export const STREAM_VIOLATION_TOASTS = {
  repeat: 'Repetição patológica detectada — geração interrompida automaticamente.',
  stall: 'A geração parou de responder — interrompida automaticamente.',
};
