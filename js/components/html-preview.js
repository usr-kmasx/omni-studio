import { codeLabel } from '../utils/code-labels.js';
import { t } from '../i18n.js';
import { icon } from '../utils/icons.js';

let closeCurrent = null;

export function openHtmlPreview(source, trigger) {
  closeCurrent?.();
  const overlay = document.createElement('div');
  overlay.className = 'html-preview-overlay';
  const dialog = document.createElement('section');
  dialog.className = 'html-preview-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', codeLabel('preview'));
  const toolbar = document.createElement('header');
  const title = document.createElement('span');
  title.textContent = codeLabel('preview');
  const closeButton = document.createElement('button');
  closeButton.className = 'icon-btn';
  closeButton.type = 'button';
  closeButton.title = closeButton.ariaLabel = t('settings.close');
  closeButton.innerHTML = icon('close', 20);
  toolbar.append(title, closeButton);
  const frame = document.createElement('iframe');
  frame.title = codeLabel('preview');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.referrerPolicy = 'no-referrer';
  dialog.append(toolbar, frame);
  overlay.append(dialog);

  const background = [...document.body.children].map(element => [element, element.inert]);
  for (const [element] of background) element.inert = true;
  let previousEscape = 0;
  const listeners = new AbortController();
  const close = () => {
    listeners.abort();
    frame.srcdoc = '';
    overlay.remove();
    for (const [element, wasInert] of background) element.inert = wasInert;
    closeCurrent = null;
    if (trigger?.isConnected) trigger.focus();
  };
  closeCurrent = close;
  const escape = () => {
    const now = performance.now();
    if (previousEscape && now - previousEscape < 1200) close();
    else previousEscape = now;
  };
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!event.repeat) escape();
    } else previousEscape = 0;
  }, { capture: true, signal: listeners.signal });
  window.addEventListener('message', (event) => {
    if (event.source !== frame.contentWindow) return;
    if (event.data?.type === 'omni-preview-escape') escape();
    if (event.data?.type === 'omni-preview-key') previousEscape = 0;
  }, { signal: listeners.signal });
  closeButton.addEventListener('click', close);

  const documentPreview = new DOMParser().parseFromString(source, 'text/html');
  const keyboard = documentPreview.createElement('script');
  keyboard.textContent = `
    addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (!event.repeat) parent.postMessage({type: 'omni-preview-escape'}, '*');
      } else parent.postMessage({type: 'omni-preview-key'}, '*');
    }, true);
  `;
  documentPreview.head.prepend(keyboard);
  frame.srcdoc = '<!doctype html>\n' + documentPreview.documentElement.outerHTML;
  document.body.append(overlay);
  closeButton.focus();
}
