/**
 * src/rapport/consolidatie-grens.js — de ondergrens onder de deduplicatie
 *
 * ── AANLEIDING (6 september 2026) ───────────────────────────────────────────
 *
 * Uit de serverlog van een echte analyse:
 *
 *     [analyseer] consolidatie doc#699d4e73.pdf: 5 van 19 duplicaat(en) verwijderd
 *       weg: laag   Spaarrekening-sectie bevat taalfout ('beheer wordtgekregen')
 *       weg: laag   Aaneengeschreven woorden "wordtgekregen" in artikel 21
 *
 * Twee kaarten over dezelfde tikfout, en **allebei** weggegooid. Dat is geen ontdubbeling
 * meer: van een groep duplicaten hoort er één te blijven staan, niet nul.
 *
 * Het gevolg was groter dan één gemiste tikfout. Er is die dag een halve dag besteed aan de
 * vraag waarom het model `wordtgekregen` niet vond — de prompt aangescherpt, de aanroep
 * gesplitst, drie meetronden gedraaid — terwijl het model hem gewoon vond en de
 * consolidatie hem weghaalde. De meting mat niet wat het model vindt, maar wat de
 * consolidatie laat staan.
 *
 * ── DE REGEL ────────────────────────────────────────────────────────────────
 *
 * **Van elke passage moet minstens één issue overleven.** Ook als er maar één issue naar
 * die zin verwijst — dan is die ene het hele groepje, en verdwijnt hij dus niet.
 *
 * Let op: dat is BREDER dan alleen het geval uit de log. Bij het ontwerp is eerst de smalle
 * variant beschreven (alleen groepen van twee of meer), en gemeten is de brede. Wat die
 * breedte kost is zichtbaar: over drie runs elf herstellingen, waarvan de meeste terecht —
 * een nihilbeding-bevinding en vijf kaarten over herhaalde zinnen bij verschillende
 * bankrekeningen. Het aantal bevindingen ging daardoor van ~35 naar ~39 per run.
 *
 * De grens raakt bewust geen issues ZONDER passage. De consolidatieprompt beschrijft juist
 * het geval waarin twee kaarten over hetzelfde gemis gaan terwijl de ene geen passage heeft
 * en de andere een naburige zin aanwijst: *"een gebrek heeft van nature geen eigen zin"*.
 * Die beoordeling blijft bij het model — anders zou deze grens de consolidatie grotendeels
 * uitschakelen.
 *
 * Wil je alsnog de smalle variant: sla in de lus hieronder de groepen met lengte 1 over.
 * Dan verdwijnt de bescherming van bevindingen die als enige naar hun zin verwijzen.
 *
 * ── WELKE BLIJFT ────────────────────────────────────────────────────────────
 *
 * Dezelfde volgorde die de prompt zelf voorschrijft: het exemplaar met een wetsverwijzing,
 * anders dat met de hoogste ernst, anders het meest uitgewerkte.
 */

const ERNST_RANG = { hoog: 0, midden: 1, laag: 2 };

/** Passages vergelijkbaar maken: kleine letters, witruimte gelijk. */
const kaal = (p) => String(p ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Verwijst dit issue naar een wetsartikel? Dat maakt het het meest informatieve exemplaar. */
const heeftWet = (i) => /\bart(?:ikel)?\.?\s*\d|\bbw\b|\brv\b|\bwvps\b/i.test(
  `${i?.onderwerp ?? ''} ${i?.bevinding ?? ''} ${i?.aanbeveling ?? ''}`);

/** Welke van een groep verdient het om te blijven? Lager is beter. */
function rang(issue) {
  return [
    heeftWet(issue) ? 0 : 1,
    ERNST_RANG[issue?.ernst] ?? 3,
    -(String(issue?.bevinding ?? '').length),   // meer uitwerking wint
  ];
}

function beter(a, b) {
  const ra = rang(a), rb = rang(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] < rb[i];
  return false;
}

/**
 * Vult de door de consolidatie gekozen indices aan waar een hele passagegroep zou verdwijnen.
 *
 * @param {Array} alleIssues        de issues zoals ze aan de consolidatie zijn aangeboden
 * @param {Iterable<number>} teBewaren  indices die de consolidatie wil bewaren
 * @returns {{indices: Set<number>, hersteld: Array<{index: number, onderwerp: string}>}}
 */
export function beschermPassagegroepen(alleIssues, teBewaren) {
  const bewaard = new Set([...(teBewaren ?? [])].filter((i) => Number.isInteger(i)));
  const hersteld = [];
  if (!Array.isArray(alleIssues) || alleIssues.length === 0) return { indices: bewaard, hersteld };

  // Groeperen op passage; issues zonder passage doen niet mee — daar is de passage
  // volgens de prompt zelf geen bruikbaar onderscheid.
  const groepen = new Map();
  alleIssues.forEach((issue, i) => {
    const p = kaal(issue?.passage);
    if (!p) return;
    if (!groepen.has(p)) groepen.set(p, []);
    groepen.get(p).push(i);
  });

  for (const indices of groepen.values()) {
    if (indices.some((i) => bewaard.has(i))) continue;   // er blijft er al één staan
    let winnaar = indices[0];
    for (const i of indices) if (beter(alleIssues[i], alleIssues[winnaar])) winnaar = i;
    bewaard.add(winnaar);
    hersteld.push({ index: winnaar, onderwerp: alleIssues[winnaar]?.onderwerp ?? '(zonder titel)' });
  }

  return { indices: bewaard, hersteld };
}
