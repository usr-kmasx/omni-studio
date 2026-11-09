import { detectTextLanguage } from '../js/utils/lang-detect.js';

const casos = [
  ['O clima hoje está agradável e o céu está limpo, como sempre.', 'pt'],
  ['The weather today is pleasant and the sky is clear as always.', 'en'],
  ['El clima de hoy es agradable y el cielo está despejado como siempre.', 'es'],
  ['Le temps aujourd’hui est agréable et le ciel est dégagé, comme toujours.', 'fr'],
  // texto curto/ambíguo -> null (fallback)
  ['ok', null],
  ['sim, concordo', null], // curto e baixa confiança? 'sim' não está na lista; 'concordo' não -> null
  // misto leve (en dominante)
  ['the cat is on the roof and o gato está no telhado', 'en'],
  // empate -> null
  ['the and o a', null],
];

let fail = 0;
for (const [text, esperado] of casos) {
  const got = detectTextLanguage(text);
  const okk = got === esperado;
  if (!okk) fail++;
  console.log(`${okk ? 'OK ' : 'FAIL'} ${JSON.stringify(text.slice(0, 45))} -> ${got} (esperado ${esperado})`);
}
if (fail) throw new Error(`${fail} falhas no detector`);
console.log('=== UNIT LANG OK ===');
