/**
 * src/assistent/gedeeltelijk-json.js
 * Leest JSON die nog binnenkomt, en geeft terug wat er al compleet in staat.
 *
 * Aanleiding (23 augustus 2026). Het antwoord van de assistent komt terug als één
 * tool-aanroep, dus als één JSON-object. `deelbare-json.js` haalt daar het veld
 * `antwoord` uit terwijl het binnenkomt, zodat de tekst vast gelezen kan worden.
 * Maar dat is ongeveer een derde van wat het model schrijft: bronnen, aannames en
 * signalen volgden pas als álles binnen was, en verschenen dan in één klap.
 *
 * Halverwege is de JSON ongeldig — `{"bronnen":[{"citation":"art. 1:88` is geen
 * object. Deze lezer knipt terug tot het laatste punt waar wél een complete waarde
 * stond, sluit de openstaande haakjes, en levert een geldig object op. Wat nog
 * onderweg is ontbreekt gewoon; het groeit bij de volgende aanroep vanzelf aan.
 *
 * Bewust niet: een tolerante parser die halve waarden gokt. Een halve bron of een
 * afgekapt signaal is erger dan geen — de mediator leest het als een bevinding.
 */

/**
 * Geeft het object terug met alles wat compleet is, of null als er nog niets
 * bruikbaars staat.
 *
 * De regel die alles bepaalt: knippen mag alleen op een plek waar het afsluiten van
 * de openstaande haakjes **geen enkel object halveert**.
 *
 *   - het buitenste object mag onvolledig zijn — dat is juist de bedoeling; de
 *     ontbrekende velden komen vanzelf
 *   - een array mag onvolledig zijn — je krijgt minder elementen, elk compleet
 *   - een genest object mag dat níét: een aanname zonder haar `effect`, of een
 *     signaal zonder zijn `ernst`, leest als een afgeronde bevinding
 *
 * Een eerdere versie knipte overal en leverde precies zo'n halve aanname op. De
 * versie daarna knipte alléén op het hoogste niveau, en dan verschijnt een array
 * pas als hij helemaal af is — waarmee het hele doel verviel.
 */
export function parseerGedeeltelijk(json) {
  const bron = String(json ?? '');
  if (!bron.trim()) return null;

  const stapel = [];        // openstaande '{' en '['
  let inString = false;
  let escape   = false;
  let naDubbelePunt = false;

  let knip = -1;            // knip hier af (exclusief)
  let knipStapel = '';      // wat er dan nog gesloten moet worden

  // Veilig zolang er geen genest object openstaat. Het buitenste niveau (index 0)
  // mag onvolledig blijven; arrays ook. Een lege stapel betekent dat het hele
  // object net is afgesloten — dan valt er niets meer te halveren.
  const geenHalfObject = () => stapel.every((t, i) => i === 0 || t === '[');

  const markeerVeilig = (index) => {
    if (!geenHalfObject()) return;
    knip = index;
    knipStapel = stapel.map(t => (t === '{' ? '}' : ']')).reverse().join('');
  };

  for (let i = 0; i < bron.length; i++) {
    const c = bron[i];

    if (inString) {
      if (escape)       { escape = false; continue; }
      if (c === '\\')   { escape = true;  continue; }
      if (c === '"') {
        inString = false;
        // In een object is een string pas een waarde ná de dubbele punt; knippen na
        // `"bronnen"` zou `{"bronnen"}` opleveren. In een array is elke string een
        // waarde.
        const inArray = stapel[stapel.length - 1] === '[';
        if (naDubbelePunt || inArray) { naDubbelePunt = false; markeerVeilig(i + 1); }
      }
      continue;
    }

    if (c === '"')  { inString = true; continue; }
    if (c === '[')  { stapel.push(c); naDubbelePunt = false; markeerVeilig(i + 1); continue; }
    if (c === '{')  { stapel.push(c); naDubbelePunt = false; continue; }
    if (c === '}' || c === ']') { stapel.pop(); naDubbelePunt = false; markeerVeilig(i + 1); continue; }
    if (c === ':')  { naDubbelePunt = true; continue; }
    // Vóór de komma knippen: wat erna komt is per definitie nog niet af.
    if (c === ',')  { markeerVeilig(i); naDubbelePunt = false; continue; }
    // Getallen, true/false/null: pas veilig zodra er een scheidingsteken achter
    // staat — dat wordt door de komma- en haakjesregels afgehandeld. Een getal aan
    // het eind kan `12` of `123` worden, dus dat laten we vallen.
  }

  if (knip <= 0) return null;

  try {
    return JSON.parse(bron.slice(0, knip) + knipStapel);
  } catch {
    return null;
  }
}

/**
 * Meldt per aanroep welke van de gevraagde velden een nieuwe waarde hebben.
 * Vergelijkt op de JSON-vorm, zodat een array die met één element groeit ook
 * daadwerkelijk als gewijzigd geldt.
 *
 * @param {string[]} velden
 * @returns {(json:string) => Record<string, unknown>} alleen de gewijzigde velden
 */
export function maakSectieVolger(velden = []) {
  const vorige = new Map();
  return function gewijzigd(json) {
    const obj = parseerGedeeltelijk(json);
    if (!obj || typeof obj !== 'object') return {};
    const uit = {};
    for (const veld of velden) {
      if (!(veld in obj)) continue;
      const vorm = JSON.stringify(obj[veld]);
      if (vorige.get(veld) === vorm) continue;
      vorige.set(veld, vorm);
      uit[veld] = obj[veld];
    }
    return uit;
  };
}
