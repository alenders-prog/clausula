/**
 * src/dashboard/statistieken.js — van bewaarde screeningen naar dashboardcijfers
 *
 * Pure functies: erin gaan de rijen zoals ze uit Supabase komen, eruit komt het object
 * dat het dashboard tekent. Geen netwerk, geen DOM — daarmee is elk cijfer op het
 * scherm hier na te rekenen zonder database.
 *
 * Waarom in de browser en niet in een database-functie: het scheelt een migratie die
 * vóór de uitrol moet draaien, en het rekenwerk is klein. De periodefilter zit in de
 * query, dus er komt hooguit een kwartaal aan rapporten binnen.
 *
 * VORMEN DIE BINNENKOMEN. `screeningen.rapport` is niet één ding:
 *   { issues: [...], mfn_score: {...} }                       — één document
 *   { documenten: [ { issues, mfn_score, doc_type }, ... ] }  — meerdere
 * Alles hieronder gaat door `documentenVan()`, zodat die tweevorm op één plek zit.
 */
import { berekenGemiddeldeScore } from '../rapport/score.js';

/** De vijf dimensies die een bevinding kan hebben. MfN staat hier bewust niet bij. */
export const CATEGORIEEN = ['juridisch', 'volledigheid', 'balans', 'conflicten', 'grammatica'];
export const ERNSTEN     = ['hoog', 'midden', 'laag'];

/** Het aantal MfN-elementen per documenttype. Spiegelt MFN_ELEMENTEN in index.html. */
export const MFN_TOTAAL = { convenant: 15, ouderschapsplan: 12 };

/** Documenten uit een rapport, of het rapport zelf als er geen documenten-array is. */
export function documentenVan(rapport) {
  if (!rapport) return [];
  if (Array.isArray(rapport.documenten)) return rapport.documenten.filter(Boolean);
  return [rapport];
}

/** Het documenttype van één document, met de classificatie van de screening als terugval. */
export function typeVanDocument(doc, screening) {
  return doc?.doc_type || doc?.type || screening?.classificatie?.doc_type || 'onbekend';
}

/**
 * De documenten van een screening die bij het gekozen documenttype horen.
 *
 * Filteren gebeurt op DOCUMENT-niveau en niet op screening-niveau: één analyse kan een
 * convenant én een ouderschapsplan bevatten, en die hebben elk hun eigen bevindingen.
 * Op screening filteren zou bij zo'n dossier beide stukken meenemen of geen van beide.
 *
 * Een document zonder herkenbaar type telt alleen mee onder "alle". Meenemen onder een
 * specifiek type zou het cijfer stilletjes laten kloppen met iets anders dan het label
 * belooft.
 */
export function documentenVoorType(screening, docType = 'alle') {
  const docs = documentenVan(screening?.rapport);
  if (docType === 'alle') return docs;
  return docs.filter(d => typeVanDocument(d, screening) === docType);
}

/** Alle bevindingen uit een rapport, over de documenten heen. */
export function issuesVan(rapport) {
  return documentenVan(rapport).flatMap(d => Array.isArray(d?.issues) ? d.issues : []);
}

/** Bevindingen van één screening, beperkt tot het gekozen documenttype. */
export function issuesVoorType(screening, docType = 'alle') {
  return documentenVoorType(screening, docType)
    .flatMap(d => Array.isArray(d?.issues) ? d.issues : []);
}

/** Telling per ernst, voor de voor/na-ringen. */
export function telErnst(issues) {
  const t = { hoog: 0, midden: 0, laag: 0, totaal: 0 };
  for (const i of issues || []) {
    const e = ERNSTEN.includes(i?.ernst) ? i.ernst : 'midden';
    t[e]++; t.totaal++;
  }
  return t;
}

/**
 * Een bevinding telt als AFGEVINKT wanneer de mediator hem heeft afgehandeld.
 * Genegeerd is iets anders en telt hier NIET mee: afgevinkt zegt "verwerkt",
 * genegeerd zegt "dit klopte niet". Ze optellen wist precies het signaal waarmee je
 * de kwaliteit van de screening zelf in de gaten houdt.
 */
export const isAfgevinkt = (iss) => iss?.afgehandeld === true && iss?.negeer !== true;
export const isGenegeerd = (iss) => iss?.negeer === true;

/** De zwaarste categorie van een bevinding, voor de indeling in de tabel. */
export function hoofdCategorie(iss) {
  const dims = Array.isArray(iss?.dimensies) ? iss.dimensies : [];
  for (const c of CATEGORIEEN) if (dims.includes(c)) return c;
  // cross_doc is geen eigen rij in de tabel — het is een juridische bevinding die
  // tussen twee documenten zichtbaar werd.
  if (dims.includes('cross_doc')) return 'juridisch';
  return 'volledigheid';
}

/** Lege telling per categorie en ernst. */
function legeCategorieTelling() {
  return CATEGORIEEN.map(naam => ({
    naam, hoog: 0, midden: 0, laag: 0, totaal: 0, afgevinkt: 0,
  }));
}

/**
 * Bouwt alle dashboardcijfers.
 *
 * @param {object} invoer
 * @param {Array} invoer.dossiers    rijen uit `dossiers` — {id, status}
 * @param {Array} invoer.screeningen rijen uit `screeningen` — {dossier_id, versie_nr, rapport, created_at}
 */
export function bouwStatistieken({ dossiers = [], screeningen = [], docType = 'alle' } = {}) {
  const perCategorie = legeCategorieTelling();
  const catIndex = Object.fromEntries(perCategorie.map(r => [r.naam, r]));
  const ernst = { hoog: 0, midden: 0, laag: 0, totaal: 0, openHoog: 0 };

  let gesignaleerd = 0, afgevinkt = 0, genegeerd = 0;
  const perOnderwerp = new Map();   // titel → { aantal, dossiers:Set, afgevinkt }
  const mfn = {};                   // doc_type → tellers
  const perDossier = new Map();     // dossier_id → screenings, gesorteerd op versie
  const alleIssues = [];            // voor de voor/na-ringen

  for (const s of screeningen) {
    if (!perDossier.has(s.dossier_id)) perDossier.set(s.dossier_id, []);
    perDossier.get(s.dossier_id).push(s);

    for (const iss of issuesVoorType(s, docType)) {
      gesignaleerd++;
      alleIssues.push(iss);
      const cat = hoofdCategorie(iss);
      const e   = ERNSTEN.includes(iss?.ernst) ? iss.ernst : 'midden';
      catIndex[cat][e]++;
      catIndex[cat].totaal++;
      ernst[e]++;
      ernst.totaal++;

      if (isAfgevinkt(iss)) { afgevinkt++; catIndex[cat].afgevinkt++; }
      else if (isGenegeerd(iss)) genegeerd++;
      else if (e === 'hoog') ernst.openHoog++;

      const titel = String(iss?.onderwerp || '').trim();
      if (titel) {
        if (!perOnderwerp.has(titel)) perOnderwerp.set(titel, { onderwerp: titel, aantal: 0, dossiers: new Set(), afgevinkt: 0 });
        const r = perOnderwerp.get(titel);
        r.aantal++;
        r.dossiers.add(s.dossier_id);
        if (isAfgevinkt(iss)) r.afgevinkt++;
      }
    }

    // MfN per documenttype. score_totaal komt uit het rapport zelf; ontbreekt hij,
    // dan de vaste waarde per type — nooit het aantal elementen in de lijst, want een
    // afgekapte lijst zou de noemer stilletjes verkleinen en de score opblazen.
    for (const doc of documentenVoorType(s, docType)) {
      const m = doc?.mfn_score;
      if (!m?.elementen?.length) continue;
      const type = typeVanDocument(doc, s);
      const tot  = m.score_totaal || MFN_TOTAAL[type] || m.elementen.length;
      if (!mfn[type]) mfn[type] = { doc_type: type, documenten: 0, totaal: tot, aanwezig: 0, onvolledig: 0, ontbreekt: 0, extra: 0 };
      mfn[type].documenten++;
      mfn[type].aanwezig   += m.elementen.filter(x => x.status === 'aanwezig').length;
      mfn[type].onvolledig += m.elementen.filter(x => x.status === 'onvolledig').length;
      mfn[type].ontbreekt  += m.elementen.filter(x => x.status === 'ontbreekt').length;
      mfn[type].extra      += (m.extra_elementen || []).length;
    }
  }

  // Gemiddelden per document, en het percentage aanwezig.
  const mfnLijst = Object.values(mfn).map(m => ({
    ...m,
    gemAanwezig:   m.documenten ? m.aanwezig   / m.documenten : 0,
    gemOnvolledig: m.documenten ? m.onvolledig / m.documenten : 0,
    gemOntbreekt:  m.documenten ? m.ontbreekt  / m.documenten : 0,
    pctAanwezig:   m.documenten && m.totaal ? Math.round(m.aanwezig / (m.documenten * m.totaal) * 100) : 0,
  }));

  return {
    kpi: {
      actief:       dossiers.filter(d => d?.status === 'actief').length,
      afgerond:     dossiers.filter(d => d?.status === 'afgerond').length,
      analyses:     screeningen.length,
      gesignaleerd,
      afgevinkt,
      genegeerd,
      ...scoreTraject(perDossier),
    },
    perCategorie: perCategorie.map(r => ({
      ...r, afgevinktPct: r.totaal ? Math.round(r.afgevinkt / r.totaal * 100) : 0,
    })),
    ernst,
    ernstVoorNa: bouwVoorNa(alleIssues),
    mfn: mfnLijst,
    verloop: bouwVerloop(perDossier, docType),
    topIssues: [...perOnderwerp.values()]
      .sort((a, b) => b.aantal - a.aantal)
      .slice(0, 8)
      .map(r => ({
        onderwerp: r.onderwerp, aantal: r.aantal, dossiers: r.dossiers.size,
        afgevinktPct: r.aantal ? Math.round(r.afgevinkt / r.aantal * 100) : 0,
      })),
  };
}

/**
 * De documentscore van de eerste versus de laatste versie, gemiddeld over de dossiers
 * die meer dan één versie hebben.
 *
 * Alleen die dossiers: bij één versie is er geen "daarna" en zou het traject een
 * verbetering van nul suggereren die er niet is. Dat verwatert het cijfer met precies
 * de dossiers waarover het niets zegt.
 */
export function scoreTraject(perDossier) {
  const eerste = [], laatste = [];
  for (const rijen of perDossier.values()) {
    if (rijen.length < 2) continue;
    const op = [...rijen].sort((a, b) => (a.versie_nr ?? 0) - (b.versie_nr ?? 0));
    const s1 = gemiddeldeOverDocumenten(op[0].rapport);
    const s2 = gemiddeldeOverDocumenten(op[op.length - 1].rapport);
    if (s1 === null || s2 === null) continue;
    eerste.push(s1); laatste.push(s2);
  }
  const gem = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
  return { scoreEerste: gem(eerste), scoreLaatste: gem(laatste), scoreDossiers: eerste.length };
}

function gemiddeldeOverDocumenten(rapport) {
  const scores = documentenVan(rapport).map(berekenGemiddeldeScore).filter(s => s !== null);
  if (!scores.length) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/**
 * Wat is er van de bevindingen van versie 1 geworden in de laatste versie?
 *
 * Vier uitkomsten, en het onderscheid tussen de eerste twee is het hele punt:
 *   opgelost   — stond in v1, staat niet meer in de laatste versie
 *   genegeerd  — de mediator markeerde hem als niet van toepassing
 *   blijft     — stond in v1 en staat er nog steeds
 *   nieuw      — staat alleen in de laatste versie; ontstaan bij het herschrijven
 *
 * Dat laatste getal is onzichtbaar in een simpele vergelijking van twee aantallen, en
 * juist daar zit het risico: een herziening kan problemen introduceren.
 *
 * Vergelijken gebeurt op de titel. Die komt van een taalmodel en varieert, dus een
 * herformulering telt hier als "opgelost én nieuw". Dat is bekend en aanvaard: bij
 * tientallen dossiers middelt het uit, en het alternatief — vergelijken op passage —
 * is aantoonbaar slechter (37 paren delen dezelfde passage, zie schema.test.js).
 */
/**
 * Gevonden tegenover nog open — dezelfde vergelijking die op een dossierkaart staat.
 *
 * Die kaart zet twee ringen naast elkaar met een pijl: links alles wat de screening
 * vond, rechts wat daarvan nog openstaat. Het is een ZELFVERGELIJKING binnen één
 * analyse, niet een vergelijking tussen twee versies.
 *
 * Dat onderscheid heb ik eerst verkeerd gehad. Versies vergelijken klinkt logischer,
 * maar het meeste werk gebeurt binnen één versie: de mediator loopt de bevindingen af
 * en vinkt ze weg. Bij een kantoor waar de meeste dossiers één analyse hebben, blijft
 * een versievergelijking daarom altijd leeg — terwijl er wel degelijk voortgang is.
 *
 * Links tellen de genegeerde punten MEE, precies zoals op de kaart: het "voor"-totaal
 * hoort te kloppen met wat de mediator bij de analyse zag. Rechts vallen ze weg, samen
 * met de afgevinkte.
 */
export function bouwVoorNa(alleIssues) {
  const voor = alleIssues || [];
  const na   = voor.filter(i => !isGenegeerd(i) && !isAfgevinkt(i));
  return { voor: telErnst(voor), na: telErnst(na), beoordeeld: voor.length - na.length };
}

export function bouwVerloop(perDossier, docType = 'alle') {
  let opgelost = 0, genegeerdT = 0, blijft = 0, nieuw = 0, v1 = 0, v2 = 0, dossiers = 0;

  for (const rijen of perDossier.values()) {
    if (rijen.length < 2) continue;
    const op = [...rijen].sort((a, b) => (a.versie_nr ?? 0) - (b.versie_nr ?? 0));
    const eerste  = issuesVoorType(op[0], docType);
    const laatste = issuesVoorType(op[op.length - 1], docType);
    if (!eerste.length && !laatste.length) continue;
    dossiers++;
    v1 += eerste.length;
    v2 += laatste.length;

    const titelsLaatst = new Set(laatste.map(i => String(i?.onderwerp || '').trim().toLowerCase()));
    const titelsEerst  = new Set(eerste.map(i => String(i?.onderwerp || '').trim().toLowerCase()));

    for (const i of eerste) {
      const t = String(i?.onderwerp || '').trim().toLowerCase();
      if (isGenegeerd(i)) genegeerdT++;
      else if (titelsLaatst.has(t)) blijft++;
      else opgelost++;
    }
    for (const i of laatste) {
      if (!titelsEerst.has(String(i?.onderwerp || '').trim().toLowerCase())) nieuw++;
    }
  }

  return { opgelost, genegeerd: genegeerdT, blijft, nieuw, v1, v2, dossiers };
}
