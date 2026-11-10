import { getLocale } from '../i18n.js';

const labels = {
  en: ['Image mode', 'Image generation cancelled.', 'Generation parameters', 'Local backend', 'Image model'],
  pt: ['Modo imagem', 'Geração de imagem cancelada.', 'Parâmetros de geração', 'Backend local', 'Modelo de imagem'],
  es: ['Modo de imagen', 'Generación de imagen cancelada.', 'Parámetros de generación', 'Backend local', 'Modelo de imagen'],
  fr: ['Mode image', 'Génération d’image annulée.', 'Paramètres de génération', 'Moteur local', 'Modèle d’image'],
  de: ['Bildmodus', 'Bilderzeugung abgebrochen.', 'Generierungsparameter', 'Lokales Backend', 'Bildmodell'],
};
const keys = ['mode', 'cancelled', 'parameters', 'backend', 'model'];

export function imageChatLabel(key) {
  return (labels[getLocale()] || labels.en)[keys.indexOf(key)];
}
