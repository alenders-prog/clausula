/**
 * tests/e2e/helpers/pdf.js — een echte, minimale PDF met leesbare tekst.
 *
 * Aanleiding (1 september 2026). Er was geen enkele browsertest die een analyse van
 * begin tot eind liep, en dat is precies waar `ReferenceError: _klaar is not defined`
 * elf dagen kon blijven zitten. De poging om er alsnog een te schrijven strandde meteen
 * op iets banaals: `new File(['%PDF-1.4 test'], …)` is geen PDF. pdf.js opent hem niet,
 * er komen nul pagina's uit, en de analyse breekt af op "Kon weinig tot geen tekst uit
 * de documenten halen" — ver vóór het punt dat de test wil toetsen.
 *
 * Vandaar deze: een geldige PDF met een correcte xref-tabel, opgebouwd uit tekstregels.
 * Klein genoeg om in de test te lezen, echt genoeg om door pdf.js heen te komen.
 *
 * Bewust géén losse .pdf in de repo: een fixture die je niet kunt lezen is een fixture
 * die niemand durft aan te passen, en er mag nooit een echt cliëntdocument in belanden.
 */

/**
 * Bouwt een PDF van één pagina met de gegeven regels als tekst.
 *
 * @param {string[]} regels
 * @returns {Uint8Array}
 */
export function maakPdf(regels) {
  const esc = (t) => String(t).replace(/([\\()])/g, '\\$1');
  const inhoud = 'BT /F1 11 Tf 40 760 Td 14 TL\n'
    + regels.map(r => `(${esc(r)}) Tj T*`).join('\n')
    + '\nET';

  const objecten = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] '
      + '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${inhoud.length} >>\nstream\n${inhoud}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objecten.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  // De xref-tabel moet kloppen: pdf.js kan een kapotte tabel wel repareren, maar dan
  // gaat hij door een herstelpad heen dat in een test niets bewijst.
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objecten.length + 1}\n0000000000 65535 f \n`
    + offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
    + `trailer\n<< /Size ${objecten.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  const uit = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) uit[i] = pdf.charCodeAt(i) & 0xff;
  return uit;
}

/**
 * Genoeg tekst om boven de ondergrens van 200 tekens te komen die analyseDocument
 * hanteert — anders faalt de test op de tekstcontrole in plaats van op zijn bewering.
 */
export const CONVENANT_REGELS = [
  'CONVENANT / VASTSTELLINGSOVEREENKOMST',
  'Partijen zijn op 26-08-2022 te Renkum gehuwd in beperkte gemeenschap van goederen.',
  'Uit het huwelijk zijn geen kinderen geboren.',
  '2.10 Eigendom echtelijke woning. De woning wordt toebedeeld aan de man.',
  'De hypothecaire geldlening loopt bij de bank en wordt door de man overgenomen.',
  '3. Partneralimentatie wordt op nihil gesteld gelet op vergelijkbare inkomens.',
  '4. Pensioenverevening is wederzijds uitgesloten op grond van gelijkwaardigheid.',
  '15. Deze overeenkomst is opgemaakt en ondertekend op ......... te .........',
];

export const BIJLAGE_REGELS = [
  'VERDELINGSOVERZICHT (bijlage bij het convenant)',
  'Bankrekening bij de bank, toedeling aan de vrouw, saldo per peildatum.',
  'Beleggingsapp, saldo per peildatum, toedeling aan de man.',
  'De waarde van de woning is vastgesteld op vierhonderdvijftigduizend euro.',
  'De auto wordt toebedeeld aan de vrouw tegen de vastgestelde waarde.',
];
