import '../../vendor/markdown-it/markdown-it.min.mjs';
import { validateHtml } from './html-validation.js';
import { icon } from './icons.js';
import { codeLabel } from './code-labels.js';

const md = globalThis.markdownit({ html: false, breaks: true, linkify: true });

function codeBlock(tokens, index, options, env) {
  const token = tokens[index];
  const language = token.info.trim().split(/\s+/)[0] || 'text';
  const escape = md.utils.escapeHtml;
  const closingLine = env.lines?.[token.map?.[1] - 1]?.trim() || '';
  const closed = !token.markup || (closingLine.startsWith(token.markup[0].repeat(token.markup.length)) && !closingLine.replace(/[`~]/g, '').trim());
  const errors = language.toLowerCase() === 'html' && closed ? validateHtml(token.content) : null;
  const status = errors ? errors.length
    ? codeLabel('invalid', { line: errors[0].line })
    : codeLabel('valid') : '';
  const preview = language.toLowerCase() === 'html'
    ? '<button class="md-preview icon-btn" type="button" title="' + escape(codeLabel('preview')) +
      '" aria-label="' + escape(codeLabel('preview')) + '">' + icon('play', 16) + '</button>'
    : '';
  return '<div class="md-code"><div class="md-code-head"><span>' + escape(language) +
    '</span><div class="md-code-actions">' + preview + '<button class="md-copy" type="button">' + escape(codeLabel('copy')) +
    '</button></div></div><pre><code class="language-' + escape(language) + '">' +
    escape(token.content) + '</code></pre>' +
    (status ? '<small class="html-validation" role="status">' + escape(status) + '</small>' : '') + '</div>';
}

md.renderer.rules.fence = codeBlock;
md.renderer.rules.code_block = codeBlock;

export function renderMarkdown(source) {
  return source ? md.render(String(source), { lines: String(source).split(/\r?\n/) }) : '';
}
