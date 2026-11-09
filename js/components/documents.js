// Documents are read locally. The chat request contains only their text.
const wordNamespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const strictWordNamespace = 'http://purl.oclc.org/ooxml/wordprocessingml/main';

async function extractPdf(file) {
  const { getDocument } = await import('../../vendor/documents/pdfjs.mjs');
  const assets = new URL('../../vendor/documents/', import.meta.url);
  const task = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: new URL('cmaps/', assets).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', assets).href,
    useSystemFonts: false,
    isEvalSupported: false,
    useWasm: false,
  });
  try {
    const pdf = await task.promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const { items } = await page.getTextContent();
      pages.push(items.map((item) => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim());
      page.cleanup();
    }
    return pages.join('\n\n');
  } finally {
    await task.destroy();
  }
}

async function extractDocx(file) {
  const module = await import('../../vendor/documents/jszip.js');
  const zip = await (module.default || globalThis.JSZip).loadAsync(await file.arrayBuffer());
  const entry = zip.file('word/document.xml');
  if (!entry) throw new Error('Missing Word document');
  const doc = new DOMParser().parseFromString(await entry.async('string'), 'application/xml');
  const namespace = doc.documentElement.namespaceURI;
  if (doc.documentElement.localName !== 'document' || ![wordNamespace, strictWordNamespace].includes(namespace)) {
    throw new Error('Invalid Word document');
  }
  return Array.from(doc.getElementsByTagNameNS(namespace, 'p'), (paragraph) =>
    Array.from(paragraph.getElementsByTagNameNS(namespace, '*'), (node) => {
      if (node.localName === 't') return node.textContent;
      if (node.localName === 'tab') return '\t';
      if (node.localName === 'br') return '\n';
      return '';
    }).join('')).join('\n');
}

export async function extractDocument(file, extension) {
  let content;
  if (extension === 'pdf') content = await extractPdf(file);
  else if (extension === 'docx') content = await extractDocx(file);
  else content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  if (content.includes('\0')) throw new Error('Invalid text document');
  return content.trim();
}
