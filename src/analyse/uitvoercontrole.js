/**
 * src/analyse/uitvoercontrole.js — wat er mechanisch mis is aan een screeningoutput
 *
 * ── WAAROM DIT BESTAAT ──────────────────────────────────────────────────────
 *
 * Een vergelijking tussen twee taalmodellen valt of staat met een lijst van dingen die
 * objectief fout zijn aan de uitvoer. Zonder die lijst houd je alleen het blinde lezen
 * over — nog steeds nuttig, maar traag en voor discussie vatbaar. Zie
 * `docs/modelvergelijking.md`, fase 1, en de methode waar dat plan op steunt.
 *
 * Even belangrijk, en los van elke vergelijking: dit is de controle die een
 * promptwijziging toetsbaar maakt. De bevindingenlijst zelf verschilt tussen twee
 * identieke runs met 8 tot 10 bevindingen, dus daar is niets aan af te lezen. Een
 * télling van harde defecten over meerdere runs is wél een uitspraak.
 *
 * ── WAT HIER NIET IN ZIT ────────────────────────────────────────────────────
 *
 * Of een bevinding juridisch klópt, en of de mediator er iets aan heeft. Dat blijft
 * mensenwerk. Alles hier is aan de vórm te zien, zonder oordeel over de inhoud.
 *
 * ── TWEE NIVEAUS ────────────────────────────────────────────────────────────
 *
 *   fout     de uitvoer is onbruikbaar op dit punt — een veld ontbreekt of een waarde
 *            staat buiten de vastgestelde verzameling
 *   let op   waarschijnlijk mis, maar een mens moet ernaar kijken
 *
 * ── GEEN VIJFDE NORMALISATIE ────────────────────────────────────────────────
 *
 * De citaatcontrole hergebruikt `normaliseer` uit `src/viewer/uniek-fragment.js`. Er
 * staan er al vier in dit project die niet hetzelfde doen (`docs/centraliseren.md`,
 * deel A) en daar hoort er geen vijfde bij — zeker niet in een meetinstrument.
 *
 * Die keuze heeft ook een inhoudelijke kant. `normaliseer` haalt alle leestekens weg en
 * is dus de mildste van de vier. Een citaat dat hem niet haalt, wijkt niet af in een
 * koppelteken of een aanhalingsteken maar in de wóórden. Dat is de goede kant om op te
 * missen: een meetinstrument dat te veel aanslaat maakt een model ten onrechte slecht,
 * en dat is erger dan een gemiste melding.
 *
 * ── NULMETING (22 september 2026) ───────────────────────────────────────────
 *
 * Over de vijf bewaarde eval-runs: 94 bevindingen, waarvan 67 met een citaat. Nul
 * meldingen — geen enkel defect, en geen enkel vals alarm op de citaatcontrole.
 *
 * Dat is wat je van een nulmeting wilt zien, maar lees het niet als "het model maakt
 * geen fouten". Het zegt dat deze controles niet afgaan op uitvoer die in orde is. Dát
 * ze afgaan wanneer er wél iets mis is, staat in de unittests, met voor de
 * citaatcontrole het echte geval uit `docs/centraliseren.md` als voorbeeld.
 *
 * De eerste versie hiervan meldde wél iets: `dimensie-onbekend` op twee van de vijf
 * runs. Dat bleek het instrument te zijn en niet het model — zie `GELDIGE_DIMENSIES`
 * hieronder. Een controle die je niet tegen echte uitvoer houdt, meet zichzelf.
 */

import { VOORRANG_DIMENSIES } from './dimensies.js';
import { normaliseer } from '../viewer/uniek-fragment.js';
import { isBevestiging } from '../rapport/geen-bevinding.js';

export const FOUT   = 'fout';
export const LET_OP = 'let op';

/** De ernstwaarden uit het tool-schema in `api/analyseer.js`. */
export const GELDIGE_ERNST = Object.freeze(['laag', 'midden', 'hoog']);

/**
 * De dimensies die een bevinding mag dragen.
 *
 * De vijf komen uit `dimensies.js` — dit is met opzet géén eigen lijst. Op 22 september
 * 2026 bleek `tests/golden/schema.test.js` zijn eigen kopie te hebben, naast de zes die
 * op 8 september al waren samengevoegd. Een zevende erbij zetten in het bestand dat de
 * kwaliteit moet meten, is precies de fout die dit project al twee keer heeft gemaakt.
 *
 * ── WAAROM `cross_doc` ER WÉL BIJ STAAT ─────────────────────────────────────
 *
 * Dit stond hier eerst op alleen de vijf, met in de kop de redenering dat `cross_doc`
 * een knop in de weergave is en geen dimensie van een bevinding. Dat klopt als
 * begripsbepaling en was fout als controle: bij de eerste draai over échte uitvoer
 * meldde hij `dimensie-onbekend` op twee van de vijf bewaarde runs, allebei cross-doc.
 *
 * Het model doet niets verkeerds. `crossDocTool` in `api/analyseer.js` zet geen enum op
 * `dimensies` — het veld is daar `items: { type: 'string' }` — en `zwaarsteDimensie` in
 * `dimensies.js` heeft een eigen tak voor `cross_doc`. De code rékent erop dat die
 * waarde in een bevinding voorkomt.
 *
 * Een meetinstrument dat aanslaat op iets dat overal werkt, meet zichzelf. Het had twee
 * modellen laten verschillen op een regel die dit project niet stelt.
 */
export const GELDIGE_DIMENSIES = Object.freeze([...VOORRANG_DIMENSIES, 'cross_doc']);

const leeg = (v) => typeof v !== 'string' || v.trim() === '';

/**
 * Controleert één bevinding.
 *
 * @param {object} issue
 * @param {number} idx                 plaats in de lijst, voor de melding
 * @param {object} [opties]
 * @param {string} [opties.documentTekst]  de brontekst; zonder dit vervalt de citaatcontrole
 * @returns {Array<{code:string, niveau:string, waar:string, uitleg:string}>}
 */
export function controleerIssue(issue, idx, { documentTekst = '' } = {}) {
  const waar = `issues[${idx}]`;
  const uit  = [];
  const meld = (code, niveau, uitleg) => uit.push({ code, niveau, waar, uitleg });

  if (!issue || typeof issue !== 'object') {
    meld('geen-object', FOUT, 'De bevinding is geen object.');
    return uit;
  }

  // ── de velden die er moeten zijn ──────────────────────────────────────────
  for (const veld of ['onderwerp', 'bevinding', 'aanbeveling']) {
    if (leeg(issue[veld])) meld('veld-leeg', FOUT, `${veld} ontbreekt of is leeg.`);
  }

  // `passage` mág leeg zijn — niet elke bevinding wijst naar één plek — maar het veld
  // moet wel een string zijn, want de viewer zoekt ermee.
  if (issue.passage !== undefined && typeof issue.passage !== 'string') {
    meld('passage-geen-string', FOUT, 'passage is aanwezig maar geen string.');
  }

  // ── waarden binnen hun verzameling ────────────────────────────────────────
  if (!GELDIGE_ERNST.includes(issue.ernst)) {
    meld('ernst-onbekend', FOUT, `ernst "${issue.ernst}" staat niet in ${GELDIGE_ERNST.join('/')}.`);
  }

  if (!Array.isArray(issue.dimensies) || issue.dimensies.length === 0) {
    meld('dimensies-leeg', FOUT, 'dimensies ontbreekt of is leeg.');
  } else {
    for (const d of issue.dimensies) {
      if (!GELDIGE_DIMENSIES.includes(d)) {
        meld('dimensie-onbekend', FOUT, `dimensie "${d}" bestaat niet.`);
      }
    }
  }

  // ── het citaat moet in het document staan ─────────────────────────────────
  //
  // Aanleiding: een bevinding "Geboortedatum partijen niet volledig vermeld" met als
  // citaat "geboren te Deventer in 1986", terwijl er "geboren te Deventer op 06-11-1986"
  // staat. Het model parafraseerde en stelde op zijn eigen parafrase een gebrek vast.
  // Zie docs/centraliseren.md, laatste sectie.
  //
  // Dit is `let op` en geen `fout`: de bevinding kan alsnog ergens op slaan, en het
  // citaat kan uit een ander document van hetzelfde dossier komen.
  if (documentTekst && !leeg(issue.passage)) {
    const hooiberg = normaliseer(documentTekst);
    const naald    = normaliseer(issue.passage);
    if (naald && !hooiberg.includes(naald)) {
      meld('citaat-niet-gevonden', LET_OP,
        'De passage komt niet letterlijk in het document voor — mogelijk een parafrase.');
    }
  }

  // ── een bevestiging is geen bevinding ─────────────────────────────────────
  //
  // De prompt verbiedt dit met zoveel woorden en `filterBevestigingen` haalt ze er in
  // productie uit. Voor een meting telt het wél: het is een defect van het model, ook
  // als het verderop wordt opgevangen.
  if (isBevestiging(issue)) {
    meld('bevestiging', LET_OP, 'De aanbeveling zegt dat er niets hoeft — dit is geen bevinding.');
  }

  return uit;
}

/**
 * Controleert de hele uitvoer van één screening.
 *
 * @param {object} uitvoer              `{ issues: [...] }`, zoals de tool hem teruggeeft
 * @param {object} [opties]
 * @param {string} [opties.documentTekst]
 * @returns {{bevindingen: Array, telling: object, aantalIssues: number}}
 */
export function controleerUitvoer(uitvoer, { documentTekst = '' } = {}) {
  const issues = Array.isArray(uitvoer?.issues) ? uitvoer.issues : [];
  const bevindingen = [];

  if (!Array.isArray(uitvoer?.issues)) {
    bevindingen.push({
      code: 'issues-ontbreekt', niveau: FOUT, waar: 'uitvoer',
      uitleg: 'De uitvoer heeft geen issues-array.',
    });
  }

  for (const [i, issue] of issues.entries()) {
    bevindingen.push(...controleerIssue(issue, i, { documentTekst }));
  }

  bevindingen.push(...controleerReeks(issues));

  return { bevindingen, telling: tel(bevindingen), aantalIssues: issues.length };
}

/**
 * Controles die pas over de hele lijst zichtbaar worden.
 *
 * Nu alleen dubbele onderwerpen. Twee bevindingen met hetzelfde onderwerp zijn een
 * deduplicatiefout: de consolidatiestap hoort die samen te voegen. Het is `let op`,
 * want twee documenten in één dossier mogen hetzelfde gebrek hebben.
 */
export function controleerReeks(issues = []) {
  const uit = [];
  const gezien = new Map();

  for (const [i, issue] of issues.entries()) {
    const sleutel = normaliseer(issue?.onderwerp ?? '');
    if (!sleutel) continue;
    if (gezien.has(sleutel)) {
      uit.push({
        code: 'dubbel-onderwerp', niveau: LET_OP, waar: `issues[${i}]`,
        uitleg: `Zelfde onderwerp als issues[${gezien.get(sleutel)}].`,
      });
    } else {
      gezien.set(sleutel, i);
    }
  }

  return uit;
}

/** Bevindingen per code en per niveau tellen — dit is wat je tussen modellen vergelijkt. */
export function tel(bevindingen = []) {
  const perCode = {};
  let fout = 0, letOp = 0;

  for (const b of bevindingen) {
    perCode[b.code] = (perCode[b.code] ?? 0) + 1;
    if (b.niveau === FOUT) fout++; else letOp++;
  }

  return { totaal: bevindingen.length, fout, letOp, perCode };
}
