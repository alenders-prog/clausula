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
 * ── DE TWEEDE REGEL: BALANS VERLIEST NOOIT VAN EEN BUURMAN (6 september 2026) ─
 *
 * **Een issue met de dimensie `balans` wordt niet verwijderd ten gunste van een issue op
 * dezelfde passage dat die dimensie niet draagt.**
 *
 * De dimensie `balans` bleef structureel laag: 1 à 2 bevindingen per run tegen 15 à 20
 * voor `volledigheid`. Bij navraag bleek er géén verborgen laag verkeerd gelabelde
 * balansbevindingen te zijn — het model máákt er weinig, en van de weinige die het maakt
 * verdween er telkens één in de consolidatie. Gemeten geval, twee runs achter elkaar:
 *
 *     weg:    [juridisch+balans] Zorgkortingspercentages wijken af van Tremanormen
 *                                en zijn niet gemotiveerd
 *     bleef:  [volledigheid]     Zorgkorting vader (30%) en moeder (39%) niet gemotiveerd
 *
 * Dat is de merge-regel die precies doet wat er staat: *"verwijder het issue met de lagere
 * ernst of lagere juridische prioriteit"*, en in de voorrangsvolgorde staat balans vierde
 * van vijf. Voor `conflicten` staat er in de consolidatieprompt een uitdrukkelijke
 * NOOIT-SAMENVOEGEN-regel tegen ditzelfde patroon; voor balans stond er niets.
 *
 * **Waarom in code en niet in de prompt.** Die promptregel is geschreven, gemeten en weer
 * teruggedraaid: de consolidatie voegde hetzelfde paar opnieuw samen. Dat is geen verrassing
 * — in de kop van `api/_prompts/consolidatie.js` staat sinds 24 augustus 2026 dat twee
 * eerdere herformuleringen van diezelfde regels ook niets deden. Drie pogingen is genoeg.
 *
 * **Ruilen, niet toevoegen (bijgesteld 8 september 2026).** Deze regel voegde eerst een
 * kaart toe, en dat leverde een rapport op met twee kaarten over dezelfde zorgkorting —
 * één juridisch, één balans, vrijwel gelijke titel. Voor een mediator is dat dubbel werk,
 * hinderlijker dan een dimensie minder.
 *
 * Bewaarde de consolidatie precies één exemplaar uit de groep, dan heeft hij die groep als
 * één gebrek beoordeeld; dat oordeel laten we staan en ruilen alleen het exemplaar om.
 * Bewaarde hij er méér, dan vond hij ze juist verschillend — en dan komt de balanskaart
 * erbij, want ruilen zou dan een echt onderscheid weggooien.
 *
 * **Waarom alleen balans en niet elke dimensie.** De algemene variant ("elke dimensie die
 * op deze passage verdwijnt komt terug") bewaart ook een grammaticakaart naast een
 * volledigheidskaart over dezelfde zin, en dát zijn meestal wél dubbelingen. Balans is de
 * gemeten uitzondering: het staat laag in de voorrangsvolgorde, het is de dimensie die het
 * gesprek met partijen aanstuurt in plaats van een tekstcorrectie, en het is de enige waar
 * het verlies is aangetoond. Blijkt een andere dimensie hetzelfde te doen, breid dan uit —
 * maar meet het eerst.
 *
 * ── WAAR HIJ WORDT AANGEROEPEN: OP BEIDE ONTDUBBELINGEN ─────────────────────
 *
 * Er wordt twee keer ontdubbeld, en dat is makkelijk te missen:
 *
 *   1. de consolidatie (Haiku, `consolideer_issues`)
 *   2. `verwijderDuplicaten` in de consistentiestap (Haiku, `controleer_consistentie`)
 *
 * Toen deze grens op 6 september 2026 werd toegevoegd, stond hij alleen onder de eerste.
 * Het gevolg was dat hij in de praktijk niets deed: stap 2 gooide weg wat stap 1 net had
 * gered. Negen runs lang onopgemerkt, want het eindresultaat zag er precies zo uit als
 * zonder grens — de restauratie stond wél in het log, de verwijdering erna ook, en niemand
 * legde die twee naast elkaar.
 *
 * Het commitbericht van die dag ("wordtgekregen van 1/3 naar 3/3") is dus gemeten en juist,
 * maar de bescherming was half. Voeg je ooit een derde ontdubbeling toe, zet deze grens er
 * dan meteen onder — `tests/unit/consolidatie-grens.test.js` bewaakt de twee bestaande
 * aanroepplekken met een bronwachter.
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

/** Draagt dit issue de dimensie balans? Ook als tweede of derde dimensie. */
const heeftBalans = (i) => Array.isArray(i?.dimensies) && i.dimensies.includes('balans');

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
 * @returns {{indices: Set<number>, hersteld: Array<{index: number, reden: string, onderwerp: string}>}}
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

  /** De beste uit een reeks indices toevoegen, en noteren waaróm. */
  const herstel = (indices, reden) => {
    let winnaar = indices[0];
    for (const i of indices) if (beter(alleIssues[i], alleIssues[winnaar])) winnaar = i;
    bewaard.add(winnaar);
    hersteld.push({ index: winnaar, reden, onderwerp: alleIssues[winnaar]?.onderwerp ?? '(zonder titel)' });
  };

  for (const indices of groepen.values()) {
    // Regel 1 — van elke passage blijft er minstens één staan.
    if (!indices.some((i) => bewaard.has(i))) {
      herstel(indices, 'passage');
      continue;   // deze groep heeft nu een overlevende; regel 2 kijkt naar de volgende
    }
    // Regel 2 — draagt iemand in deze groep `balans` en geen enkele overlevende, dan
    // heeft de consolidatie de balanskaart tegen een buurman verruild.
    const balans = indices.filter((i) => heeftBalans(alleIssues[i]));
    if (!balans.length || balans.some((i) => bewaard.has(i))) continue;

    // RUILEN, NIET TOEVOEGEN — als de consolidatie precies één exemplaar uit deze groep
    // bewaarde. Dan heeft hij de groep als ÉÉN gebrek beoordeeld; die beoordeling laten we
    // staan, alleen koos hij het exemplaar zonder de balansdimensie.
    //
    // Dit stond eerst als toevoegen, en dat leverde op 8 september een rapport op met twee
    // kaarten over dezelfde zorgkorting: één juridisch, één balans, vrijwel gelijke titel.
    // Voor een mediator is dat dubbel werk — hinderlijker dan een dimensie minder.
    //
    // Bewaarde de consolidatie er MEER dan één, dan vond hij ze juist verschillend. Die
    // beoordeling staat ook, en dan komt de balanskaart er gewoon bij.
    const bewaardHier = indices.filter((i) => bewaard.has(i));
    if (bewaardHier.length === 1) bewaard.delete(bewaardHier[0]);
    herstel(balans, 'balans');
  }

  return { indices: bewaard, hersteld };
}
