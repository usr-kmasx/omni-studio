import assert from 'node:assert/strict';
import { liveContext, submissionRoute } from '../js/api/live-context.js';
import { conversationToMessages } from '../js/api/chat.js';

const shared = [
  { role: 'user', text: 'Primeira pergunta', media: [
    { kind: 'document', name: 'notas.txt', documentText: 'Referência local' },
    { kind: 'image', dataUrl: 'data:image/png;base64,AA==' },
  ] },
  { role: 'assistant', text: 'Resposta do Chat' },
  { role: 'user', text: 'Fala transcrita', transcribed: true, media: [{ kind: 'audio', base64: 'AA==' }] },
  { role: 'assistant', text: 'Resposta do Live' },
  { role: 'assistant', text: 'Resposta em andamento', inFlight: true },
];
const context = liveContext(shared);
assert.deepEqual(context.map(({ role }) => role), ['user', 'assistant', 'user', 'assistant']);
assert.match(context[0].text, /Referência local/);
assert.doesNotMatch(context[0].text, /base64/);
assert.equal(conversationToMessages(shared).at(-1).content[0].text, 'Resposta do Live');
assert.deepEqual(conversationToMessages(shared)[2].content.map(({ type }) => type), ['text']);
assert.equal(submissionRoute(true, []), 'live');
assert.equal(submissionRoute(true, shared[0].media), 'chat');
assert.equal(submissionRoute(false, []), 'chat');
console.log('=== LIVE CONTEXT OK ===');
