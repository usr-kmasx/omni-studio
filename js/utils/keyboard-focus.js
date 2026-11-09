const focusable = [
  'button', 'input:not([type="hidden"])', 'select', 'textarea', 'a[href]',
  'summary', 'audio[controls]', 'video[controls]', '[tabindex]', '[contenteditable="true"]',
].join(',');

function tabStops(root) {
  return [...root.querySelectorAll(focusable)].filter((element) =>
    !element.matches(':disabled') &&
    !element.closest('[hidden], [inert]') &&
    (!element.hasAttribute('tabindex') || element.tabIndex >= 0) &&
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility === 'visible' &&
    ![...element.parentElement.closest('details:not([open])')?.children || []]
      .some((child) => child.tagName !== 'SUMMARY' && child.contains(element))
  );
}

export function installKeyboardFocus(modalHost) {
  let dialog = null;
  let returnFocus = null;
  let lastPageFocus = null;

  document.addEventListener('focusin', ({ target }) => {
    if (!modalHost.contains(target)) lastPageFocus = target;
  });

  function updateDialog() {
    const next = modalHost.querySelector('.modal');
    if (next === dialog) return;
    if (next) {
      if (!dialog) {
        const active = document.activeElement;
        returnFocus = active !== document.body && !modalHost.contains(active) ? active : lastPageFocus;
      }
      dialog = next;
      dialog.tabIndex = -1;
      const stops = tabStops(dialog);
      (stops.find((element) => element.hasAttribute('data-dialog-focus')) || stops[0] || dialog).focus();
    } else {
      dialog = null;
      const previous = returnFocus;
      returnFocus = null;
      if (previous?.isConnected && tabStops(document).includes(previous)) previous.focus();
      else tabStops(document)[0]?.focus();
    }
  }

  new MutationObserver(updateDialog).observe(modalHost, { childList: true });

  document.addEventListener('keydown', (event) => {
    const tab = event.key === 'Tab' || event.code === 'Tab' || event.key === 'ISO_Left_Tab';
    if (!tab || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;

    const previous = event.shiftKey || event.key === 'ISO_Left_Tab';
    updateDialog();
    const stops = tabStops(dialog || document);
    if (!stops.length) {
      if (dialog) {
        event.preventDefault();
        dialog.focus();
      }
      return;
    }

    // Usa a mesma sequência nos dois sentidos para evitar que o WebKit pule controles.
    event.preventDefault();
    const current = stops.indexOf(document.activeElement);
    const direction = previous ? -1 : 1;
    const next = current < 0 ? (previous ? stops.length - 1 : 0)
      : (current + direction + stops.length) % stops.length;
    stops[next].focus();
  });
}
