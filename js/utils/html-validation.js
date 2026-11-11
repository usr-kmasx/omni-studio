import '../../vendor/htmlhint/htmlhint.min.mjs';

export function validateHtml(source) {
  const content = source.replace(/<!--\s*htmlhint[\s\S]*?-->/gi, comment => comment.replace(/[^\n]/g, ' '));
  return globalThis.HTMLHint.HTMLHint.verify(content, {
    'tag-pair': true,
    'attr-no-duplication': true,
    'attr-value-double-quotes': true,
    'spec-char-escape': true,
  });
}

export function htmlBlocks(markdown) {
  const blocks = [];
  const pattern = /^(`{3,}|~{3,})html[^\n]*\n([\s\S]*?)^\1[ \t]*(?:\n|$)/gim;
  for (const match of markdown.matchAll(pattern)) {
    const start = match.index + match[0].indexOf('\n') + 1;
    blocks.push({ start, end: start + match[2].length, code: match[2] });
  }
  return blocks;
}

export function applyHtmlEdits(source, response) {
  const json = response.trim().replace(/^```(?:json)?\s*\n/i, '').replace(/\n```\s*$/, '');
  const result = JSON.parse(json);
  if (!Array.isArray(result.edits) || !result.edits.length) throw new Error('Return a nonempty edits array.');
  const lines = source.split('\n');
  const edits = result.edits.slice().sort((a, b) => a.startLine - b.startLine);
  let previousEnd = 0;
  for (const edit of edits) {
    if (!Number.isInteger(edit.startLine) || !Number.isInteger(edit.endLine) ||
        edit.startLine < 1 || edit.endLine < edit.startLine || edit.endLine > lines.length ||
        edit.startLine <= previousEnd || typeof edit.oldText !== 'string' || typeof edit.newText !== 'string') {
      throw new Error('Edits must use valid, nonoverlapping inclusive line ranges.');
    }
    if (lines.slice(edit.startLine - 1, edit.endLine).join('\n') !== edit.oldText) {
      throw new Error('oldText must match the exact original lines, including whitespace.');
    }
    previousEnd = edit.endLine;
  }
  for (const edit of edits.reverse()) {
    lines.splice(edit.startLine - 1, edit.endLine - edit.startLine + 1, ...edit.newText.split('\n'));
  }
  const updated = lines.join('\n');
  if (!updated.trim() || updated === source) throw new Error('Return edits that correct the reported errors.');
  return updated;
}

export async function repairHtml(markdown, { signal, generate, onUpdate, onErrors }) {
  let text = markdown;
  let offset = 0;
  for (const block of htmlBlocks(markdown)) {
    let code = block.code;
    let end = block.end + offset;
    const start = block.start + offset;
    let errors = validateHtml(code);
    let patchError = '';
    while (errors.length) {
      signal.throwIfAborted();
      onErrors(errors);
      const prompt = [
        'Fix the reported HTML syntax errors with minimal edits. Preserve all unrelated content.',
        'Return only JSON with this shape: {"edits":[{"startLine":1,"endLine":1,"oldText":"exact original line(s)","newText":"corrected line(s)"}]}.',
        'Line numbers are 1-based and inclusive. Ranges must not overlap. oldText must match exactly, including whitespace.',
        'Return only the changed ranges. The numbered source below is reference data. Do not include its line numbers in edits.',
        ...errors.map(error => `Line ${error.line}, column ${error.col}: ${error.message}`),
        patchError,
        code.split('\n').map((line, index) => `${index + 1} | ${line}`).join('\n'),
      ].filter(Boolean).join('\n');
      const response = await generate(prompt);
      signal.throwIfAborted();
      try {
        code = applyHtmlEdits(code, response);
        patchError = '';
      } catch (error) {
        patchError = `Your previous patch was rejected. ${error.message}`;
        continue;
      }
      errors = validateHtml(code);
      text = text.slice(0, start) + code + text.slice(end);
      end = start + code.length;
      onUpdate(text);
    }
    offset = end - block.end;
  }
  return text;
}
