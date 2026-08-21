/**
 * src/docx/zin-samenvoegen.js
 * Herkent alinea's die samen één zin vormen en door de conversie zijn gesplitst.
 *
 * Adobe's PDF→DOCX-conversie knipt een alinea doormidden op de paginagrens van de
 * oorspronkelijke PDF, en zet de voettekst ("paraaf man / paraaf vrouw") als
 * gewone alinea ertussen. Na het opruimen van die voettekst blijven twee helften
 * over — plus een of meer lege alinea's waar de voettekst stond.
 *
 * De bestaande herstelcode vergeleek alleen DIRECT opeenvolgende alinea's. Stond
 * er een lege tussen, dan was de buur leeg, sloeg de controle over, en bleef de
 * zin gebroken. Zichtbaar op 21 augustus 2026: "…zodra een van hen een verzoek
 * doet voor" met een half lege pagina eronder, gevolgd door "het aanpassen van de
 * onderhoudsbijdrage."
 *
 * Dezelfde aanname als in alinea-actie.js: lege alinea's tellen niet als buur.
 */

/** Eindigt deze alinea middenin een zin? */
export function eindigtMidZin(tekst) {
  const t = (tekst || '').trim();
  if (!t) return false;
  return !/[.!?:;»\-—]$/.test(t);
}

/** Begint deze alinea als vervolg van de vorige? */
export function begintAlsVervolg(tekst) {
  const t = (tekst || '').trim();
  if (!t) return false;
  return /^[€\d(,a-z]/.test(t);
}

/**
 * Horen deze twee alinea's aaneen?
 *
 * De ondergrens van vier tekens staat er tegen losse letters en nummertjes die
 * de conversie soms achterlaat; die zouden anders aan alles vastgeplakt worden.
 */
export function hoortAaneen(huidig, volgend) {
  const a = (huidig || '').trim();
  const b = (volgend || '').trim();
  if (a.length < 4 || !b) return false;
  return eindigtMidZin(a) && begintAlsVervolg(b);
}

/**
 * Zoekt vanaf `vanaf` de eerstvolgende alinea mét tekst, en geeft die terug met
 * de indices van de lege alinea's ertussen — die kunnen dan in één keer weg.
 *
 * Kijkt hoogstens `maxLeeg` lege alinea's ver. Verder dan dat is het geen
 * paginaovergang meer maar een bewuste witregel.
 *
 * @param {string[]} teksten  alineateksten op volgorde
 * @param {number}   vanaf    index om vanaf te zoeken (exclusief de huidige)
 * @returns {{index:number, lege:number[]}|null}
 */
export function volgendeMetTekst(teksten, vanaf, maxLeeg = 3) {
  const lege = [];
  for (let i = vanaf; i < teksten.length; i++) {
    if ((teksten[i] || '').trim()) return { index: i, lege };
    lege.push(i);
    if (lege.length > maxLeeg) return null;
  }
  return null;
}
