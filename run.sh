#!/usr/bin/env bash
# ============================================================
# Omni Studio — serve a interface estática localmente.
# Uso: ./run.sh [porta]   (padrão: 5173)
# Requisitos: python3 (stdlib, nenhuma dependência extra)
# ============================================================
set -euo pipefail
PORT="${1:-5173}"
cd "$(dirname "$0")"

echo "────────────────────────────────────────────────────────────"
echo "  Omni Studio  →  http://127.0.0.1:${PORT}"
echo "  Servidor do modelo esperado em: http://127.0.0.1:8080"
echo "  (alterável em Configurações dentro da interface)"
echo "────────────────────────────────────────────────────────────"

if command -v xdg-open >/dev/null 2>&1; then
  (sleep 1; xdg-open "http://127.0.0.1:${PORT}" >/dev/null 2>&1 || true) &
fi

exec python3 -m http.server "$PORT" --bind 127.0.0.1
