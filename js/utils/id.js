// ============================================================
// Gerador de identificadores de solicitação (para diagnóstico).
// ============================================================

export function newRequestId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID().slice(0, 8);
  } catch { /* ignora */ }
  return String(Date.now()).slice(-8) + Math.floor(Math.random() * 1000);
}
