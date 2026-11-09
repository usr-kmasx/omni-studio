// ============================================================
// Toasts simples
// ============================================================

import { icon } from './icons.js';

let host = null;

function getHost() {
  if (!host) host = document.getElementById('toastHost');
  return host;
}

export function appToast(message, kind = 'info', ms = 4200) {
  const h = getHost();
  if (!h || !message) return;
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  const ic = kind === 'error' ? 'alert' : kind === 'ok' ? 'check' : 'spark';
  t.innerHTML = `${icon(ic, 16)}<span></span>`;
  t.querySelector('span').textContent = message;
  h.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity .3s';
    setTimeout(() => t.remove(), 320);
  }, ms);
}

export function clearToasts() {
  const h = getHost();
  if (h) h.innerHTML = '';
}
