import { textModelConversation } from './image-generation.js';
export function submissionRoute(live, media) {
  return live && !media.length ? 'live' : 'chat';
}

export function liveContext(conversation) {
  return textModelConversation(conversation)
    .filter((message) => !message.inFlight)
    .map(({ role, text, media }) => ({
      role,
      text: [text, ...(media || [])
        .filter((attachment) => attachment.kind === 'document' && attachment.documentText)
        .map(({ name, documentText }) => JSON.stringify({ name, text: documentText }))].filter(Boolean).join('\n'),
    }))
    .filter(({ text }) => text.trim());
}
