/**
 * src/dashboard/feiten-statistiek.js — dashboardcijfers uit `analyse_feiten`
 *
 * Zelfde uitvoer als bouwStatistieken() in statistieken.js, andere bron. Daardoor hoeft
 * het scherm niets te weten van waar de cijfers vandaan komen.
 *
 * WAAROM TWEE BRONNEN NAAST ELKAAR:
 *
 *   screeningen   wat er NU is. Verdwijnt als een dossier wordt verwijderd.
 *                 Heeft issue-titels, dus de top-lijst en het verloop tussen versies
 *                 kunnen alleen hieruit komen.
 *   analyse_feiten wat er OOIT is gedaan. Blijft staan na verwijdering.
 *                 Heeft geen titels — dat is opzet, zie docs/avg-verwerkersovereenkomst.md.
 *
 * Het dashboard gebruikt de feiten voor de tellingen en de screeningen voor de twee
 * blokken die tekst nodig hebben. Die verdeling is geen compromis maar de enige die
 * klopt: titels horen niet in een tabel die na een verwijderverzoek blijft staan.
 *
 * WAT ER NIET UIT FEITEN KAN, en waarom dat goed is:
 *   - top terugkerende punten — vraagt titels
 *   - verloop tussen versies   — vergelijkt titels tussen twee versies
 * Die twee vult het dashboard aan uit de live-berekening.
 */
import { CATEGORIEEN, MFN_TOTAAL } from './statistieken.js';

/** Lege telling per categorie, in de vorm die het scherm verwacht. */
function legeCategorieen() {
  return CATEGORIEEN.map(naam => ({ naam, hoog: 0, midden: 0, laag: 0, totaal: 0, afgevinkt: 0 }));
}

const som = (rijen, veld) => rijen.reduce((a, r) => a + (r?.[veld] ?? 0), 0);

/**
 * @param {object} invoer
 * @param {Array} invoer.dossiers  rijen uit `dossiers` — voor actief/afgerond, want dat
 *                                 is per definitie de huidige stand
 * @param {Array} invoer.feiten    rijen uit `analyse_feiten`
 * @param {string} invoer.docType  'alle' | 'convenant' | 'ouderschapsplan'
 */
export function statistiekenUitFeiten({ dossiers = [], feiten = [], docType = 'alle' } = {}) {
  // Filteren op documenttype. Sinds 8 september 2026 draagt elke feitregel precies één
  // type, dus een gewone gelijkheid volstaat — en dezelfde die mfnUitFeiten al deed.
  //
  // Hier stond `doc_type.split('+').includes(docType)`, omdat een regel toen de typen
  // van een hele analyse droeg ('convenant+ouderschapsplan'). Dat hield bij een
  // gecombineerde analyse de héle regel, inclusief de bevindingen van het andere stuk:
  // het staafdiagram bewoog dan niet en de keuze deed zichtbaar niets.
  //
  // Regels van vóór die datum kunnen nog een samengesteld type dragen. Die vallen nu
  // onder geen van beide typen, en dat is de eerlijke uitkomst: hun verdeling over de
  // twee stukken is werkelijk onbekend. Onder "Alle" tellen ze gewoon mee.
  const rijen = docType === 'alle'
    ? feiten
    : feiten.filter(r => r?.doc_type === docType);

  const perCategorie = legeCategorieen();
  const catIndex = Object.fromEntries(perCategorie.map(r => [r.naam, r]));
  for (const r of rijen) {
    for (const [naam, t] of Object.entries(r?.per_categorie || {})) {
      const rij = catIndex[naam];
      if (!rij) continue;
      rij.hoog   += t?.h ?? 0;
      rij.midden += t?.m ?? 0;
      rij.laag   += t?.l ?? 0;
    }
  }
  for (const rij of perCategorie) rij.totaal = rij.hoog + rij.midden + rij.laag;

  const gesignaleerd = som(rijen, 'issues_totaal');
  const afgevinkt    = som(rijen, 'afgevinkt');
  const genegeerd    = som(rijen, 'genegeerd');

  const ernst = {
    hoog:   som(rijen, 'hoog'),
    midden: som(rijen, 'midden'),
    laag:   som(rijen, 'laag'),
    totaal: gesignaleerd,
    openHoog: som(rijen, 'open_hoog'),
  };

  // De categorietabel toont een afgevinkt-percentage per rij. De feitentabel telt
  // afgevinkt niet per categorie — dat zou vijftien extra kolommen zijn voor een
  // percentage. Het totaal verdelen we naar rato, en dat is een SCHATTING; daarom
  // staat het percentage alleen op de totaalregel als er niets te verdelen valt.
  const verhouding = gesignaleerd ? afgevinkt / gesignaleerd : 0;
  for (const rij of perCategorie) {
    rij.afgevinkt = Math.round(rij.totaal * verhouding);
    rij.afgevinktPct = rij.totaal ? Math.round(verhouding * 100) : 0;
  }

  const open = { hoog: ernst.openHoog, midden: som(rijen, 'open_midden'), laag: som(rijen, 'open_laag') };
  const openTotaal = open.hoog + open.midden + open.laag;

  return {
    bron: 'feiten',
    kpi: {
      actief:   dossiers.filter(d => d?.status === 'actief').length,
      afgerond: dossiers.filter(d => d?.status === 'afgerond').length,
      // Eén analyse kan meerdere regels hebben (één per documenttype), dus tellen op
      // screening_id en niet op rijen. Deed dat laatste, dan zou "Analyses uitgevoerd"
      // verdubbelen bij een dossier met een convenant én een ouderschapsplan.
      analyses: new Set(rijen.map(r => r?.screening_id).filter(Boolean)).size,
      gesignaleerd, afgevinkt, genegeerd,
      ...scoreTrajectUitFeiten(rijen),
    },
    perCategorie,
    ernst,
    ernstVoorNa: {
      voor: { ...{ hoog: ernst.hoog, midden: ernst.midden, laag: ernst.laag }, totaal: gesignaleerd },
      na:   { ...open, totaal: openTotaal },
      beoordeeld: gesignaleerd - openTotaal,
    },
    mfn: mfnUitFeiten(rijen, docType),
    // Deze twee kunnen niet uit de feiten komen: ze hebben issue-titels nodig. Het
    // dashboard vult ze aan uit de live-berekening; blijft dat uit, dan meldt het
    // scherm netjes dat er niets is in plaats van iets onwaars te tonen.
    verloop: null,
    topIssues: [],
  };
}

/**
 * De documentscore van de eerste versus de laatste versie per dossier.
 *
 * Groepeert op `dossier_sleutel` — die blijft staan als het dossier is verwijderd, dus
 * ook een opgeruimd dossier levert nog een traject op. Dat is precies waarvoor de tabel
 * bestaat.
 */
export function scoreTrajectUitFeiten(rijen) {
  const perDossier = new Map();
  for (const r of rijen) {
    if (!r?.dossier_sleutel || r.score === null || r.score === undefined) continue;
    if (!perDossier.has(r.dossier_sleutel)) perDossier.set(r.dossier_sleutel, []);
    perDossier.get(r.dossier_sleutel).push(r);
  }

  const eerste = [], laatste = [];
  for (const groep of perDossier.values()) {
    if (groep.length < 2) continue;
    const op = [...groep].sort((a, b) => (a.versie_nr ?? 0) - (b.versie_nr ?? 0));
    eerste.push(op[0].score);
    laatste.push(op[op.length - 1].score);
  }
  const gem = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
  return { scoreEerste: gem(eerste), scoreLaatste: gem(laatste), scoreDossiers: eerste.length };
}

/**
 * MfN per documenttype.
 *
 * Sinds 8 september 2026 draagt een feitregel één documenttype, met de noemer van dát
 * type. Filteren is daarmee een gewone gelijkheid en de noemer klopt met het label.
 *
 * Daarvóór telde een regel de MfN-scores van álle documenten in een analyse bij elkaar
 * op, noemer incluis: bij een gecombineerde analyse stond er 27 (15 + 12) en was niet
 * meer uiteen te halen wat van welk stuk kwam. Zulke oude regels dragen nog een
 * samengesteld type ('convenant+ouderschapsplan') en vallen daarom buiten elk van beide
 * keuzes — terecht, want hun verdeling is werkelijk onbekend.
 */
export function mfnUitFeiten(rijen, docType = 'alle') {
  const bruikbaar = rijen.filter(r => r?.mfn_totaal);
  const gekozen = docType === 'alle'
    ? bruikbaar
    : bruikbaar.filter(r => r.doc_type === docType);
  if (!gekozen.length) return [];

  const documenten = gekozen.length;
  const totaal = Math.round(som(gekozen, 'mfn_totaal') / documenten);
  const aanwezig = som(gekozen, 'mfn_aanwezig');

  return [{
    doc_type: docType === 'alle' ? 'alle' : docType,
    documenten,
    totaal,
    aanwezig,
    onvolledig: som(gekozen, 'mfn_onvolledig'),
    ontbreekt:  som(gekozen, 'mfn_ontbreekt'),
    extra:      som(gekozen, 'mfn_extra'),
    gemAanwezig:   aanwezig / documenten,
    gemOnvolledig: som(gekozen, 'mfn_onvolledig') / documenten,
    gemOntbreekt:  som(gekozen, 'mfn_ontbreekt')  / documenten,
    pctAanwezig: totaal ? Math.round(aanwezig / (documenten * totaal) * 100) : 0,
  }];
}

/**
 * Hoeveel van deze feitregels horen bij een screening die niet meer bestaat?
 *
 * Het verschil tussen "wat er nu is" en "wat er ooit is gedaan" hoort zichtbaar te
 * zijn. Zonder dit getal lijkt het dashboard simpelweg meer te tellen dan er in de
 * dossierlijst staat, en dat leest als een fout.
 */
export function uitVerwijderdeDossiers(feiten, bestaandeScreeningIds) {
  const bestaat = bestaandeScreeningIds instanceof Set
    ? bestaandeScreeningIds : new Set(bestaandeScreeningIds || []);
  const weg = (feiten || []).filter(r => r?.screening_id && !bestaat.has(r.screening_id));
  return {
    // Zie kpi.analyses: tellen op screening, niet op regels.
    analyses: new Set(weg.map(r => r.screening_id)).size,
    bevindingen: som(weg, 'issues_totaal'),
    dossiers: new Set(weg.map(r => r.dossier_sleutel).filter(Boolean)).size,
  };
}

export { MFN_TOTAAL };
