/**
 * src/dashboard/feiten.js — van één bewaarde screening naar één regel `analyse_feiten`
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
 * Bouwt de feitregel voor één bewaarde screening.
 *
 * Eén regel per SCREENING, niet per document. Een analyse van een convenant én een
 * ouderschapsplan levert dus één regel met de tellingen bij elkaar op. Per document
 * splitsen zou nauwkeuriger zijn, maar `screening_id` is de sleutel die uniek moet
 * blijven — anders levert opnieuw opslaan dubbele regels op in plaats van een
 * bijgewerkte. `doc_type` bevat bij meerdere documenten de gesorteerde typen.
 *
 * @param {object} screening  rij uit `screeningen` — {id, dossier_id, versie_nr,
 *                            rapport, classificatie, created_at, gebruiker_id}
 * @param {object} context    {organisatie_id, gebruiker_id} — gebruiker_id valt terug
 *                            op die van de screening
 * @returns {object|null}     kolommen voor analyse_feiten, of null als er niets te
 *                            tellen valt
 */
export function bouwFeitRegel(screening, context = {}) {
  if (!screening?.id) return null;

  const docs = documentenVan(screening.rapport);
  if (!docs.length) return null;

  const perCategorie = legeCategorieen();
  const telling = { hoog: 0, midden: 0, laag: 0 };
  // Per ernst apart bijhouden wat er nog openstaat. Uit gevonden-min-afgevinkt is dat
  // niet af te leiden: drie afgevinkte punten kunnen drie lage zijn of drie hoge.
  const open = { hoog: 0, midden: 0, laag: 0 };
  let issuesTotaal = 0, afgevinkt = 0, genegeerd = 0;

  const mfn = { totaal: null, aanwezig: 0, onvolledig: 0, ontbreekt: 0, extra: 0 };
  let heeftMfn = false;
  const typen = new Set();
  const scores = [];

  for (const doc of docs) {
    typen.add(typeVanDocument(doc, screening));

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
      const type = typeVanDocument(doc, screening);
      // Vaste noemer per documenttype, nooit de lengte van de lijst: een afgekapte
      // lijst zou de noemer stilletjes verkleinen en de score opblazen.
      mfn.totaal = (mfn.totaal || 0) + (m.score_totaal || MFN_TOTAAL[type] || m.elementen.length);
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
    doc_type:        [...typen].filter(t => t && t !== 'onbekend').sort().join('+') || null,
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
