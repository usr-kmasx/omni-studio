import assert from 'node:assert/strict';
import { renderMarkdown } from '../js/utils/md.js';
import { repairHtml, validateHtml, htmlBlocks, applyHtmlEdits } from '../js/utils/html-validation.js';

assert.match(renderMarkdown('```html\n<div>'), /md-copy/);
assert.doesNotMatch(renderMarkdown('```html\n<div>'), /html-validation/);
assert.match(renderMarkdown('| A | B |\n|---|---|\n| 1 | 2 |'), /<table>/);
assert.match(renderMarkdown('- one\n  - nested'), /<ul>/);
assert.doesNotMatch(renderMarkdown('<script>alert(1)</script>'), /<script>/);
assert.equal(validateHtml('<div><p>Hello</p></div>').length, 0);
assert(validateHtml('<div><b></div>').length);
const input = 'Before\n```html\n<div><b></div>\n```\nAfter\n```js\nx\n```\n';
const abort = new AbortController();
let attempts = 0;
const output = await repairHtml(input, {
  signal: abort.signal,
  generate: async prompt => {
    assert.match(prompt, /Line/);
    return ++attempts === 1 ? 'invalid patch' : JSON.stringify({ edits: [{ startLine: 1, endLine: 1, oldText: '<div><b></div>', newText: '<div><b></b></div>' }] });
  },
  onUpdate() {}, onErrors() {},
});
assert.equal(attempts, 2);
assert.equal(htmlBlocks(output).length, 1);
assert.match(output, /Before/);
assert.match(output, /After/);
assert.match(output, /```js\nx/);
abort.abort();
await assert.rejects(repairHtml(input, {
  signal: abort.signal, generate() { throw Error('should not run'); },
  onUpdate() {}, onErrors() {},
}), { name: 'AbortError' });
console.log('HTML validation, repeated correction, abort and streaming Markdown passed');

const original = 'keep\n<div>\n</span>\nkeep too';
const patch = edits => JSON.stringify({ edits });
assert.equal(applyHtmlEdits(original, patch([
  { startLine: 3, endLine: 3, oldText: '</span>', newText: '</div>' },
])), 'keep\n<div>\n</div>\nkeep too');
assert.throws(() => applyHtmlEdits(original, patch([
  { startLine: 3, endLine: 3, oldText: 'wrong source', newText: '</div>' },
])));
assert.throws(() => applyHtmlEdits(original, patch([
  { startLine: 2, endLine: 3, oldText: '<div>\n</span>', newText: '<div></div>' },
  { startLine: 3, endLine: 3, oldText: '</span>', newText: '</div>' },
])));
console.log('Minimal HTML patches preserve untouched lines and reject stale or overlapping edits');
