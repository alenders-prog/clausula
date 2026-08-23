/**
 * src/docx/nummering.js
 * Rekent OOXML-lijstnummering om naar een tekstlabel ("3.8.", "1.", "a)").
 *
 * Waarom die omrekening er is: `mammoth.extractRawText` laat auto-nummering weg.
 * Claude ziet dan "Partneralimentatie" in plaats van "2.2 Partneralimentatie" en
 * kan een verwijzing als "zie artikel 2.2.3" niet meer nalopen. Daarom wordt het
 * label als gewone tekst in de DOCX geschreven — en de `numPr` daarna verwijderd,
 * zodat de viewer het niet dubbel toont.
 *
 * Aanleiding (23 augustus 2026): dit draaide alleen ná een Adobe PDF→DOCX-conversie.
 * Werd het uitgangsdocument als DOCX geüpload, dan sloeg de hele stap over: Word
 * toonde "1. Ouderlijk gezag", Claude las "Ouderlijk gezag", en de viewer rekende
 * de nummering zelf uit — met "(A) Ouderlijk gezag" als resultaat. Drie teksten,
 * drie uitkomsten, en passages die daardoor niet meer teruggevonden werden.
 */

const ROMEINS = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

function romeins(n) {
  let rest = n, uit = '';
  for (const [waarde, teken] of ROMEINS) {
    while (rest >= waarde) { uit += teken; rest -= waarde; }
  }
  return uit;
}

/**
 * Eén tellerwaarde in het gevraagde formaat. Geeft null voor een bullet — die
 * hoort geen nummer te krijgen.
 */
export function formatteerNummer(formaat, waarde) {
  const n = Number(waarde);
  if (!Number.isFinite(n) || n < 1) return String(waarde ?? '');
  switch (formaat) {
    case 'bullet':      return null;
    case 'lowerLetter': return String.fromCharCode(96 + ((n - 1) % 26) + 1);
    case 'upperLetter': return String.fromCharCode(64 + ((n - 1) % 26) + 1);
    case 'lowerRoman':  return romeins(n).toLowerCase();
    case 'upperRoman':  return romeins(n);
    case 'none':        return '';
    default:            return String(n);
  }
}

/**
 * Vult een lvlText-sjabloon in: "%1.%2." met tellers [3, 8] wordt "3.8.".
 *
 * @param {string} sjabloon    de lvlText, bijv. "%1." of "(%1)"
 * @param {object} niveaus     per ilvl: { formaat, teller }
 */
export function bouwLabel(sjabloon, niveaus = {}) {
  if (typeof sjabloon !== 'string' || !sjabloon) return '';
  return sjabloon.replace(/%(\d+)/g, (_, n) => {
    const ilvl = parseInt(n, 10) - 1;
    const niv  = niveaus[ilvl];
    if (!niv) return '';
    return formatteerNummer(niv.formaat ?? 'decimal', niv.teller ?? 1) ?? '';
  });
}

/**
 * Voegt de definitie van een abstract niveau samen met een eventuele override uit
 * `<w:num><w:lvlOverride>`. De override wint per veld; wat er niet in staat komt
 * uit het abstracte niveau.
 *
 * @param {{formaat?:string, sjabloon?:string, start?:number}} abstract
 * @param {{formaat?:string, sjabloon?:string, start?:number}|null} override
 */
export function pasOverrideToe(abstract = {}, override = null) {
  if (!override) return { ...abstract };
  return {
    formaat:  override.formaat  ?? abstract.formaat,
    sjabloon: override.sjabloon ?? abstract.sjabloon,
    start:    override.start    ?? abstract.start,
  };
}

/**
 * Verhoogt de teller voor `ilvl` en wist de diepere niveaus — die beginnen bij een
 * nieuw bovenliggend nummer weer opnieuw.
 *
 * Muteert `tellers` (een gewoon object per numId) en geeft de nieuwe stand terug.
 */
export function volgendeTeller(tellers, ilvl, start = 1) {
  const huidig = tellers[ilvl];
  tellers[ilvl] = huidig === undefined ? start : huidig + 1;
  for (const k of Object.keys(tellers)) {
    if (Number(k) > ilvl) delete tellers[k];
  }
  return tellers[ilvl];
}

/**
 * Schrijft de auto-nummering van een DOCX weg als gewone tekst en haalt de
 * `<w:numPr>` weg, zodat één en dezelfde tekst overal geldt: wat Word toont, wat
 * `mammoth.extractRawText` aan Claude geeft, en wat de viewer rendert.
 *
 * Muteert `xmlDoc` en geeft het aantal geschreven labels terug.
 *
 * @param {Document} xmlDoc  word/document.xml
 * @param {Document} numDoc  word/numbering.xml
 * @param {string}   wNs     de wordprocessingml-namespace
 * @param {string}   xmlNs   de xml-namespace (voor xml:space)
 */
export function injecteerNummering(xmlDoc, numDoc, wNs, xmlNs) {
  const body = xmlDoc.getElementsByTagNameNS(wNs, 'body')[0];
  if (!body || !numDoc) return 0;

  const lijst = (el, naam) => Array.from(el.getElementsByTagNameNS(wNs, naam));
  const val   = (el, naam) => el?.getElementsByTagNameNS(wNs, naam)[0]?.getAttributeNS(wNs, 'val');

  const absNumMap = new Map();  // abstractNumId → element
  const numIdMap  = new Map();  // numId → { absNum, numEl }

  for (const an of lijst(numDoc, 'abstractNum'))
    absNumMap.set(an.getAttributeNS(wNs, 'abstractNumId'), an);

  for (const numEl of lijst(numDoc, 'num')) {
    const nId  = numEl.getAttributeNS(wNs, 'numId');
    const aRef = val(numEl, 'abstractNumId');
    if (aRef && absNumMap.has(aRef)) numIdMap.set(nId, { absNum: absNumMap.get(aRef), numEl });
  }
  if (!numIdMap.size) return 0;

  const leesNiveau = lvl => {
    if (!lvl) return null;
    const st = val(lvl, 'start');
    return {
      formaat:  val(lvl, 'numFmt'),
      sjabloon: val(lvl, 'lvlText'),
      start:    st != null ? parseInt(st, 10) : undefined,
    };
  };
  const zoekLvl = (ouder, ilvl) => lijst(ouder, 'lvl')
    .find(l => parseInt(l.getAttributeNS(wNs, 'ilvl') ?? '0', 10) === ilvl) || null;

  // Het abstracte niveau, met een eventuele <w:lvlOverride> uit <w:num> eroverheen.
  // Zo laat Word een lijst opnieuw beginnen of in een ander formaat lopen dan het
  // abstracte niveau zegt.
  const defCache = new Map();
  const definitie = (numId, ilvl) => {
    const sleutel = `${numId}-${ilvl}`;
    if (defCache.has(sleutel)) return defCache.get(sleutel);
    const { absNum, numEl } = numIdMap.get(numId);
    const abstract = leesNiveau(zoekLvl(absNum, ilvl));
    let override = null;
    for (const ov of lijst(numEl, 'lvlOverride')) {
      if (parseInt(ov.getAttributeNS(wNs, 'ilvl') ?? '-1', 10) !== ilvl) continue;
      const so = val(ov, 'startOverride');
      override = {
        ...(leesNiveau(zoekLvl(ov, ilvl)) || {}),
        ...(so != null ? { start: parseInt(so, 10) } : {}),
      };
      break;
    }
    const def = abstract ? pasOverrideToe(abstract, override) : null;
    defCache.set(sleutel, def);
    return def;
  };

  const tellersPerNum = new Map();  // numId → { ilvl: teller }
  let geschreven = 0;

  for (const para of lijst(body, 'p')) {
    const numPr = para.getElementsByTagNameNS(wNs, 'numPr')[0];
    if (!numPr) continue;
    const numId = val(numPr, 'numId');
    const ilvl  = parseInt(val(numPr, 'ilvl') ?? '0', 10);
    if (!numId || !numIdMap.has(numId)) continue;

    const def = definitie(numId, ilvl);
    if (!def || def.formaat === 'bullet') continue;

    if (!tellersPerNum.has(numId)) tellersPerNum.set(numId, {});
    const tellers = tellersPerNum.get(numId);
    volgendeTeller(tellers, ilvl, def.start ?? 1);

    // Het sjabloon van dit niveau mag naar hogere niveaus verwijzen ("%1.%2.").
    const niveaus = {};
    for (const [niv, teller] of Object.entries(tellers))
      niveaus[niv] = { formaat: definitie(numId, Number(niv))?.formaat ?? 'decimal', teller };

    const label = bouwLabel(def.sjabloon ?? `%${ilvl + 1}.`, niveaus);
    if (!label.trim()) continue;

    const run = xmlDoc.createElementNS(wNs, 'w:r');
    const t   = xmlDoc.createElementNS(wNs, 'w:t');
    t.setAttributeNS(xmlNs, 'xml:space', 'preserve');
    t.textContent = label + '\t';
    run.appendChild(t);

    const pPr      = para.getElementsByTagNameNS(wNs, 'pPr')[0];
    const eersteRun = para.getElementsByTagNameNS(wNs, 'r')[0];
    if (eersteRun) para.insertBefore(run, eersteRun);
    else if (pPr)  para.insertBefore(run, pPr.nextSibling);
    else           para.appendChild(run);

    // numPr weg, anders rendert de viewer de nummering er nog eens overheen:
    // "10. 10. Vakanties".
    numPr.parentNode?.removeChild(numPr);
    geschreven++;
  }

  return geschreven;
}
