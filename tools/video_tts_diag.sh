#!/usr/bin/env bash
# ============================================================
# Diagnóstico isolado do backend (llama cli) — vídeos com/sem
# trilha sonora, para distinguir problema do servidor vs. do
# frontend (Omni Studio).
#
# O binário `llama` desta instalação exige SUBCOMANDO:
#   llama cli -m <modelo> -mm <projetor> --video <arquivo> ...
#
# Uso:
#   ./tools/video_tts_diag.sh <video.mp4> [video_sem_audio.mp4]
#
# Env (padrões sensatos):
#   LLAMA_CLI=llama
#   LLAMA_MODEL=/caminho/para/modelos/LFM3-Omni-2B-Q8_0.gguf
#   LLAMA_MMPROJ=/caminho/para/modelos/mmproj-LFM3-Omni-2B-Q8_0.gguf
#   LLAMA_FPS=4            (--video-fps)
#   PREDICT=512            (-n / --predict; teto de segurança)
#   INF_TIMEOUT=90         (segundos por inferência; 124 = timeout)
#
# Saída: Ctrl+C encerra apenas os processos filhos DESTE script
# (grupo próprio criado com setsid), sem afetar o llama serve.
# ============================================================
set -uo pipefail

LLAMA_CLI="${LLAMA_CLI:-llama}"
LLAMA_MODEL="${LLAMA_MODEL:-}"
LLAMA_MMPROJ="${LLAMA_MMPROJ:-}"
LLAMA_FPS="${LLAMA_FPS:-4}"
PREDICT="${PREDICT:-512}"
INF_TIMEOUT="${INF_TIMEOUT:-90}"
VIDEO="${1:-}"
VIDEO_SILENT="${2:-}"

if [[ -z "$VIDEO" || -z "$LLAMA_MODEL" || -z "$LLAMA_MMPROJ" ]]; then
  echo "Uso: $0 <video.mp4> [video_sem_audio.mp4]" >&2
  echo "Defina LLAMA_MODEL e LLAMA_MMPROJ (ou env)." >&2
  exit 2
fi

# --- pré-requisitos -------------------------------------------------------
if ! command -v "$LLAMA_CLI" >/dev/null 2>&1; then
  echo "Faltando: $LLAMA_CLI" >&2
  exit 2
fi
if ! "$LLAMA_CLI" cli --help >/dev/null 2>&1; then
  echo "O binário $LLAMA_CLI não aceita o subcomando 'cli'." >&2
  exit 2
fi
for bin in ffprobe ffmpeg; do
  command -v "$bin" >/dev/null 2>&1 || { echo "Faltando: $bin" >&2; exit 2; }
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
AUDIO_EXTRACTED="$TMP/video_audio.wav"

# --- encerramento seguro apenas dos filhos deste script -------------------
declare -a CHILD_GROUPS=()
cleanup_children() {
  echo && echo "Encerrando processos filhos deste diagnóstico (grupos ${CHILD_GROUPS[*]:-nenhum}) ..."
  for g in "${CHILD_GROUPS[@]}"; do
    kill -TERM -- -"$g" 2>/dev/null || true
  done
}
trap 'cleanup_children; exit 130' INT TERM

# --- conflito com llama serve ---------------------------------------------
if pgrep -af "llama serve" >/dev/null 2>&1; then
  echo "⚠  AVISO: um 'llama serve' está ativo. O diagnóstico CLI usa GPU/CPU"
  echo "   concorrentemente — pode ficar lento ou falhar por memória."
  echo "   Se isso ocorrer, encerre o servidor antes de executar."
fi

echo "════════════════════════════════════════════════════════"
echo " DIAGNÓSTICO DE VÍDEO (llama cli)"
echo " vídeo:      $VIDEO"
echo " vídeo mudo: ${VIDEO_SILENT:-<não informado>}"
echo " modelo:      $LLAMA_MODEL"
echo " mmproj:     $LLAMA_MMPROJ"
echo " --video-fps: $LLAMA_FPS | -n: $PREDICT | timeout: ${INF_TIMEOUT}s"
echo "════════════════════════════════════════════════════════"

echo && echo "── 0) VERSÃO DO WRAPPER E DO CLIENTE ───────────"
"$LLAMA_CLI" version 2>&1 | head -5 || true
"$LLAMA_CLI" cli --version 2>&1 | head -5 || true

echo && echo "── 1) SPECTROS DO VÍDEO (ffprobe) ──────────────"
ffprobe -v error -show_streams -show_format "$VIDEO" \
  | grep -E "codec_name|sample_rate|channels|duration|bit_rate" | head -20

echo && echo "── 2) EXTRAÇÃO DO ÁUDIO (ffmpeg → WAV 24kHz mono) ──"
if ffmpeg -y -v error -i "$VIDEO" -vn -ac 1 -ar 24000 -c:a pcm_s16le "$AUDIO_EXTRACTED"; then
  echo "extraído: $AUDIO_EXTRACTED"
  ffprobe -v error -show_streams "$AUDIO_EXTRACTED" | grep -E "codec_name|sample_rate|channels|duration"
else
  echo "(vídeo sem trilha sonora extraível? — o teste de áudio isolado será pulado)"
fi

SYS="Answer questions about the video using what you see and hear. Do not transcribe or repeat unintelligible speech; describe the visuals and summarize the audio in general terms. Do not transcribe or repeat unintelligible speech; describe the visuals and summarize the audio in general terms."
PROMPT="What happens here, and what can you hear?"
RUN_ID=0

detect_repetition() {
  local file="$1" label="$2"
  [[ -s "$file" ]] || { echo "repetição [$label]: (sem saída para analisar)"; return; }
  local sus
  sus="$(
    tr ' ' '\n' < "$file" \
      | uniq -c \
      | awk '$1 >= 6 && length($2) >= 4 { print "  SUSPEITO: \"" $2 "\" repetida " $1 "x"; found=1 } END { if (!found) print "  (nenhuma repetição óbvia detectada)" }'
  )"
  echo "repetição [$label]: $sus"
}

# executa um comando em grupo próprio (setsid), com progresso e
# captura separada de stdout/stderr. Retorna o código de saída real.
run_inference() {
  RUN_ID=$((RUN_ID+1))
  local label="$1"; shift
  local out="$TMP/out_${RUN_ID}.txt"
  local err="$TMP/err_${RUN_ID}.txt"
  local cmd=(timeout "$INF_TIMEOUT" "$LLAMA_CLI" cli "$@" -sys "$SYS" -p "$PROMPT" --temp 0 -n "$PREDICT")

  echo && echo "── $((RUN_ID+2)) INFERÊNCIA [$label] ─────────────────"
  echo "comando: ${cmd[*]}"

  setsid "${cmd[@]}" >"$out" 2>"$err" &
  local pid=$!
  CHILD_GROUPS+=("$pid")

  # progresso: pontinhos a cada 2s enquanto o processo estiver vivo
  local elapsed=0
  while kill -0 "$pid" 2>/dev/null; do
    printf '.'; sleep 2; elapsed=$((elapsed+2))
  done
  printf ' (fim em %ss)\n' "$elapsed"

  wait "$pid"
  local code=$?

  if [[ $code -eq 124 ]]; then
    echo "exit: 124 → LIMITE DE TEMPO ATINGIDO (timeout ${INF_TIMEOUT}s); não é erro de execução."
    echo "── stdout (últimas 400 chars) ──"
    tail -c 400 "$out" || true
    echo && echo "── stderr (últimas 400 chars) ──"
    tail -c 400 "$err" || true
    echo
    detect_repetition "$out" "$label"
    return
  fi

  if [[ $code -ne 0 ]]; then
    echo "exit: $code → erro de execução (inferência pode NÃO ter iniciado)."
    echo "── stderr (últimas 600 chars) ──"
    tail -c 600 "$err" || true
    echo
    [[ -s "$out" ]] && { echo "── stdout (últimas 400 chars) ──"; tail -c 400 "$out" || true; echo; }
    return
  fi

  echo "exit: 0 (terminou normalmente)"
  echo "── stdout (últimas 400 chars) ──"
  tail -c 400 "$out" || true
  echo
  detect_repetition "$out" "$label"
}

echo && echo "── 3) VÍDEO COMPLETO (frames + trilha sonora) ──"
run_inference "vídeo com áudio" -m "$LLAMA_MODEL" -mm "$LLAMA_MMPROJ" --video "$VIDEO" --video-fps "$LLAMA_FPS"

if [[ -n "$VIDEO_SILENT" && -f "$VIDEO_SILENT" ]]; then
  echo && echo "── 4) VÍDEO SEM ÁUDIO (frames apenas) ───────────"
  run_inference "vídeo sem áudio" -m "$LLAMA_MODEL" -mm "$LLAMA_MMPROJ" --video "$VIDEO_SILENT" --video-fps "$LLAMA_FPS"
fi

if [[ -f "$AUDIO_EXTRACTED" ]]; then
  echo && echo "── 5) ÁUDIO ISOLADO (ASR via prompt do modelo) ──"
  RUN_ID=$((RUN_ID+1))
  out="$TMP/out_${RUN_ID}.txt"
  err="$TMP/err_${RUN_ID}.txt"
  cmd=(timeout "$INF_TIMEOUT" "$LLAMA_CLI" cli -m "$LLAMA_MODEL" -mm "$LLAMA_MMPROJ" \
        --audio "$AUDIO_EXTRACTED" -sys "Perform ASR in Portuguese." -p "<__media__>" --temp 0 -n "$PREDICT")
  echo "comando: ${cmd[*]}"
  setsid "${cmd[@]}" >"$out" 2>"$err" &
  pid=$!
  CHILD_GROUPS+=("$pid")
  elapsed=0
  while kill -0 "$pid" 2>/dev/null; do printf '.'; sleep 2; elapsed=$((elapsed+2)); done
  printf ' (fim em %ss)\n' "$elapsed"
  wait "$pid"
  code=$?
  if [[ $code -eq 124 ]]; then
    echo "exit: 124 → TIMEOUT."
  elif [[ $code -ne 0 ]]; then
    echo "exit: $code → erro de execução."
    echo "── stderr ──"; tail -c 600 "$err" || true; echo
  else
    echo "exit: 0"
  fi
  echo "── trecho da transcrição (stdout) ──"
  tail -c 400 "$out" || true
  echo
  detect_repetition "$out" "áudio isolado"
fi

echo && echo "════════════════════════════════════════════════════════"
echo " Interpretação:"
echo " • 124 = atingiu o limite de tempo (provável loop/geração longa)."
echo " • exit≠0 = erro de inicialização; veja o stderr acima."
echo " • Se o loop aparecer AQUI → problema do backend/versão do llama.cpp."
echo " • Se NÃO aparecer aqui, mas aparecer no site → problema da integração web."
echo " • Compare 3 (com áudio) e 4 (sem áudio): se 3 entrar em loop e 4"
echo "   não, a trilha sonora é o gatilho no caminho do backend."
echo
echo " Comandos de reprodução manual:"
echo "  1) vídeo com áudio:"
echo "     timeout $INF_TIMEOUT $LLAMA_CLI cli -m \"$LLAMA_MODEL\" -mm \"$LLAMA_MMPROJ\" \\"
echo "       --video \"$VIDEO\" --video-fps $LLAMA_FPS \\"
echo "       -sys \"Answer questions about the video using what you see and hear. Do not transcribe or repeat unintelligible speech; describe the visuals and summarize the audio in general terms.\" \\"
echo "       -p \"What happens here, and what can you hear?\" --temp 0 -n $PREDICT"
if [[ -n "$VIDEO_SILENT" && -f "$VIDEO_SILENT" ]]; then
echo "  2) vídeo sem áudio:"
echo "     timeout $INF_TIMEOUT $LLAMA_CLI cli -m \"$LLAMA_MODEL\" -mm \"$LLAMA_MMPROJ\" \\"
echo "       --video \"$VIDEO_SILENT\" --video-fps $LLAMA_FPS \\"
echo "       -sys \"Answer questions about the video using what you see and hear. Do not transcribe or repeat unintelligible speech; describe the visuals and summarize the audio in general terms.\" \\"
echo "       -p \"What happens here, and what can you hear?\" --temp 0 -n $PREDICT"
fi
if [[ -f "$AUDIO_EXTRACTED" ]]; then
echo "  3) áudio isolado (ASR):"
echo "     timeout $INF_TIMEOUT $LLAMA_CLI cli -m \"$LLAMA_MODEL\" -mm \"$LLAMA_MMPROJ\" \\"
echo "       --audio \"$AUDIO_EXTRACTED\" \\"
echo "       -sys \"Perform ASR in Portuguese.\" -p \"<__media__>\" --temp 0 -n $PREDICT"
fi
echo "════════════════════════════════════════════════════════"
