/**
 * src/chips/hml-counts.js
 *
 * Pure hulpfuncties voor H/M/L-tellingen, kop-klassen en donut-gradiënten.
 * Geen DOM-afhankelijkheden — unit-testbaar.
 *
 * Corresponderende code in index.html: herlaadChipTellers, bouwAnalyseHtml,
 * dimKaart, _alleMiniRingHtml, maakGrad (~r4630, ~r5150, ~r5214, ~r10174).
 */

/** Telt issues per ernst-niveau. */
export function telHml(issues) {
  const h   = issues.filter(i => i.ernst === 'hoog').length;
  const m   = issues.filter(i => i.ernst === 'midden').length;
  const l   = issues.filter(i => i.ernst === 'laag').length;
  return { h, m, l, tot: h + m + l };
}

/**
 * Filtert actieve issues: negeer=false én afgehandeld=false.
 * Meest gebruikte pre-stap vóór telHml.
 */
export function filterActief(issues) {
  return issues.filter(i => !i.negeer && !i.afgehandeld);
}

/**
 * Vertaalt H/M/L-counts naar de CSS-klasse voor de chip-kop.
 * @param {{ h: number, m: number, l: number }} counts
 * @returns {'kop-hoog'|'kop-midden'|'kop-laag'|'kop-leeg'}
 */
export function kopKlasse({ h, m, l }) {
  if (h > 0) return 'kop-hoog';
  if (m > 0) return 'kop-midden';
  if (l > 0) return 'kop-laag';
  return 'kop-leeg';
}

/**
 * Bouwt de standaard segment-array voor donut-ringen.
 * @param {{ h: number, m: number, l: number }} counts
 * @returns {{ kleur: string, n: number }[]}
 */
export function hmlSegs({ h, m, l }) {
  return [
    { kleur: '#C82020', n: h },
    { kleur: '#E07200', n: m },
    { kleur: '#2A7260', n: l },
  ];
}

/**
 * Berekent conic-gradient stops voor een gesegmenteerde ring.
 * Geeft de stops-string terug (zonder `conic-gradient(…)` wrapper).
 *
 * @param {{ kleur: string, n: number }[]} segs
 * @returns {string}
 */
export function maakGrad(segs) {
  const som = segs.reduce((a, s) => a + s.n, 0);
  if (som === 0) return 'var(--status-ok) 0deg 360deg';

  const GAP       = 5;
  const stops     = [];
  let   pos       = 0;
  const validSegs = segs.filter(s => s.n > 0);
  const meerdere  = validSegs.length > 1;
  const wrapGap   = meerdere && validSegs[0].kleur !== validSegs[validSegs.length - 1].kleur;

  for (let i = 0; i < validSegs.length; i++) {
    const s  = validSegs[i];
    const d  = (s.n / som) * 360;
    const gb = i === 0                        ? (wrapGap ? GAP / 2 : 0) : GAP / 2;
    const ga = i === validSegs.length - 1     ? (wrapGap ? GAP / 2 : 0) : GAP / 2;
    const vs = pos + gb;
    const ve = pos + d - ga;
    if (gb)     stops.push(`white ${pos}deg ${vs}deg`);
    if (vs < ve) stops.push(`${s.kleur} ${vs}deg ${ve}deg`);
    if (ga)     stops.push(`white ${ve}deg ${pos + d}deg`);
    pos += d;
  }
  return stops.join(',');
}
