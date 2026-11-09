// ============================================================
// Utilidades de mídia: arquivos → anexos, base64, previews
// ============================================================

import { extractDocument } from './documents.js';

export function kindFromFile(file) {
  if (['txt', 'md', 'markdown', 'pdf', 'docx'].includes(extOf(file.name))) return 'document';
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('video/')) return 'video';
  return null;
}

export function formatBytes(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 ** 3) return (bytes / (1024 ** 2)).toFixed(1) + ' MB';
  return (bytes / (1024 ** 3)).toFixed(1) + ' GB';
}

export function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    fr.readAsDataURL(file);
  });
}

export function dataUrlToBase64(dataUrl) {
  const i = dataUrl.indexOf(',');
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

/** Extrai a extensão de um nome de arquivo. */
export function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

/** Anexo bruto (rascunho) a partir de um File. */
export async function makeDraftAttachment(file) {
  const kind = kindFromFile(file);
  if (!kind) return null;
  return {
    kind,
    file,
    name: file.name,
    size: file.size,
    mime: file.type,
    // preenchidos sob demanda (prepareAttachment)
    dataUrl: null,
    base64: null,
    previewUrl: null,   // object URL para preview local (áudio/vídeo)
    thumbUrl: null,     // data URL do thumbnail (imagem/vídeo)
    duration: null,
    transcript: null,
    converting: false,
  };
}

/** Finaliza um anexo: gera dataURL/base64 e previews. */
export async function prepareAttachment(att) {
  if (att.kind === 'document') {
    if (att.documentText == null) {
      att.documentText = await extractDocument(att.file, extOf(att.name));
    }
    return att;
  }
  if (att.dataUrl == null && att.file) {
    att.dataUrl = await readAsDataURL(att.file);
  }
  if (att.base64 == null && att.dataUrl) {
    att.base64 = dataUrlToBase64(att.dataUrl);
  }
  if (att.kind === 'image' && !att.thumbUrl) {
    att.thumbUrl = att.dataUrl;
  }
  return att;
}

/** Gera um thumbnail (primeiro frame) de um vídeo. */
export function captureVideoThumb(videoFile) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(videoFile);
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.src = url;
    v.onloadeddata = () => {
      try {
        v.currentTime = Math.min(0.1, (v.duration || 0.1));
      } catch { /* ignora */ }
    };
    v.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 320 / v.videoWidth);
        canvas.width = Math.max(1, Math.round(v.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(v.videoHeight * scale));
        canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } catch {
        resolve(null);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
  });
}
