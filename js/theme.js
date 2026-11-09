export const themes = ['system', 'light', 'dark', 'nord'];

export function resolveTheme(theme, prefersDark = false) {
  if (theme === 'system') return prefersDark ? 'dark' : 'light';
  return themes.includes(theme) ? theme : 'light';
}

let systemQuery = null;
let systemHandler = null;

export function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.themePreference = themes.includes(theme) ? theme : 'system';
  const render = (prefersDark = false) => {
    const effective = resolveTheme(root.dataset.themePreference, prefersDark);
    root.dataset.theme = effective;
    root.style.colorScheme = effective === 'light' ? 'light' : 'dark';
  };

  if (systemQuery && systemHandler) systemQuery.removeEventListener?.('change', systemHandler);
  systemQuery = null;
  systemHandler = null;
  if (root.dataset.themePreference === 'system' && typeof window.matchMedia === 'function') {
    systemQuery = window.matchMedia('(prefers-color-scheme: dark)');
    systemHandler = (event) => render(event.matches);
    systemQuery.addEventListener?.('change', systemHandler);
    render(systemQuery.matches);
  } else {
    render(false);
  }
  return root.dataset.theme;
}
