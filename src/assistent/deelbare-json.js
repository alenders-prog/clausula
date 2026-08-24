/**
 * src/assistent/deelbare-json.js
 * Leest één tekstveld uit JSON die nog binnenkomt.
 *
 * Waarom dit bestaat: het antwoord van de assistent komt terug als tool-aanroep,
 * dus als één JSON-object. Anthropic streamt dat als losse stukjes tekst
 * (`input_json_delta`). Halverwege is het geen geldige JSON en gooit `JSON.parse`
 * een fout — terwijl het veld dat de gebruiker wil zien, `antwoord`, er dan al
 * grotendeels in staat.
 *
 * Deze lezer haalt dat ene veld eruit zonder het geheel te hoeven begrijpen. Alles
 * wat nog niet binnen is wordt overgeslagen: een half afgemaakte escape of een
 * afgebroken \u-reeks levert de tekst tot dát punt op, en de volgende aanroep met
 * meer invoer vult hem aan.
 *
 * De veldvolgorde in het schema bepaalt hoe snel dit werkt: `antwoord` staat op
 * plaats twee, dus de eerste zin is er ruim voordat signalen en bronnen volgen.
 */

const ENKELVOUDIG = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };

/**
 * @param {string} json   de JSON zoals die tot nu toe binnen is
 * @param {string} veld   naam van het tekstveld
 * @returns {string|null} de tekst tot nu toe, of null als het veld nog niet begonnen is
 */
export function leesTekstVeld(json, veld) {
  const bron = String(json ?? '');
  const merk = `"${veld}"`;
  let p = bron.indexOf(merk);
  if (p === -1) return null;
  p += merk.length;

  while (p < bron.length && /\s/.test(bron[p])) p++;
  if (bron[p] !== ':') return null;
  p++;
  while (p < bron.length && /\s/.test(bron[p])) p++;
  // Geen aanhalingsteken: de waarde is nog niet begonnen, of het is geen tekstveld.
  if (bron[p] !== '"') return null;
  p++;

  let uit = '';
  while (p < bron.length) {
    const c = bron[p];

    if (c === '"') return uit;          // veld compleet

    if (c === '\\') {
      const teken = bron[p + 1];
      if (teken === undefined) return uit;   // escape half binnen — wacht op de rest
      if (teken === 'u') {
        const hex = bron.slice(p + 2, p + 6);
        if (hex.length < 4) return uit;      // \u-reeks half binnen
        uit += String.fromCharCode(parseInt(hex, 16));
        p += 6;
        continue;
      }
      uit += ENKELVOUDIG[teken] ?? teken;
      p += 2;
      continue;
    }

    uit += c;
    p++;
  }

  return uit;                            // nog niet compleet, maar bruikbaar
}

/**
 * Houdt bij hoeveel er al doorgegeven is, zodat de aanroeper alleen het nieuwe
 * stuk hoeft te renderen in plaats van de tekst steeds opnieuw op te bouwen.
 */
export function maakVeldVolger(veld) {
  let doorgegeven = 0;
  return function nieuwStuk(json) {
    const tekst = leesTekstVeld(json, veld);
    if (tekst === null || tekst.length <= doorgegeven) return '';
    const stuk = tekst.slice(doorgegeven);
    doorgegeven = tekst.length;
    return stuk;
  };
}
