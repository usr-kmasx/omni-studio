// ============================================================
// Normalização de texto para síntese de voz (TTS).
// Converte uma resposta Markdown em texto falável, preservando
// o conteúdo semântico e sem verbalizar marcadores de formatação.
// NÃO altera o texto exibido/histórico (a mensagem original
// permanece intacta).
// ============================================================

/**
 * Remove blocos de código cercados (```...```), mantendo o conteúdo
 * textual (sem os delimitadores nem a etiqueta de linguagem).
 */
function extractCodeBlocks(src) {
  return src.replace(/```(\w*)[ \t]*\n([\s\S]*?)```/g, (_m, _lang, code) => {
    return `\n${code.trim()}\n`;
  });
}

/**
 * Markdown → texto falável.
 * Regras aplicadas (conservadoras — só removem marcadores quando há
 * delimitação coerente, preservando `*`, `_`, `#`, etc. com significado
 * real no texto):
 *  - links: [texto](url) → texto
 *  - negrito **x**, itálico *x* / _x_, tachado ~~x~~, código inline `x` → x
 *  - títulos "# x" → x
 *  - listas "- x", "* x", "+ x", "1. x", "1) x" → x
 *  - citações "> x" → x
 *  - quebras de linha múltiplas → uma única
 *  - espaços múltiplos dentro de uma linha → um único
 */
export function markdownToSpeech(src) {
  if (!src) return '';
  let s = String(src).replace(/\r\n?/g, '\n');

  // blocos de código primeiro (conteúdo preservado, sem delimitadores)
  s = extractCodeBlocks(s);

  // links: preserva apenas o texto descritivo
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  // forte / itálico / tachado / código inline
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '$1');
  s = s.replace(/(^|[^\w*])\*([^*\n]+?)\*(?!\*)/g, '$1$2');
  s = s.replace(/(^|[^\w_])_([^_\n]+?)_(?!\w)/g, '$1$2');
  s = s.replace(/~~([^~\n]+)~~/g, '$1');
  s = s.replace(/`([^`\n]+)`/g, '$1');

  const lines = s.split('\n').map((line) => {
    let l = line;
    // títulos: remove os '#', mantém o texto
    l = l.replace(/^[ \t]*#{1,6}[ \t]+/, '');
    // listas: marcadores
    l = l.replace(/^[ \t]*[-*+][ \t]+/, '');
    l = l.replace(/^[ \t]*\d+[.)][ \t]+/, '');
    // citações
    l = l.replace(/^[ \t]*>[ \t]?/, '');
    // espaços múltiplos dentro da linha
    l = l.replace(/[ \t]{2,}/g, ' ');
    return l.trim();
  });

  // remove linhas vazias redundantes (no máximo 1 vazia consecutiva)
  const out = [];
  for (const line of lines) {
    if (!line && out.length && out[out.length - 1] === '') continue;
    out.push(line);
  }
  // remove vazias do início/fim
  while (out.length && out[0] === '') out.shift();
  while (out.length && out[out.length - 1] === '') out.pop();

  return out.join('\n');
}

// ============================================================
// Segmentação para síntese por blocos (TTS longo)
// ============================================================

/** Conta palavras reais (ignora tokens sem letras/números). */
export function countWords(text) {
  return String(text || '')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

/**
 * Divide uma unidade longa em partes de no máximo `maxWords` palavras,
 * respeitando a hierarquia: sentença → cláusula → palavra.
 * Nunca corta uma palavra, nunca duplica, e preserva a pontuação.
 */
function splitLongUnit(unit, maxWords) {
  if (countWords(unit) <= maxWords) return [unit];

  const parts = [];
  const bySentence = unit.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  for (const sentence of bySentence) {
    if (countWords(sentence) <= maxWords) {
      parts.push(sentence);
      continue;
    }
    const byClause = sentence.split(/(?<=[;,])\s+/).filter((s) => s.trim());
    for (const clause of byClause) {
      if (countWords(clause) <= maxWords) {
        parts.push(clause);
        continue;
      }
      // último recurso: fronteira entre palavras
      const ws = clause.split(/\s+/).filter(Boolean);
      let cur = [];
      for (const w of ws) {
        cur.push(w);
        if (cur.length >= maxWords) {
          parts.push(cur.join(' '));
          cur = [];
        }
      }
      if (cur.length) parts.push(cur.join(' '));
    }
  }
  return parts;
}

/**
 * Divide o texto normalizado para fala em blocos semânticos determinísticos.
 * - Preserva a ordem original e toda a pontuação.
 * - Cada bloco tem no máximo `maxWords` palavras.
 * - Evita blocos com uma ou duas palavras (funde excedentes pequenos).
 */
export function splitSpeechBlocks(text, maxWords = 35) {
  const src = String(text || '');
  if (!src.trim()) return [];

  const paragraphs = src.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const blocks = [];
  let unfinished = '';

  for (const para of paragraphs) {
    const units = splitLongUnit(para, maxWords);
    for (const unit0 of units) {
      const unit = unit0.trim();
      if (!unit) continue;
      const candidate = unfinished ? unfinished + ' ' + unit : unit;
      if (countWords(candidate) <= maxWords) {
        unfinished = candidate;
      } else {
        if (unfinished) {
          blocks.push(unfinished);
          unfinished = '';
        }
        unfinished = unit; // unidade > maxWords já foi subdividida por splitLongUnit
      }
    }
  }
  if (unfinished) blocks.push(unfinished);

  // funde blocos com 1–2 palavras no anterior (se couber)
  const merged = [];
  for (const b of blocks) {
    if (merged.length && countWords(b) <= 2 && countWords(merged[merged.length - 1]) + countWords(b) <= maxWords) {
      merged[merged.length - 1] += ' ' + b;
    } else {
      merged.push(b);
    }
  }
  return merged;
}

/**
 * Concatena múltiplos WAVs PCM 16-bit (mesmo sample rate/canais) em um
 * único WAV válido. Insere uma pausa opcional (ms) entre blocos.
 * Retorna um ArrayBuffer WAV.
 */
export function concatWavBlobs(blobs, { pauseMs = 150 } = {}) {
  if (!blobs.length) throw new Error('concatWavBlobs: lista vazia');

  const chunks = [];
  let totalSamples = 0;
  let lastRate = null;
  let lastChannels = null;
  let pauseBytes = 0;

  for (const blob of blobs) {
    const view = new DataView(blob);
    if (view.byteLength < 44) throw new Error('WAV muito curto');
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    if (riff !== 'RIFF' || wave !== 'WAVE') throw new Error('WAV inválido (RIFF/WAVE)');

    const fmtSize = view.getUint32(16, true);
    if (fmtSize < 16) throw new Error('fmt chunk inválido');
    const audioFormat = view.getUint16(20, true);
    const ch = view.getUint16(22, true);
    const rate = view.getUint32(24, true);
    const bits = view.getUint16(34, true);
    if (audioFormat !== 1) throw new Error('apenas PCM (formato 1) suportado');
    if (bits !== 16) throw new Error('apenas PCM 16-bit suportado');
    if (lastRate !== null && (rate !== lastRate || ch !== lastChannels)) {
      throw new Error(`formatos incompatíveis: ${rate}/${ch} vs ${lastRate}/${lastChannels}`);
    }
    lastRate = rate;
    lastChannels = ch;

    let offset = 12;
    let dataStart = -1;
    let dataLen = 0;
    while (offset + 8 <= view.byteLength) {
      const id = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
      const len = view.getUint32(offset + 4, true);
      if (id === 'data') {
        dataStart = offset + 8;
        dataLen = Math.min(len, view.byteLength - dataStart);
        break;
      }
      offset += 8 + len + (len % 2);
    }
    if (dataStart < 0) throw new Error('chunk data ausente');

    chunks.push({ bytes: new Uint8Array(blob, dataStart, dataLen), samples: dataLen / 2 });
    totalSamples += dataLen / 2;

    if (chunks.length < blobs.length) {
      pauseBytes = Math.round((pauseMs / 1000) * rate) * 2;
      if (pauseBytes > 0) {
        chunks.push({ bytes: new Uint8Array(pauseBytes), samples: pauseBytes / 2 });
        totalSamples += pauseBytes / 2;
      }
    }
  }

  const dataBytes = totalSamples * 2;
  const out = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(out);
  const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, lastChannels, true);
  view.setUint32(24, lastRate, true);
  view.setUint32(28, lastRate * lastChannels * 2, true);
  view.setUint16(32, lastChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  let pos = 44;
  for (const c of chunks) {
    new Uint8Array(out, pos, c.bytes.length).set(c.bytes);
    pos += c.bytes.length;
  }
  return out;
}
