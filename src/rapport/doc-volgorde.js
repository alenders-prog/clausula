/**
 * src/rapport/doc-volgorde.js — verbeterpunten op documentvolgorde zetten
 *
 * Bij "Sorteren op Documentvolgorde" hoort een kaart te staan waar zijn passage in het
 * document staat. Dat werkt door de passage in de documenttekst terug te zoeken en op
 * die tekenpositie te sorteren.
 *
 * Aanleiding om dit uit index.html te halen (31 augustus 2026). Een verbeterpunt over
 * de kerstverdeling — §11 Feestdagen, driekwart door een ouderschapsplan — stond
 * bovenaan de lijst. Er was geen enkele manier om te zien waaróm: de oude versie gaf
 * een getal terug en niemand kon nagaan of dat een treffer was of een gok. Zestig
 * regels redenering zonder één test.
 *
 * Twee dingen waren daadwerkelijk stuk:
 *
 *  1. **De woordtrappen konden vrijwel nooit werken.** Ze plakten inhoudswoorden aan
 *     elkaar ("kerstavond kerstdag wissel") en zochten dat letterlijk in tekst waar de
 *     stopwoorden gewoon nog in stonden ("Kerstavond tot en met 2ᵈᵉ kerstdag; de
 *     wissel…"). Die twee matchen nooit. Het zag eruit als een vangnet en was het niet.
 *
 *     Nu worden beide kanten op dezelfde manier tot een *skelet* van inhoudswoorden
 *     teruggebracht, met een kaart terug naar de tekenpositie in de echte tekst.
 *
 *  2. **De artikeltrap zocht een kaal nummer als deeltekst.** `indexOf('11')` raakt het
 *     eerste bedrag, jaartal of huisnummer in het document — en zet daarmee een issue
 *     uit §11 pardoes bovenaan. Een kaal nummer van één of twee cijfers is te zwak en
 *     wordt nu geweigerd; "3.2.1" of "11 feestdagen" mag wel.
 *
 * En het belangrijkste: elke uitkomst zegt nu via wélke trap hij gevonden is. Daarmee
 * is te tellen hoeveel kaarten op een echte treffer staan en hoeveel op de terugval —
 * zie `beoordeelVolgorde`. Zonder dat blijft een scheve volgorde iets wat je toevallig
 * opmerkt.
 *
 * De aanroeper levert genormaliseerde tekst aan (kleine letters, witruimte ingeklapt)
 * en heeft de passages al terug-gepseudonimiseerd; dat vraagt applicatietoestand en
 * hoort dus niet hier.
 */

/** Woorden die te algemeen zijn om op te matchen. */
export const STOPWOORDEN = new Set(['de', 'het', 'een', 'en', 'of', 'in', 'van', 'op', 'te',
  'dat', 'die', 'is', 'zijn', 'voor', 'aan', 'met', 'bij', 'uit', 'als', 'ook', 'maar',
  'niet', 'naar', 'om', 'over']);

/** Issues zonder bruikbare treffer gaan hierachter, in de volgorde van het model. */
export const GEEN_TREFFER_BASIS = 500000;

/** Woorden mét hun tekenpositie. Leestekens horen niet bij het woord. */
export function woorden(tekst) {
  const uit = [];
  const re = /[\p{L}\p{N}]+/gu;
  let m;
  while ((m = re.exec(String(tekst || '')))) uit.push({ woord: m[0], pos: m.index });
  return uit;
}

/**
 * Zet tekst om in een skelet: de woorden aaneen met enkele spaties, plus een kaart
 * terug naar de tekenpositie van elk woord.
 *
 * Het skelet begint en eindigt met een spatie, zodat er op hele woorden gezocht kan
 * worden en "erf" niet in "erfenis" valt.
 *
 * @param {string} tekst
 * @param {boolean} alleenInhoud  stopwoorden en korte woorden weglaten
 */
export function bouwSkelet(tekst, alleenInhoud = false) {
  const ws = woorden(tekst).filter(w =>
    !alleenInhoud || (w.woord.length > 3 && !STOPWOORDEN.has(w.woord)));

  let skelet = ' ';
  const beginInSkelet = new Map();   // offset in skelet → index in ws
  for (let i = 0; i < ws.length; i++) {
    beginInSkelet.set(skelet.length, i);
    skelet += ws[i].woord + ' ';
  }
  return { skelet, posities: ws.map(w => w.pos), beginInSkelet };
}

/**
 * Zoekt een rij woorden in een skelet en geeft de tekenpositie in de echte tekst.
 * @returns {number} -1 als de rij er niet in staat
 */
export function zoekInSkelet(skeletObj, rij) {
  if (!skeletObj || !Array.isArray(rij) || rij.length === 0) return -1;
  const idx = skeletObj.skelet.indexOf(` ${rij.join(' ')} `);
  if (idx < 0) return -1;
  const wi = skeletObj.beginInSkelet.get(idx + 1);
  return wi === undefined ? -1 : skeletObj.posities[wi];
}

/**
 * De zoekterm voor de artikeltrap, of null als hij te zwak is.
 *
 * Een kaal nummer van één of twee cijfers wordt geweigerd: dat raakt het eerste bedrag
 * of jaartal in het document en zet een issue uit een late paragraaf vooraan. Dat is
 * erger dan geen treffer, want een terugval belandt tenminste achteraan.
 */
export function artikelZoekterm(artikel) {
  const kaal = String(artikel || '').trim().replace(/^(artikel|art\.?)\s*/i, '').trim();
  if (!kaal) return null;
  // Kleine letters: het skelet komt uit genormaliseerde tekst, en een artikel dat
  // ergens met een hoofdletter binnenkomt zou anders stilletjes nooit matchen.
  const stukken = woorden(kaal.toLowerCase()).map(w => w.woord);
  if (stukken.length === 0) return null;
  if (stukken.length === 1 && /^\d{1,2}$/.test(stukken[0])) return null;
  return stukken;
}

/**
 * De positie van één issue, plus via welke trap hij gevonden is.
 *
 * Een issue mag méér dan één schrijfwijze van zijn passage aanleveren (`passages`). Dat
 * is nodig omdat de passage en de documenttekst niet altijd in hetzelfde alfabet staan:
 *
 *   tijdens een verse analyse   de passage is terug-vertaald naar echte namen,
 *                               `_document_tekst` staat er nog ruw in       → gelijk
 *   bij een opgeslagen rapport  bij het opslaan is het hele rapport gepseudonimiseerd,
 *                               inclusief de documenttekst                  → gelijk
 *
 * Alleen: de code wist niet in welke van die twee toestanden hij zat, en pseudonimiseerde
 * de passage altijd. In een verse analyse zocht hij daarmee nepnamen in ruwe tekst. Op
 * 1 september 2026 kwam dat naar boven: van veertien bevindingen werden er tien niet
 * teruggevonden en nul exact — de lijst stond daardoor grotendeels in modelvolgorde. Na
 * het opslaan en opnieuw openen klopte diezelfde lijst wél, en dát was het bewijs.
 *
 * Beide varianten proberen is eenvoudiger dan de toestand achterhalen, en blijft goed als
 * er ooit een derde toestand bij komt.
 *
 * @param {object} ctx   { docNorm, inhoudSkelet, volSkelet }
 * @param {object} issue { passages?: string[], passageNorm?: string, artikel, origPos }
 * @returns {{pos:number, trap:'exact'|'begin'|'woorden4'|'woorden3'|'artikel'|'geen'}}
 */
export function vindPositie(ctx, issue = {}) {
  const { docNorm = '', inhoudSkelet, volSkelet } = ctx || {};
  const terug = () => ({
    pos: GEEN_TREFFER_BASIS + (Number(issue.origPos) || 0), trap: 'geen',
  });

  const varianten = [...new Set(
    (Array.isArray(issue.passages) ? issue.passages : [issue.passageNorm])
      .map(p => String(p || '')).filter(Boolean),
  )];
  for (const pas of varianten) {
    let idx = docNorm.indexOf(pas);
    if (idx >= 0) return { pos: idx, trap: 'exact' };

    if (pas.length > 60) {
      idx = docNorm.indexOf(pas.slice(0, 60));
      if (idx >= 0) return { pos: idx, trap: 'begin' };
    }

    // De woordtrappen. Beide kanten door hetzelfde skelet, want dát was de fout:
    // inhoudswoorden aaneenplakken en zoeken in tekst die de stopwoorden nog heeft.
    const inh = woorden(pas)
      .map(w => w.woord)
      .filter(w => w.length > 3 && !STOPWOORDEN.has(w));

    for (const [lengte, trap] of [[4, 'woorden4'], [3, 'woorden3']]) {
      for (let i = 0; i + lengte - 1 < inh.length; i++) {
        const p = zoekInSkelet(inhoudSkelet, inh.slice(i, i + lengte));
        if (p >= 0) return { pos: p, trap };
      }
    }
  }

  const art = artikelZoekterm(issue.artikel);
  if (art) {
    const p = zoekInSkelet(volSkelet, art);
    if (p >= 0) return { pos: p, trap: 'artikel' };
  }

  return terug();
}

/**
 * De sorteervolgorde van alle issues, plus een verantwoording.
 *
 * @param {object} p
 * @param {string} p.docNorm  genormaliseerde tekst van het actieve tabblad
 * @param {Array}  p.items    [{ passages|passageNorm, artikel, origPos }] — zelfde volgorde als de issues
 * @returns {{volgorde:number[], diagnose:{totaal:number, perTrap:object, zonderTreffer:number}}}
 */
export function bepaalVolgorde({ docNorm = '', items = [] } = {}) {
  const lijst = Array.isArray(items) ? items : [];
  const volgorde = lijst.map((_, i) => i);

  if (!docNorm) {
    return { volgorde, diagnose: { totaal: lijst.length, perTrap: {}, zonderTreffer: lijst.length } };
  }

  const ctx = {
    docNorm,
    inhoudSkelet: bouwSkelet(docNorm, true),
    volSkelet:    bouwSkelet(docNorm, false),
  };

  const perTrap = {};
  const posities = lijst.map(it => {
    const { pos, trap } = vindPositie(ctx, it);
    perTrap[trap] = (perTrap[trap] || 0) + 1;
    return pos;
  });

  volgorde.sort((a, b) => posities[a] - posities[b]);
  return {
    volgorde,
    diagnose: { totaal: lijst.length, perTrap, zonderTreffer: perTrap.geen || 0 },
  };
}

/**
 * De controle die er niet was.
 *
 * Blijft een flink deel van de kaarten zonder treffer, dan is de volgorde geen
 * documentvolgorde meer maar grotendeels de volgorde van het model — en dat is aan de
 * lijst niet te zien. Liever een melding dan een lijst die klopt te lijken.
 */
export function beoordeelVolgorde(diagnose, drempel = 0.3) {
  const totaal = diagnose?.totaal || 0;
  const zonder = diagnose?.zonderTreffer || 0;
  if (totaal === 0) return { ok: true, melding: '' };

  const deel = zonder / totaal;
  if (deel < drempel) return { ok: true, melding: '' };

  return {
    ok: false,
    melding: `Documentvolgorde: ${zonder} van ${totaal} verbeterpunten zijn niet in de `
           + 'tekst teruggevonden en staan daardoor achteraan in modelvolgorde.',
  };
}
