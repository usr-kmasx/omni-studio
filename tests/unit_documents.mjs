import assert from 'node:assert/strict';
import JSZip from '../vendor/documents/jszip.js';
import { makeDraftAttachment, prepareAttachment } from '../js/components/media.js';
import { messageToContent } from '../js/api/chat.js';

async function prepare(name, bytes) {
  const attachment = await makeDraftAttachment(new File([bytes], name));
  return prepareAttachment(attachment);
}

function pdf(content) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let file = '%PDF-1.4\n';
  const offsets = objects.map((object, i) => {
    const offset = file.length;
    file += `${i + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = file.length;
  file += 'xref\n0 6\n0000000000 65535 f \n';
  for (const offset of offsets) file += `${String(offset).padStart(10, '0')} 00000 n \n`;
  return file + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

const txt = await prepare('notas.TXT', 'Olá, mundo.');
const md = await prepare('notas.md', '# Capítulo');
assert.equal(txt.documentText, 'Olá, mundo.');
assert.equal(md.documentText, '# Capítulo');
assert.equal((await prepare('vazio.txt', ' ')).documentText, '');
assert.equal(await makeDraftAttachment(new File(['x'], 'planilha.csv')), null);
assert.equal((await prepare('texto.pdf', pdf('BT /F1 12 Tf 10 100 Td (Local PDF) Tj ET'))).documentText, 'Local PDF');
assert.equal((await prepare('sem-texto.pdf', pdf('0 0 m 5 5 l S'))).documentText, '');
await assert.rejects(prepare('inválido.pdf', 'arquivo corrompido'));
await assert.rejects(prepare('inválido.docx', 'arquivo corrompido'));

if (process.env.OMNI_TEST_DOM_PARSER) {
  globalThis.DOMParser = (await import(process.env.OMNI_TEST_DOM_PARSER)).DOMParser;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Olá &amp; DOCX</w:t></w:r></w:p><w:p><w:r><w:t>Segunda linha</w:t></w:r></w:p></w:body></w:document>');
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  assert.equal((await prepare('texto.docx', bytes)).documentText, 'Olá & DOCX\nSegunda linha');
} else {
  console.log('DOCX válido: defina OMNI_TEST_DOM_PARSER com o caminho para @xmldom/xmldom no Node.');
}

const docOnly = messageToContent({ role: 'user', media: [txt] });
assert.equal(docOnly.length, 1);
assert.deepEqual(docOnly.map(({ type }) => type), ['text']);
assert.deepEqual(JSON.parse(docOnly[0].text.split('\n').slice(1).join('\n')), {
  name: 'notas.TXT', text: 'Olá, mundo.',
});
const mixed = messageToContent({
  role: 'user',
  text: 'Compare',
  media: [txt, { kind: 'image', dataUrl: 'data:image/png;base64,AA==' }, md,
    { kind: 'video', base64: 'AA==' }, { kind: 'audio', base64: 'AA==' }],
});
assert.deepEqual(mixed.map(({ type }) => type), ['text', 'text', 'image_url', 'text', 'input_video', 'input_audio']);
console.log('=== UNIT DOCUMENTS OK ===');
