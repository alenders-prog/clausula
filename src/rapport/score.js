/**
 * src/rapport/score.js — de gewogen kwaliteitsscore van één documentrapport
 *
 * Stond tot 26 augustus 2026 in index.html. Verhuisd omdat het dashboard hem nodig
 * heeft: de aggregatie over alle dossiers rekent met dezelfde score als de chip op een
 * dossierkaart, en twee kopieën van een scoreformule lopen gegarandeerd uiteen.
 *
 * De verhuizing levert bovendien tests op voor een formule die er geen had — en het is
 * een formule waar het op aankomt: hij bepaalt het cijfer dat een mediator aan zijn
 * cliënt laat zien.
 *
 * WAT DE SCORE MEET: wat er in dít rapport nog aan bevindingen staat, gewogen naar
 * dimensie en ernst. Níét of iemand een bevinding heeft afgevinkt — dat is een los
 * gegeven (`issue.afgehandeld`). Wie alles afvinkt zonder het document te wijzigen,
 * ziet deze score niet bewegen. Dat verschil is opzet.
 */

/**
 * Een juridisch of conflictpunt weegt vier keer zo zwaar als een grammaticapunt.
 * cross_doc telt mee als juridisch: een tegenstrijdigheid tussen twee stukken is
 * even ernstig als een fout binnen één stuk.
 */
export const GEWICHT = {
  juridisch: 2.0, conflicten: 2.0, cross_doc: 2.0,
  volledigheid: 1.0, balans: 1.0, grammatica: 0.5,
};

/** Een hoog punt trekt de score naar nul; een laag punt raakt hem niet. */
export const ERNST_SCORE = { laag: 1, midden: 0.5, hoog: 0 };

/**
 * @param {object} drp  het rapport van ÉÉN document (bij multi-doc: rapport.documenten[i])
 * @returns {number|null} 0–100, of null als er niets te scoren valt
 */
export function berekenGemiddeldeScore(drp) {
  if (!drp) return null;

  // Schema v2: gewogen score op basis van issues[]. MfN telt hier NIET mee — dat heeft
  // een eigen schaal (aanwezig/onvolledig/ontbreekt) en een eigen noemer per
  // documenttype, en optellen bij een ernstschaal levert een getal zonder betekenis.
  if (Array.isArray(drp.issues)) {
    const issues = drp.issues;
    if (!issues.length) return 100;
    let somW = 0, somV = 0;
    for (const iss of issues) {
      // Meerdere dimensies: de zwaarste telt. Een bevinding die zowel juridisch als
      // grammaticaal is, is een juridische bevinding.
      const dims = Array.isArray(iss.dimensies) && iss.dimensies.length
        ? iss.dimensies : ['volledigheid'];
      const w = Math.max(...dims.map(d => GEWICHT[d] ?? 1.0));
      somV += (ERNST_SCORE[iss.ernst] ?? 0.5) * w;
      somW += w;
    }
    return somW > 0 ? Math.round(somV / somW * 100) : 100;
  }

  // Oud schema — rapporten van vóór de overgang naar issues[]. Blijft staan zolang er
  // bewaarde screeningen zijn die er nog zo uitzien.
  const scores = [];

  const vol = drp.volledigheid || [];
  if (vol.length) {
    const som = vol.reduce((a, v) =>
      a + (v.status === 'aanwezig' ? 1 : v.status === 'gedeeltelijk' ? 0.5 : 0), 0);
    scores.push(som / vol.length);
  }

  const jur = drp.juridisch || [];
  if (jur.length) {
    const som = jur.reduce((a, j) => a + (ERNST_SCORE[j.ernst] ?? 0), 0);
    scores.push(som / jur.length);
  } else {
    scores.push(1.0);
  }

  const bal = drp.balans || [];
  if (bal.length) {
    const som = bal.reduce((a, b) => a + (ERNST_SCORE[b.ernst] ?? 0), 0);
    scores.push(som / bal.length);
  } else {
    scores.push(1.0);
  }

  const gram = drp.grammatica;
  if (Array.isArray(gram)) scores.push(Math.max(0, 1 - gram.length / 10));

  const mfn = drp.mfn_score;
  if (mfn?.elementen?.length) {
    const tot  = mfn.elementen.length;
    const aanw = mfn.elementen.filter(e => e.status === 'aanwezig').length;
    scores.push(aanw / tot);
  }

  if (!scores.length) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100);
}

/**
 * De score van een héél rapport, ook als het meerdere documenten bevat.
 *
 * Bij multi-doc pakt de dossierkaart `rapport.documenten[0]` — het primaire document.
 * Voor het dashboard is dat te smal: een dossier met een convenant van 95% en een
 * ouderschapsplan van 60% zou als 95% meetellen. Hier het gemiddelde over de
 * documenten die een score opleveren.
 */
export function rapportScore(rapport) {
  if (!rapport) return null;
  // Een LEGE documenten-array is geen reden om op het rapport zelf terug te vallen.
  // Deed hij dat wel, dan liep zo'n rapport door de oude-schema-tak en kwam eruit als
  // 100 — "perfect" voor een rapport zonder documenten, wat in een gemiddelde over
  // dossiers de cijfers omhoog trekt. Geen documenten is geen score.
  const docs = Array.isArray(rapport.documenten) ? rapport.documenten : [rapport];
  const scores = docs.map(berekenGemiddeldeScore).filter(s => s !== null);
  if (!scores.length) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}
