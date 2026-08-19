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
 */

export const consistentieTool = {
  name: 'controleer_consistentie',
  description: 'Meld uitsluitend issues waarvan de titel meer beweert dan de bevinding aantoont, of waarvan een berekening in de titel niet klopt.',
  input_schema: {
    type: 'object',
    properties: {
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

Voorbeeld van een fout die je moet vangen:
  titel: "Percentages tellen op tot meer dan 100%"
  bevinding: "De percentages bedragen 30% + 39% = 69% in totaal, wat ongebruikelijk is en niet gemotiveerd."
  → 69% is geen 100%. De titel beweert een overschrijding die de bevinding weerlegt.
  → nieuw_onderwerp: "Zorgkortingspercentages ongebruikelijk en niet gemotiveerd" (de observatie die WEL overeind blijft)
  → ernst_te_hoog: true (de ernst berustte op de vermeende overschrijding)

Herschrijf de titel naar wat de bevinding wél aantoont. Verwijder het issue niet en verzin geen nieuwe inhoud —
de onderliggende observatie blijft staan, alleen de titel wordt eerlijk gemaakt.

Beoordeel NIET of de bevinding juridisch juist is, of de passage klopt, of het issue terecht is.
Alleen de samenhang tussen titel en bevinding. Bij twijfel: geen correctie.`;

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

    toegepast.push({ index: i, oud: aangepast[i].onderwerp, nieuw, reden: c.reden || '' });
    aangepast[i].onderwerp = nieuw;
    if (c.ernst_te_hoog === true) {
      aangepast[i].ernst = ERNST_OMLAAG[aangepast[i].ernst] ?? aangepast[i].ernst;
    }
  }
  return { issues: aangepast, toegepast };
}
