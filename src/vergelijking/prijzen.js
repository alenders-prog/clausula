/**
 * src/vergelijking/prijzen.js — vier tarieven per model, voor beide leveranciers
 *
 * ── WAAROM NAAST src/api/kosten.js EN NIET ERIN ─────────────────────────────
 *
 * `kosten.js` rekent met twee tarieven plus twee vaste cachefactoren (lezen 0,1×,
 * schrijven 1,25×). Dat klopt voor Anthropic, waar die factoren voor élk model gelden,
 * en het is de vorm waarin `api_verbruik` al maanden historie heeft staan.
 *
 * Bij OpenAI gaat dat niet op. De gpt-5.6-familie rekent 1,25× voor cache-schrijven,
 * maar de oudere gpt-5.2/5.4/5.5-reeks rekent er niets voor — daar is schrijven
 * hetzelfde als verse invoer. Eén factor over beide leveranciers heen zou dus voor de
 * ene helft fout zijn.
 *
 * Daarom staan hier alle vier de tarieven uitgeschreven, per model. `kosten.js` blijft
 * wat het is: de productieberekening, met zijn eigen historie. `tests/unit/
 * vergelijking-prijzen.test.js` bewaakt dat de Anthropic-rijen hier en daar hetzelfde
 * zeggen — anders drijven twee prijstabellen uit elkaar en is aan geen van beide te zien
 * welke de juiste is.
 *
 * ── PRIJZEN OPZOEKEN, NIET ONTHOUDEN ────────────────────────────────────────
 *
 * Nagekeken 22 september 2026 op:
 *   Anthropic  https://platform.claude.com/docs/en/about-claude/pricing
 *   OpenAI     https://developers.openai.com/api/docs/pricing
 *
 * Een model dat hier niet staat levert "prijs onbekend" op, en dat is de bedoeling.
 * Geen bedrag is beter dan een verzonnen bedrag — zie de noot in `kosten.js` over
 * `claude-sonnet-5`, dat op een afgeblazen prijsverhoging stond en daardoor een derde
 * te hoog was in de tabel waar een leverancierskeuze op zou rusten.
 */

/** Dollar per miljoen tokens. */
export const PRIJZEN = Object.freeze({
  // ── Anthropic ──────────────────────────────────────────────────────────────
  // cacheSchrijf is het 5-minutentarief (1,25×), cacheLees 0,1×.
  'claude-sonnet-4-6':        { vers: 3,    cacheSchrijf: 3.75, cacheLees: 0.30,  uit: 15 },
  'claude-sonnet-5':          { vers: 2,    cacheSchrijf: 2.50, cacheLees: 0.20,  uit: 10 },
  'claude-haiku-4-5':         { vers: 1,    cacheSchrijf: 1.25, cacheLees: 0.10,  uit: 5  },
  'claude-opus-5':            { vers: 5,    cacheSchrijf: 6.25, cacheLees: 0.50,  uit: 25 },

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  // De gpt-5.6-familie en gpt-6 noemen een apart cache-schrijftarief (1,25× de
  // invoerprijs). De oudere reeks doet dat niet: daar is schrijven gelijk aan vers.
  'gpt-5.6-luna':             { vers: 0.20, cacheSchrijf: 0.25, cacheLees: 0.02,  uit: 1.20 },
  'gpt-5.6-terra':            { vers: 2,    cacheSchrijf: 2.50, cacheLees: 0.20,  uit: 12 },
  'gpt-5.6-sol':              { vers: 4,    cacheSchrijf: 5,    cacheLees: 0.40,  uit: 20 },
  'gpt-5.5':                  { vers: 5,    cacheSchrijf: 5,    cacheLees: 0.50,  uit: 30 },
  'gpt-5.4':                  { vers: 2.50, cacheSchrijf: 2.50, cacheLees: 0.25,  uit: 15 },
  'gpt-5.2':                  { vers: 1.75, cacheSchrijf: 1.75, cacheLees: 0.175, uit: 14 },
});

/**
 * Modelnaam terugbrengen tot een rij in de tabel.
 *
 * Beide leveranciers hangen er datums aan — `claude-sonnet-4-6-20260101` bij de een,
 * `gpt-5.5-2026-04-23` bij de ander. Twee vormen, dus twee afkappingen.
 */
export function normaliseerModel(model) {
  const m = String(model ?? '').trim();
  if (PRIJZEN[m]) return m;
  for (const zonder of [m.replace(/-\d{8}$/, ''), m.replace(/-\d{4}-\d{2}-\d{2}$/, '')]) {
    if (PRIJZEN[zonder]) return zonder;
  }
  return m;
}

/** Of we voor dit model een prijs hebben. */
export const prijsBekend = (model) => PRIJZEN[normaliseerModel(model)] !== undefined;

/**
 * Wat één aanroep kostte, in dollar. `null` als de prijs onbekend is.
 *
 * @param {string} model
 * @param {{vers:number, cacheSchrijf:number, cacheLees:number, uit:number}} verbruik
 *   de genormaliseerde tellingen uit `leverancier.js`
 */
export function kosten(model, verbruik) {
  const p = PRIJZEN[normaliseerModel(model)];
  if (!p || !verbruik) return null;
  return (
    (verbruik.vers ?? 0)         * p.vers +
    (verbruik.cacheSchrijf ?? 0) * p.cacheSchrijf +
    (verbruik.cacheLees ?? 0)    * p.cacheLees +
    (verbruik.uit ?? 0)          * p.uit
  ) / 1e6;
}

/**
 * Hoe de rekening is opgebouwd. Los van `kosten` omdat de verdeling zelf de uitkomst is
 * die je wilt zien: de tweede wet van deze pijplijn zegt dat kosten invoer zijn, en dat
 * is alleen te controleren als invoer en uitvoer apart op tafel liggen.
 */
export function verdeling(model, verbruik) {
  const p = PRIJZEN[normaliseerModel(model)];
  if (!p || !verbruik) return null;
  return {
    vers:         (verbruik.vers ?? 0)         * p.vers         / 1e6,
    cacheSchrijf: (verbruik.cacheSchrijf ?? 0) * p.cacheSchrijf / 1e6,
    cacheLees:    (verbruik.cacheLees ?? 0)    * p.cacheLees    / 1e6,
    uit:          (verbruik.uit ?? 0)          * p.uit          / 1e6,
  };
}
