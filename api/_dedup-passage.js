/**
 * api/_dedup-passage.js
 * Vindt issues die dezelfde zin uit het document aanwijzen.
 *
 * Aanleiding (21 augustus 2026): één ouderschapsplan leverde twee issues op over
 * exact dezelfde clausule — "Wel/niet-keuze bij samenwonen nieuwe partner niet
 * ingevuld" en "Vage bewoording 'wel/niet' in herzieningsclausule". Zelfde passage,
 * zelfde ernst, zelfde gebrek, andere woorden.
 *
 * Beide bestaande vangnetten lieten het door:
 *   - `dedupIssues` in index.html sleutelt op de TITEL, en die verschilde.
 *   - De Haiku-consolidatiestap heeft als eerste samenvoegregel "zelfde passage +
 *     zelfde kernprobleem", maar kreeg de passage niet te zien: de invoer was
 *     `[i] (ernst) onderwerp: bevinding(0..150)`. Het criterium verwees naar
 *     gegevens die er niet in stonden.
 *
 * WAAROM HIER NIET AUTOMATISCH WORDT SAMENGEVOEGD
 * De eerste opzet voegde samen bij identieke passage plus voldoende woordoverlap
 * tussen de bevindingen. Gemeten op het echte geval: de overlap was 0,154 — de twee
 * teksten beschrijven hetzelfde gebrek in vrijwel niet-overlappende bewoordingen.
 * Een drempel daaronder leggen zou werken op deze twee waarnemingen en verder
 * nergens op steunen. Semantische gelijkenis herkennen is precies wat een model wel
 * kan en een woordmaat niet.
 *
 * Deze module doet daarom het deel dat wél hard is: vaststellen wélke issues
 * dezelfde zin aanwijzen. Dat oordeel gaat als expliciete aanwijzing mee naar de
 * consolidatiestap, die vervolgens beslist of het één probleem is of twee.
 */

const STOP = new Set([
  'deze', 'wordt', 'worden', 'niet', 'geen', 'maar', 'zijn', 'staat', 'heeft',
  'ouders', 'partijen', 'document', 'clausule', 'bepaling', 'artikel', 'afspraak',
  'afspraken', 'volgens', 'echter', 'daarom', 'hierdoor', 'waardoor', 'omdat',
]);

/** Passages vergelijkbaar maken: kleine letters, geen leestekens, één spatie. */
export function normPassage(p) {
  return (p || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Jaccard-overlap op betekenisdragende woorden — zelfde maat als in schema.test.js. */
export function overlap(a, b) {
  const woorden = (s) => new Set(
    (s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
      .filter(w => w.length > 3 && !STOP.has(w)),
  );
  const wA = woorden(a), wB = woorden(b);
  if (!wA.size || !wB.size) return 0;
  const snede = [...wA].filter(w => wB.has(w)).length;
  return snede / new Set([...wA, ...wB]).size;
}

/**
 * Groepeert de indices van issues die dezelfde niet-lege passage aanwijzen.
 *
 * Lege passages tellen niet mee: die horen bij elk "sectie ontbreekt"-issue, en
 * daarop groeperen zou losstaande omissies op één hoop gooien.
 *
 * @returns {Array<number[]>} groepen van twee of meer indices, in volgorde van voorkomen
 */
export function groepeerOpPassage(issues) {
  if (!Array.isArray(issues)) return [];
  const perPassage = new Map();
  issues.forEach((iss, i) => {
    const p = normPassage(iss?.passage);
    if (!p) return;
    if (!perPassage.has(p)) perPassage.set(p, []);
    perPassage.get(p).push(i);
  });
  return [...perPassage.values()].filter(g => g.length > 1);
}

/**
 * Bouwt de genummerde lijst voor de consolidatiestap.
 *
 * Neemt de passage mee — zonder die was het eerste samenvoegcriterium onbruikbaar —
 * en zet achter elk issue welke andere issues dezelfde zin aanwijzen. Het model
 * hoeft die gelijkenis dan niet zelf uit de tekst af te leiden.
 */
export function bouwConsolidatieLijst(issues) {
  const groepen = groepeerOpPassage(issues);
  const zelfdePassage = new Map();
  for (const groep of groepen) {
    for (const i of groep) zelfdePassage.set(i, groep.filter(j => j !== i));
  }

  return issues.map((iss, i) => {
    const anderen = zelfdePassage.get(i);
    const merk = anderen?.length ? `  ← ZELFDE PASSAGE als ${anderen.map(j => `[${j}]`).join(', ')}` : '';
    const passage = (iss.passage || '').replace(/\s+/g, ' ').slice(0, 200);
    return `[${i}] (${iss.ernst}) ${iss.onderwerp}${merk}\n`
         + (passage ? `    passage: "${passage}"\n` : '')
         + `    bevinding: ${(iss.bevinding || '').replace(/\s+/g, ' ').slice(0, 300)}`;
  }).join('\n\n');
}
