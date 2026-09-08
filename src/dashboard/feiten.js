/**
 * src/dashboard/feiten.js — van één bewaarde screening naar `analyse_feiten`-regels,
 * één per documenttype
 *
 * De feitentabel bestaat omdat het dashboard anders meezakt als een dossier wordt
 * verwijderd: de screeningen gaan mee en de tellingen met hen. Voor "hoe staan we
 * ervoor" klopt dat, voor "wat is er in totaal gedaan" niet.
 *
 * WAAROM HIER EN NIET IN EEN DATABASE-TRIGGER. Een trigger zou het telwerk een tweede
 * keer implementeren, in PL/pgSQL, waar geen van de 750 tests bij kan. Twee tellingen
 * van hetzelfde lopen uiteen — dat is in dit project meermaals gebeurd. Nu is er één
 * telling, hier, met de aggregatie uit statistieken.js eronder.
 *
 * De prijs: de browser kan het overslaan (netwerk weg halverwege het opslaan). Daarvoor
 * is `scripts/feiten-sync.mjs`, dat ontbrekende regels aanvult — tegelijk de backfill
 * van alles wat er vóór deze wijziging al stond.
 *
 * WAT ER NOOIT IN MAG. Geen issue-titels, geen passages, geen namen, geen
 * bestandsnamen. Die dragen letterlijke citaten uit cliëntdocumenten. Alleen tellingen
 * en classificaties — dat is de voorwaarde waaronder deze regels na een verwijderverzoek
 * mogen blijven staan. Zie docs/avg-verwerkersovereenkomst.md.
 */
import {
  CATEGORIEEN, ERNSTEN, MFN_TOTAAL,
  documentenVan, typeVanDocument, hoofdCategorie, isAfgevinkt, isGenegeerd,
} from './statistieken.js';
import { berekenGemiddeldeScore } from '../rapport/score.js';

/** Lege telling per categorie: {juridisch:{h,m,l}, ...}. */
function legeCategorieen() {
  return Object.fromEntries(CATEGORIEEN.map(c => [c, { h: 0, m: 0, l: 0 }]));
}

const KORT = { hoog: 'h', midden: 'm', laag: 'l' };

/**
 * Bouwt de feitregels voor één bewaarde screening — ÉÉN PER DOCUMENTTYPE.
 *
 * ── WAAROM PER DOCUMENT (7/8 september 2026) ────────────────────────────────
 *
 * Dit was één regel per screening, met de tellingen van alle documenten opgeteld en
 * `doc_type` als 'convenant+ouderschapsplan'. Dat maakte de keuze Convenant /
 * Ouderschapsplan in het statistiekenpaneel zinloos: het staafdiagram bleef het totaal
 * tonen (het filter hield de hele regel) en de MfN-ring verdween juist (dat filter deed
 * een exacte vergelijking). Twee filters op hetzelfde veld, allebei fout, en achteraf
 * niet te repareren — in een optelling zit niet meer welke bevinding bij welk stuk hoorde.
 *
 * De reden dat het zo begon was de sleutel: `screening_id` moest uniek blijven, anders
 * levert opnieuw opslaan dubbele regels op. Die sleutel is nu `(screening_id, doc_type)`
 * — zie supabase/2026-09-08-feiten-per-document.sql.
 *
 * Documenten van hetzelfde type binnen één analyse gaan samen in één regel. Dat is geen
 * verlies: het dashboard groepeert toch per type, en twee convenanten in één dossier is
 * geen onderscheid dat iemand terugvraagt.
 *
 * `doc_type` is nooit leeg. Een document zonder herkenbaar type krijgt 'onbekend', want
 * de unique index in de database telt NULL's als van elkaar verschillend — met NULL erin
 * zou opnieuw opslaan alsnog rijen bíjschrijven in plaats van bijwerken.
 *
 * @param {object} screening  rij uit `screeningen` — {id, dossier_id, versie_nr,
 *                            rapport, classificatie, created_at, gebruiker_id}
 * @param {object} context    {organisatie_id, gebruiker_id} — gebruiker_id valt terug
 *                            op die van de screening
 * @returns {object[]}        kolommen voor analyse_feiten, één per documenttype; leeg
 *                            als er niets te tellen valt
 */
export function bouwFeitRegels(screening, context = {}) {
  if (!screening?.id) return [];

  const docs = documentenVan(screening.rapport);
  if (!docs.length) return [];

  // Documenten groeperen op type; elk groepje levert straks één regel.
  const perType = new Map();
  for (const doc of docs) {
    const type = typeVanDocument(doc, screening) || 'onbekend';
    if (!perType.has(type)) perType.set(type, []);
    perType.get(type).push(doc);
  }

  return [...perType.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, groep]) => bouwRegel(screening, context, type, groep));
}

/** De telling voor één documenttype binnen één screening. */
function bouwRegel(screening, context, docType, docs) {
  const perCategorie = legeCategorieen();
  const telling = { hoog: 0, midden: 0, laag: 0 };
  // Per ernst apart bijhouden wat er nog openstaat. Uit gevonden-min-afgevinkt is dat
  // niet af te leiden: drie afgevinkte punten kunnen drie lage zijn of drie hoge.
  const open = { hoog: 0, midden: 0, laag: 0 };
  let issuesTotaal = 0, afgevinkt = 0, genegeerd = 0;

  const mfn = { totaal: null, aanwezig: 0, onvolledig: 0, ontbreekt: 0, extra: 0 };
  let heeftMfn = false;
  const scores = [];

  for (const doc of docs) {
    for (const iss of (Array.isArray(doc?.issues) ? doc.issues : [])) {
      issuesTotaal++;
      const e = ERNSTEN.includes(iss?.ernst) ? iss.ernst : 'midden';
      telling[e]++;
      perCategorie[hoofdCategorie(iss)][KORT[e]]++;
      if (isAfgevinkt(iss)) afgevinkt++;
      else if (isGenegeerd(iss)) genegeerd++;
      else open[e]++;
    }

    const m = doc?.mfn_score;
    if (m?.elementen?.length) {
      heeftMfn = true;
      // Vaste noemer per documenttype, nooit de lengte van de lijst: een afgekapte
      // lijst zou de noemer stilletjes verkleinen en de score opblazen.
      mfn.totaal = (mfn.totaal || 0) + (m.score_totaal || MFN_TOTAAL[docType] || m.elementen.length);
      mfn.aanwezig   += m.elementen.filter(x => x.status === 'aanwezig').length;
      mfn.onvolledig += m.elementen.filter(x => x.status === 'onvolledig').length;
      mfn.ontbreekt  += m.elementen.filter(x => x.status === 'ontbreekt').length;
      mfn.extra      += (m.extra_elementen || []).length;
    }

    const s = berekenGemiddeldeScore(doc);
    if (s !== null) scores.push(s);
  }

  return {
    organisatie_id:  context.organisatie_id ?? null,
    gebruiker_id:    context.gebruiker_id ?? screening.gebruiker_id ?? null,
    dossier_sleutel: screening.dossier_id ?? null,
    screening_id:    screening.id,
    versie_nr:       screening.versie_nr ?? null,
    doc_type:        docType,
    geanalyseerd_op: screening.created_at ?? new Date().toISOString(),

    issues_totaal: issuesTotaal,
    hoog:   telling.hoog,
    midden: telling.midden,
    laag:   telling.laag,
    afgevinkt,
    genegeerd,
    open_hoog:   open.hoog,
    open_midden: open.midden,
    open_laag:   open.laag,
    per_categorie: perCategorie,

    mfn_totaal:     heeftMfn ? mfn.totaal     : null,
    mfn_aanwezig:   heeftMfn ? mfn.aanwezig   : null,
    mfn_onvolledig: heeftMfn ? mfn.onvolledig : null,
    mfn_ontbreekt:  heeftMfn ? mfn.ontbreekt  : null,
    mfn_extra:      heeftMfn ? mfn.extra      : null,

    score: scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null,
    bijgewerkt_op: new Date().toISOString(),
  };
}

/**
 * Controleert dat een feitregel geen inhoud bevat.
 *
 * Dit is een vangnet, geen sierlijkheid. Voegt iemand later een veld toe waar wél tekst
 * in kan zitten — een titel "voor de leesbaarheid", een bestandsnaam "handig bij
 * debuggen" — dan is dat precies het moment waarop de tabel persoonsgegevens gaat
 * bevatten en de bewaarregels niet meer kloppen. Dan hoort er iets te piepen.
 *
 * @returns {string[]} lege lijst als de regel schoon is
 */
export function keurFeitRegel(regel) {
  const TOEGESTAAN_TEKST = new Set(['doc_type', 'geanalyseerd_op', 'bijgewerkt_op']);
  const bezwaren = [];
  for (const [sleutel, waarde] of Object.entries(regel || {})) {
    if (typeof waarde !== 'string' || TOEGESTAAN_TEKST.has(sleutel)) continue;
    // uuid's mogen; vrije tekst niet.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(waarde)) {
      bezwaren.push(`${sleutel} bevat vrije tekst: "${waarde.slice(0, 40)}"`);
    }
  }
  return bezwaren;
}

// ── De bewaartermijn mag nooit door een schrijfactie worden teruggedraaid ────
//
// `analyse_feiten.gebruiker_id` verwijst via auth.users naar een e-mailadres en dus naar
// een persoon. `anonimiseer_oude_feiten()` haalt die verwijzing na achttien maanden weg —
// dat is de belofte in docs/avg-verwerkersovereenkomst.md.
//
// `bouwFeitRegels` haalt gebruiker_id uit de screening, en die blijft bestaan nadat de
// feitregel is geanonimiseerd. Wie dus opnieuw wegschrijft, zet de verwijzing er weer op.
//
// Op 8 september 2026 bleek dat scripts/feiten-sync.mjs die regel wél toepaste en de
// browser niet. Twee schrijvers naar dezelfde tabel, één die de afspraak kende. Dezelfde
// vorm als de vier schrijvers naar screeningen.rapport die diezelfde dag acht PDF's
// verweesd achterlieten — vandaar dat de regel nu hier staat, waar beide erbij kunnen.
//
// Er is geen schade geweest: de termijn is achttien maanden en de oudste regel was dagen
// oud. Het mechanisme stond er wel, en het zou niemand zijn opgevallen.

/** Hoe lang een feitregel een gebruikersverwijzing mag dragen. */
export const BEWAARTERMIJN_MAANDEN = 18;

/** Alles daarvóór hoort geen gebruiker_id meer te hebben. */
export const bewaargrens = (nu = Date.now()) =>
  new Date(nu - BEWAARTERMIJN_MAANDEN * 30.44 * 864e5);

/** De sleutel van een feitregel: sinds 08-09-2026 (screening_id, doc_type). */
export const feitSleutel = (r) => `${r?.screening_id}|${r?.doc_type ?? ''}`;

/**
 * Zet de bewaartermijn goed op regels die op het punt staan weggeschreven te worden.
 *
 *   bestaande regel : gebruiker_id overnemen zoals hij in de database staat, wat er ook
 *                     in de nieuwe regel zit — is hij daar geanonimiseerd, dan blijft dat zo
 *   nieuwe regel    : ouder dan de termijn? meteen zonder verwijzing wegschrijven
 *
 * @param {object[]} regels     wat er geschreven gaat worden (wordt niet gewijzigd)
 * @param {Iterable} bestaande  rijen uit analyse_feiten met screening_id, doc_type, gebruiker_id
 * @returns {object[]} kopieën met het juiste gebruiker_id
 */
export function pasBewaartermijnToe(regels, bestaande = [], nu = Date.now()) {
  const perSleutel = new Map();
  for (const r of bestaande ?? []) perSleutel.set(feitSleutel(r), r);
  const grens = bewaargrens(nu);

  return (regels ?? []).map((regel) => {
    const oud = perSleutel.get(feitSleutel(regel));
    if (oud) return { ...regel, gebruiker_id: oud.gebruiker_id ?? null };
    if (regel?.geanalyseerd_op && new Date(regel.geanalyseerd_op) < grens) {
      return { ...regel, gebruiker_id: null };
    }
    return { ...regel };
  });
}
