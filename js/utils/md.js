// ============================================================
// Renderizador Markdown minimalista (sem dependências).
// Produz HTML seguro (tudo é escapado antes do inline).
// ============================================================

function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inline(s) {
  return s
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
}

export function renderMarkdown(src) {
  if (!src) return '';
  const blocks = [];
  let s = String(src).replace(/\r\n?/g, '\n');

  // blocos de código cercados
  s = s.replace(/```(\w*)[ \t]*\n([\s\S]*?)```/g, (m, lang, code) => {
    blocks.push({ lang, code });
    return `\u0000B${blocks.length - 1}\u0000`;
  });

  s = esc(s);

  // títulos
  s = s.replace(/^(#{1,6})[ \t]+(.+)$/gm, (m, hashes, rest) => {
    const level = hashes.length;
    return `<h${level}>${inline(rest)}</h${level}>`;
  });

  // citações
  s = s.replace(/^[ \t]*&gt;[ \t]*(.+)$/gm, (m, q) => `<blockquote>${inline(q)}</blockquote>`);

  // inline (código, negrito, itálico, tachado, links)
  s = inline(s);

  // parágrafos e listas
  const out = [];
  let list = null;
  const flushList = () => {
    if (list) {
      out.push(`<${list.tag}>` + list.items.join('') + `</${list.tag}>`);
      list = null;
    }
  };

  for (const line of s.split('\n')) {
    if (!line.trim()) { flushList(); continue; }
    const ul = line.match(/^[ \t]*[-*+][ \t]+(.+)$/);
    const ol = line.match(/^[ \t]*\d+[.)][ \t]+(.+)$/);
    if (ul || ol) {
      const tag = ul ? 'ul' : 'ol';
      const item = ul ? ul[1] : ol[1];
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push(`<li>${item}</li>`);
      continue;
    }
    flushList();
    out.push(`<p>${line}</p>`);
  }
  flushList();
  s = out.join('\n');

  // restaura blocos de código
  s = s.replace(/\u0000B(\d+)\u0000/g, (m, i) => {
    const b = blocks[Number(i)];
    const lang = b.lang || 'text';
    return (
      '<div class="md-code">' +
      `<div class="md-code-head"><span>${esc(lang)}</span><button class="md-copy" type="button">copiar</button></div>` +
      `<pre><code class="language-${esc(lang)}">${esc(b.code)}</code></pre>` +
      '</div>'
    );
  });

  return s;
}
