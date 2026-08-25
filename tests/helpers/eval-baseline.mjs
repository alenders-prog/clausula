/**
 * tests/helpers/eval-baseline.mjs
 * Vergelijkt een eval-run met een vastgelegde baseline.
 *
 * Waarom dit bestaat. CLAUDE.md en de PostToolUse-hook schrijven allebei voor:
 * "draai de eval en vergelijk met de baseline". Maar er wás geen baseline — de
 * bestanden `tests/golden/laatste-run-*.json` staan in .gitignore en worden bij
 * elke run overschreven. De vorige uitkomst was dus telkens al weg voordat je
 * hem kon vergelijken. Op 24 augustus 2026 liep ik daar zelf in: ik draaide de
 * eval om drie promptwijzigingen te toetsen en wiste daarmee het enige
 * vergelijkingspunt.
 *
 * ── Waarom niet op exacte titels vergelijken ────────────────────────────────
 * De titels komen van een taalmodel en variëren tussen runs: "Geschillenregeling
 * of mediationclausule ontbreekt" en "Geschillenregeling / mediationclausule
 * ontbreekt" zijn hetzelfde gebrek. Een letterlijke vergelijking zou bij élke run
 * verschillen melden, en een signaal dat altijd afgaat leert je het te negeren.
 *
 * Daarom een vingerafdruk van betekenisdragende woorden, en een overlapmaat.
 * Twee bevindingen gelden als dezelfde zodra ze genoeg woorden delen.
 */

/** Woorden die niets onderscheiden — die zouden elke twee titels op elkaar laten lijken. */
const STOPWOORDEN = new Set([
  'de', 'het', 'een', 'van', 'en', 'of', 'in', 'op', 'bij', 'te', 'ten', 'ter',
  'is', 'zijn', 'wordt', 'worden', 'met', 'voor', 'aan', 'als', 'dat', 'die',
  'niet', 'geen', 'maar', 'ook', 'nog', 'per', 'uit', 'door', 'over', 'naar',
]);

/**
 * Betekenisdragende woorden uit een titel, genormaliseerd.
 * Leestekens en hoofdletters verdwijnen, zodat "of" en "/" niet uitmaken.
 */
export function vingerafdruk(titel) {
  return new Set(
    (titel || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOPWOORDEN.has(w)),
  );
}

/** Overlap tussen twee vingerafdrukken: gedeeld / totaal (Jaccard), 0 tot 1. */
export function gelijkenis(a, b) {
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let gedeeld = 0;
  for (const w of a) if (b.has(w)) gedeeld++;
  return gedeeld / (a.size + b.size - gedeeld);
}

/** De vorm waarin een run wordt vastgelegd. Alleen wat stabiel genoeg is om te vergelijken. */
export function maakBaseline(issues = []) {
  const perErnst = {};
  for (const i of issues) perErnst[i.ernst || 'onbekend'] = (perErnst[i.ernst || 'onbekend'] || 0) + 1;
  return {
    aantal:     issues.length,
    perErnst,
    onderwerpen: issues.map(i => ({ onderwerp: i.onderwerp || '', ernst: i.ernst || 'onbekend' })),
  };
}

/**
 * Vergelijkt een run met een baseline.
 *
 * @param {object|null} baseline  uit maakBaseline(), of null als er nog geen is
 * @param {object[]} issues       de bevindingen van deze run
 * @param {number} drempel        vanaf welke overlap twee titels dezelfde bevinding zijn
 * @returns {{
 *   heeftBaseline: boolean, aantalDelta: number, ernstDelta: object,
 *   nieuw: object[], verdwenen: object[], gebleven: number,
 * }}
 */
export function vergelijk(baseline, issues = [], drempel = 0.6) {
  const nu = maakBaseline(issues);
  if (!baseline) {
    return { heeftBaseline: false, aantalDelta: 0, ernstDelta: {}, nieuw: [], verdwenen: [], gebleven: 0 };
  }

  const oud = (baseline.onderwerpen || []).map(o => ({ ...o, vk: vingerafdruk(o.onderwerp) }));
  const nieuwe = nu.onderwerpen.map(o => ({ ...o, vk: vingerafdruk(o.onderwerp) }));

  // Elke oude bevinding mag hoogstens één keer gekoppeld worden, anders telt een
  // run met twee bijna-gelijke titels er ten onrechte één als "gebleven".
  const gekoppeld = new Set();
  const nieuw = [];
  for (const n of nieuwe) {
    let beste = -1, besteScore = 0;
    for (let i = 0; i < oud.length; i++) {
      if (gekoppeld.has(i)) continue;
      const s = gelijkenis(n.vk, oud[i].vk);
      if (s > besteScore) { besteScore = s; beste = i; }
    }
    if (besteScore >= drempel) gekoppeld.add(beste);
    else nieuw.push({ onderwerp: n.onderwerp, ernst: n.ernst });
  }
  const verdwenen = oud
    .filter((_, i) => !gekoppeld.has(i))
    .map(o => ({ onderwerp: o.onderwerp, ernst: o.ernst }));

  const ernstDelta = {};
  for (const e of new Set([...Object.keys(baseline.perErnst || {}), ...Object.keys(nu.perErnst)])) {
    const d = (nu.perErnst[e] || 0) - ((baseline.perErnst || {})[e] || 0);
    if (d !== 0) ernstDelta[e] = d;
  }

  return {
    heeftBaseline: true,
    aantalDelta: nu.aantal - baseline.aantal,
    ernstDelta,
    nieuw,
    verdwenen,
    gebleven: gekoppeld.size,
  };
}

/** Leesbare samenvatting van één fixture, voor de console en het diff-verslag. */
export function verslag(naam, uitkomst) {
  if (!uitkomst.heeftBaseline) {
    return `▸ ${naam}\n    geen baseline — draai \`npm run eval:baseline\` om deze run vast te leggen`;
  }
  const regels = [`▸ ${naam}`];
  const teken = n => (n > 0 ? `+${n}` : `${n}`);
  const ernst = Object.entries(uitkomst.ernstDelta).map(([e, d]) => `${e} ${teken(d)}`).join(', ');
  regels.push(`    ${uitkomst.gebleven} gelijk`
    + `, aantal ${uitkomst.aantalDelta === 0 ? 'onveranderd' : teken(uitkomst.aantalDelta)}`
    + (ernst ? ` (${ernst})` : ''));
  for (const n of uitkomst.nieuw)      regels.push(`    + ${n.ernst.padEnd(6)} ${n.onderwerp}`);
  for (const v of uitkomst.verdwenen)  regels.push(`    - ${v.ernst.padEnd(6)} ${v.onderwerp}`);
  if (!uitkomst.nieuw.length && !uitkomst.verdwenen.length) regels.push('    geen bevinding erbij of eraf');
  return regels.join('\n');
}
