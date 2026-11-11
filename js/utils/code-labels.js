import { getLocale } from '../i18n.js';

const labels = {
  en: { preview: 'Preview HTML', copy: 'Copy', valid: 'HTML syntax checked', invalid: 'HTML error at line {line}', correcting: 'Correcting HTML syntax…' },
  pt: { preview: 'Visualizar HTML', copy: 'Copiar', valid: 'Sintaxe HTML verificada', invalid: 'Erro HTML na linha {line}', correcting: 'Corrigindo a sintaxe HTML…' },
  es: { preview: 'Vista previa HTML', copy: 'Copiar', valid: 'Sintaxis HTML verificada', invalid: 'Error HTML en la línea {line}', correcting: 'Corrigiendo la sintaxis HTML…' },
  fr: { preview: 'Aperçu HTML', copy: 'Copier', valid: 'Syntaxe HTML vérifiée', invalid: 'Erreur HTML à la ligne {line}', correcting: 'Correction de la syntaxe HTML…' },
  de: { preview: 'HTML-Vorschau', copy: 'Kopieren', valid: 'HTML-Syntax geprüft', invalid: 'HTML-Fehler in Zeile {line}', correcting: 'HTML-Syntax wird korrigiert…' },
};

export function codeLabel(key, values = {}) {
  return labels[getLocale()][key].replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
}
