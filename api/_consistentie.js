/**
 * api/_consistentie.js
 * Controle op samenhang tussen de titel van een issue en zijn eigen bevinding.
 *
 * Aanleiding (19 augustus 2026): een issue kwam terug als "Zorgkorting-percentages
 * optellen tot meer dan 100%", terwijl de bevinding eronder "30% + 39% = 69%"
 * berekende. De kop weerlegde zichzelf in de eerste zin, en omdat de ernst op de
 * kop wordt bepaald stond het issue op 'hoog'.
 *
 * Bewust GEEN diepe verificatie per issue: die kost op claude-fable-5 ruwweg $0,15
 * per issue — bij 26 issues meer dan tien keer de kosten van de hele analyse — en
 * ze krijgt de documenttekst niet mee, dus valse "dit ontbreekt"-claims vangt ze
 * evenmin. Voor het betrappen van een kop die zichzelf tegenspreekt is geen
 * diepgang nodig, alleen een goedkope vergelijking.
 *
 * ── DUPLICATEN (1 september 2026) ───────────────────────────────────────────
 *
 * De consolidatiestap ervóór hoort dubbelingen weg te halen, maar laat er soms een
 * door. In een testrun stond de informatieplicht er twee keer in; het serverlog
 * verried waaróm dat niemand opviel:
 *
 *   [consistentie] [8] "Informatieplicht (art. 1:377b BW) ontbreekt"
 *                    → "Informatieplicht (art. 1:377b BW) ontbreekt"
 *                      (Dit is identiek aan issue [2]. De titel beweert niet meer
 *                       dan de bevinding aantoont.)
 *
 * Deze stap zág de dubbeling dus wél. Alleen had ze geen manier om dat te zeggen:
 * het enige veld dat ze mocht vullen was een nieuwe titel, en die was terecht
 * ongewijzigd. De waarneming lekte weg in het redenveld en verdween.
 *
 * Vandaar een tweede lijst, `duplicaten`. Geen nieuwe aanroep en geen nieuwe kosten —
 * het model deed het werk al. Verwijderen is wél onomkeerbaar, dus `verwijderDuplicaten`
 * hieronder is streng: zie de regels daar.
 */

export const consistentieTool = {
  name: 'controleer_consistentie',
  description: 'Meld issues waarvan de titel meer beweert dan de bevinding aantoont, en issues die inhoudelijk een herhaling zijn van een eerder issue in de lijst.',
  input_schema: {
    type: 'object',
    properties: {
      duplicaten: {
        type: 'array',
        description: 'Issues die inhoudelijk hetzelfde zeggen als een EERDER issue in de lijst. Laat leeg als er geen zijn.',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer', description: 'Index (0-gebaseerd) van de herhaling — dit issue verdwijnt.' },
            van:   { type: 'integer', description: 'Index van het eerdere issue waarvan dit een herhaling is. Moet lager zijn dan index.' },
            reden: { type: 'string',  description: 'Kort: waarom is dit dezelfde bevinding?' },
          },
          required: ['index', 'van', 'reden'],
        },
      },
      correcties: {
        type: 'array',
        description: 'Alleen de issues die aangepast moeten worden. Is alles in orde, geef dan een lege lijst.',
        items: {
          type: 'object',
          properties: {
            index:           { type: 'integer', description: 'Index (0-gebaseerd) uit de aangeboden lijst.' },
            nieuw_onderwerp: { type: 'string',  description: 'Herschreven titel die precies dekt wat de bevinding aantoont — niet meer.' },
            reden:           { type: 'string',  description: 'Kort: wat beweerde de titel dat de bevinding niet aantoont?' },
            ernst_te_hoog:   { type: 'boolean', description: 'True als de ernst uitsluitend berustte op de niet-onderbouwde bewering.' },
          },
          required: ['index', 'nieuw_onderwerp', 'reden'],
        },
      },
    },
    required: ['correcties'],
  },
};

export const sysConsistentie =
`Je krijgt een genummerde lijst issues uit een Nederlands echtscheidingsdocument. Elk issue heeft een titel en een bevinding.

Controleer per issue ALLEEN dit:
1. Wordt alles wat de TITEL beweert, ook daadwerkelijk aangetoond in de BEVINDING?
2. Klopt een berekening of vergelijking in de titel met de getallen in de bevinding?
3. Is dit issue inhoudelijk een HERHALING van een eerder issue in de lijst?

Voorbeeld van een fout die je moet vangen:
  titel: "Percentages tellen op tot meer dan 100%"
  bevinding: "De percentages bedragen 30% + 39% = 69% in totaal, wat ongebruikelijk is en niet gemotiveerd."
  → 69% is geen 100%. De titel beweert een overschrijding die de bevinding weerlegt.
  → nieuw_onderwerp: "Zorgkortingspercentages ongebruikelijk en niet gemotiveerd" (de observatie die WEL overeind blijft)
  → ernst_te_hoog: true (de ernst berustte op de vermeende overschrijding)

Herschrijf de titel naar wat de bevinding wél aantoont. Verwijder het issue niet en verzin geen nieuwe inhoud —
de onderliggende observatie blijft staan, alleen de titel wordt eerlijk gemaakt.

HERHALINGEN (veld 'duplicaten'):
Twee issues zijn een herhaling als ze op dezelfde tekortkoming in hetzelfde document wijzen — ook als
de titels anders geformuleerd zijn. Meld dan de LATERE index als 'index' en de eerdere als 'van'.

  wél een herhaling: [2] "Informatieplicht (art. 1:377b BW) ontbreekt"
                     [8] "Geen afspraken over informeren en consulteren"
                     → dezelfde tekortkoming, andere woorden.

  géén herhaling:    twee gebreken in dezelfde zin (bijv. een ontbrekend €-teken én
                     een verkeerd rekeningnummer) — die vraagt de mediator apart te
                     kunnen afhandelen.
  géén herhaling:    hetzelfde soort gebrek op twee verschillende plekken of over twee
                     verschillende bedragen, rekeningen of kinderen.

Bij twijfel: GEEN duplicaat melden. Een dubbeling is hinderlijk, een weggegooide bevinding is onzichtbaar.

Beoordeel NIET of de bevinding juridisch juist is, of de passage klopt, of het issue terecht is.
Alleen de samenhang tussen titel en bevinding, en herhalingen. Bij twijfel: geen correctie.`;

/**
 * Stelt de genummerde lijst samen die het model beoordeelt.
 * De volledige bevinding gaat mee: de rekensom staat er middenin, dus afkappen
 * zoals de consolidatiestap doet (150 tekens) zou juist het bewijs weglaten.
 */
export function bouwConsistentieLijst(issues) {
  return issues
    .map((iss, i) => `[${i}] TITEL: ${iss.onderwerp}\n     BEVINDING: ${(iss.bevinding || '').slice(0, 900)}`)
    .join('\n\n');
}

const ERNST_OMLAAG = { hoog: 'midden', midden: 'laag', laag: 'laag' };

/** Voor het vergelijken van twee ernstwaarden; zie de nota bij verwijderDuplicaten. */
const ERNST_RANG = { laag: 0, midden: 1, hoog: 2 };

/**
 * Past de correcties toe en geeft een nieuwe lijst terug; de invoer blijft ongemoeid.
 * Negeert correcties met een onbruikbare index of een te korte titel — een model dat
 * onzin teruggeeft mag geen issue onleesbaar maken.
 *
 * De ernst gaat alleen omlaag. Deze controle beoordeelt de samenhang tussen kop en
 * bevinding, niet de juridische ernst; ze mag een issue dus nooit zwaarder maken.
 */
export function pasCorrectiesToe(issues, correcties) {
  if (!Array.isArray(issues) || !issues.length) return { issues, toegepast: [] };
  const lijst = Array.isArray(correcties) ? correcties : [];
  if (!lijst.length) return { issues, toegepast: [] };

  const aangepast = issues.map(iss => ({ ...iss }));
  const toegepast = [];

  for (const c of lijst) {
    const i = c?.index;
    if (!Number.isInteger(i) || i < 0 || i >= aangepast.length) continue;
    const nieuw = typeof c.nieuw_onderwerp === 'string' ? c.nieuw_onderwerp.trim() : '';
    if (nieuw.length < 5) continue;

    // Een correctie die de titel niet verandert is geen correctie. Ze kwam voor toen
    // het model een dubbeling opmerkte maar er geen veld voor had: de titel bleef
    // gelijk en de waarneming stond alleen in het redenveld.
    if (nieuw === aangepast[i].onderwerp) continue;

    toegepast.push({ index: i, oud: aangepast[i].onderwerp, nieuw, reden: c.reden || '' });
    aangepast[i].onderwerp = nieuw;
    if (c.ernst_te_hoog === true) {
      aangepast[i].ernst = ERNST_OMLAAG[aangepast[i].ernst] ?? aangepast[i].ernst;
    }
  }
  return { issues: aangepast, toegepast };
}

/** Meer dan dit deel van de lijst wegstrepen is geen deduplicatie meer. */
export const MAX_DUPLICAAT_DEEL = 0.4;

/**
 * Verwijdert de gemelde herhalingen. Geeft een nieuwe lijst terug; de invoer blijft
 * ongemoeid, en de onderlinge volgorde van wat blijft verandert niet.
 *
 * Dit is de enige plek in de keten waar een issue definitief verdwijnt op het woord van
 * een taalmodel — de consolidatiestap ervóór werkt andersom, die noemt wat er blíjft.
 * Vandaar vier regels, elk tegen een concrete manier waarop dit fout gaat:
 *
 *  1. `van` moet lager zijn dan `index`. Anders verdwijnt de eerste vermelding en blijft
 *     de latere staan, wat de documentvolgorde overhoop gooit.
 *
 *     Deze ene regel doet meer dan hij lijkt: hij garandeert dat er van elke groep
 *     dubbelingen altijd één issue overblijft. Het laagste gemelde nummer heeft een
 *     anker dat nóg lager ligt, en dat anker kan zelf dus niet gemeld zijn. Elke keten
 *     eindigt daarmee bij een issue dat blijft staan. Een kringetje kan niet bestaan.
 *  2. Beide indices moeten bestaan, geheel zijn en verschillen.
 *  3. Verdwijnt meer dan MAX_DUPLICAAT_DEEL van de lijst, dan gaat er iets grondig mis
 *     en wordt de hele opgave genegeerd. Liever een lijst met dubbelingen dan een lijst
 *     waar de helft uit is; het eerste ziet de mediator, het tweede niet.
 *
 * De keten wordt daarnaast doorverwezen naar zijn eindpunt (2 ← 8 ← 11 wordt 2 ← 8,
 * 2 ← 11). Dat verandert niets aan wát er verdwijnt — zie regel 1 — maar zorgt dat het
 * logboek het issue noemt dat er nog ís. "[11] verwijderd als herhaling van [8]" is
 * misleidend als [8] zelf ook weg is.
 *
 * ── DE ERNST GAAT MEE OMHOOG ────────────────────────────────────────────────
 *
 * Bij de eerste evalrun met deze stap gebeurde dit:
 *
 *   [10] "Informatieplicht (art. 1:377b BW) ontbreekt"   hoog     ← verwijderd
 *   [3]  "Informatie- en consultatieverplichting ontbreekt"  midden  ← bleef staan
 *
 * Dezelfde tekortkoming, en terecht als herhaling gemeld — maar de mediator zag hem
 * daarna als 'midden'. Ontdubbelen mag een bevinding samenvoegen, niet verzachten.
 * Het issue dat blijft krijgt daarom de zwaarste ernst van de groep. Alleen omhoog:
 * dat een van de twee formuleringen milder uitviel, maakt het gebrek niet kleiner.
 *
 * @returns {{issues: Array, verwijderd: Array, genegeerd: string}}
 */
export function verwijderDuplicaten(issues, duplicaten) {
  const lijst = Array.isArray(issues) ? issues : [];
  const opgave = Array.isArray(duplicaten) ? duplicaten : [];
  if (!lijst.length || !opgave.length) return { issues: lijst, verwijderd: [], genegeerd: '' };

  const weg = new Map();   // index → { van, reden }
  for (const d of opgave) {
    const i = d?.index, van = d?.van;
    if (!Number.isInteger(i) || !Number.isInteger(van)) continue;
    if (i < 0 || i >= lijst.length || van < 0 || van >= lijst.length) continue;
    if (van >= i) continue;                       // regel 1
    weg.set(i, { van, reden: d.reden || '' });
  }
  // Ketens doorverwijzen naar hun eindpunt — alleen voor het logboek, zie de nota.
  // Van laag naar hoog, en omdat `van` altijd lager is dan `index` is het anker op dat
  // moment al opgelost. Eén ronde volstaat.
  for (const i of [...weg.keys()].sort((a, b) => a - b)) {
    const d = weg.get(i);
    if (weg.has(d.van)) weg.set(i, { ...d, van: weg.get(d.van).van });
  }

  if (weg.size > lijst.length * MAX_DUPLICAAT_DEEL) {
    return {
      issues: lijst, verwijderd: [],
      genegeerd: `${weg.size} van ${lijst.length} als herhaling gemeld — dat is te veel om te vertrouwen, opgave genegeerd`,
    };
  }

  const verwijderd = [...weg.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([i, d]) => ({ index: i, van: d.van, reden: d.reden, onderwerp: lijst[i]?.onderwerp || '' }));

  // De zwaarste ernst van de groep gaat naar het issue dat blijft. Alleen de ankers
  // die daadwerkelijk omhoog gaan worden gekopieerd; de rest blijft dezelfde verwijzing.
  const nieuweErnst = new Map();
  for (const d of verwijderd) {
    const weggehaald = ERNST_RANG[lijst[d.index]?.ernst] ?? -1;
    const huidig = ERNST_RANG[nieuweErnst.get(d.van) ?? lijst[d.van]?.ernst] ?? -1;
    if (weggehaald > huidig) nieuweErnst.set(d.van, lijst[d.index].ernst);
  }
  for (const d of verwijderd) {
    if (nieuweErnst.has(d.van)) d.ernstNaar = nieuweErnst.get(d.van);
  }

  const blijvend = lijst
    .map((iss, i) => (nieuweErnst.has(i) ? { ...iss, ernst: nieuweErnst.get(i) } : iss))
    .filter((_, i) => !weg.has(i));

  return { issues: blijvend, verwijderd, genegeerd: '' };
}
