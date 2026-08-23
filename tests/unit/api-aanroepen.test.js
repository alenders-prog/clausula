/**
 * Unit tests — bewaking op API-aanroepen
 *
 * Deze tests lezen de broncode als tekst. Ze bewijzen niets over gedrag; ze vangen
 * één klasse fouten die pas bij de gebruiker zichtbaar wordt, en dan als iets dat
 * nergens naar wijst.
 *
 * Aanleiding (23 augustus 2026). De assistent toonde
 *
 *     Er is een fout opgetreden: Unexpected token 'A', "An error o"... is not valid JSON
 *
 * Dat was geen fout van de assistent maar van de JSON-parser: acht aanroepen deden
 * `await resp.json()` zonder te kijken of er JSON tegenover stond. Overschrijdt een
 * serverless functie zijn tijdslimiet, dan stuurt Vercel een platte foutpagina terug
 * die begint met "An error occurred with your deployment".
 *
 * De aanname "mijn endpoint geeft JSON terug" is verkeerd geformuleerd. De juiste is:
 * "mijn endpoint geeft JSON terug áls hij de kans krijgt af te maken". Vercel kan de
 * invocatie beëindigen en zijn eigen antwoord in de plaats zetten.
 *
 * Twee dingen worden hier bewaakt:
 *   1. geen `resp.json()` op een /api/-aanroep — gebruik `leesAntwoord()`
 *   2. elk endpoint heeft een eigen `maxDuration` in vercel.json
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '../..');
const lees = p => readFileSync(join(WORTEL, p), 'utf8');

/** De bestanden waarin client-code naar /api/ belt. */
const CLIENTBESTANDEN = ['index.html', 'assistent-mobiel.html', 'assistent-core.js',
  'registreer.html', 'login.html'];

/**
 * Aanroepen die bewust rechtstreeks `.json()` mogen lezen, met de reden erbij.
 * Elke uitzondering staat hier één keer; groeit deze lijst, dan is dat een besluit
 * dat in de diff zichtbaar is.
 */
const UITZONDERINGEN = [
  // Beide staan achter een `if (!resp.ok) return` en in een try/catch. Ze zijn kort
  // (versleutelen van een namenlijst) en falen niet-fataal: zonder ontsleuteling
  // toont de app pseudoniemen in plaats van namen.
  { bestand: 'index.html',            endpoint: 'naam-decrypt' },
  { bestand: 'index.html',            endpoint: 'naam-encrypt' },
  { bestand: 'assistent-mobiel.html', endpoint: 'naam-decrypt' },
  // Adobe: het foutpad gebruikt `.json().catch(() => ({}))`, het succespad draait
  // alleen bij status 200 van onze eigen functie.
  { bestand: 'index.html',            endpoint: 'adobe-start' },
  { bestand: 'index.html',            endpoint: 'adobe-result' },
  // De SSE-endpoints lezen de stream zelf; `.json()` staat er alleen op het foutpad,
  // afgeschermd met `.catch()`.
  { bestand: 'index.html',            endpoint: 'analyseer' },
];

/** Zoekt elke fetch naar /api/ en geeft het endpoint + de tien regels erna terug. */
function apiAanroepen(bron) {
  const regels = bron.split('\n');
  const uit = [];
  regels.forEach((regel, i) => {
    const m = regel.match(/fetch\(\s*['"`]\/api\/([a-z-]+)['"`]/);
    if (m) uit.push({ endpoint: m[1], regelnr: i + 1, venster: regels.slice(i, i + 14).join('\n') });
  });
  return uit;
}

describe('client-aanroepen naar /api/', () => {
  it('leest geen enkele aanroep het antwoord met resp.json()', () => {
    const overtredingen = [];

    for (const bestand of CLIENTBESTANDEN) {
      for (const { endpoint, regelnr, venster } of apiAanroepen(lees(bestand))) {
        if (UITZONDERINGEN.some(u => u.bestand === bestand && u.endpoint === endpoint)) continue;
        // `.json()` binnen het venster ná de fetch, zonder .catch() erachter.
        const ruw = venster.match(/await\s+\w+\.json\(\)(?!\s*\.catch)/);
        if (ruw) {
          overtredingen.push(
            `${bestand}:${regelnr} (/api/${endpoint}) leest met ${ruw[0].trim()} — `
            + 'gebruik leesAntwoord(resp) uit src/api-antwoord.js',
          );
        }
      }
    }

    expect(overtredingen, `\n${overtredingen.join('\n')}\n`).toEqual([]);
  });

  it('laat elke assistent-aanroep op mobiel streamen', () => {
    // De mobiele assistent heeft geen rawModus-paden — alle aanroepen gaan door het
    // adviespad, en dat streamt. Op 23 augustus 2026 was er één van de twee vergeten:
    // `stuurActie` (de actiebalk) streamde wél, `stuurBericht` (de verstuurknop, dus
    // veruit het meest gebruikte pad) niet. Op desktop viel dat niet op, want daar
    // gaat het om een ander bestand.
    //
    // Geldt alleen voor mobiel: index.html heeft wél rawModus-aanroepen (clausule,
    // mail, klanttekst) en die leveren vrije tekst zonder veld om te volgen.
    expect(lees('assistent-mobiel.html')).not.toMatch(/rawModus/);

    const zonderStroom = apiAanroepen(lees('assistent-mobiel.html'))
      .filter(a => a.endpoint === 'ai-assistent' && !/stream:\s*true/.test(a.venster))
      .map(a => `assistent-mobiel.html:${a.regelnr}`);

    expect(zonderStroom, `aanroep(en) zonder stream: ${zonderStroom.join(', ')}`).toEqual([]);
  });

  it('vindt de aanroepen überhaupt — anders bewaakt de test hierboven niets', () => {
    // Zonder deze controle zou een gewijzigde schrijfwijze van fetch() de test
    // stilzwijgend leegmaken, en zou hij blijven slagen zonder iets te doen.
    const totaal = CLIENTBESTANDEN.reduce((n, b) => n + apiAanroepen(lees(b)).length, 0);
    expect(totaal).toBeGreaterThanOrEqual(15);
  });
});

describe('vercel.json', () => {
  const config = JSON.parse(lees('vercel.json'));
  const endpoints = readdirSync(join(WORTEL, 'api'))
    .filter(f => f.endsWith('.js') && !f.startsWith('_'))
    .map(f => `api/${f}`);

  it('geeft elk endpoint een eigen maxDuration', () => {
    // Zonder eigen waarde geldt Vercels standaard, en die is veel korter dan 60s.
    // api/uitnodigen.js opent een SMTP-verbinding: precies het soort werk dat soms
    // tien seconden duurt en soms dertig.
    const zonder = endpoints.filter(e => !config.functions?.[e]?.maxDuration);
    expect(zonder, `zonder maxDuration: ${zonder.join(', ')}`).toEqual([]);
  });

  it('noemt geen endpoints die niet bestaan', () => {
    const spoken = Object.keys(config.functions ?? {}).filter(e => !endpoints.includes(e));
    expect(spoken, `staan in vercel.json maar niet in api/: ${spoken.join(', ')}`).toEqual([]);
  });

  it('blijft onder de twaalf serverless functies van het Hobby-plan', () => {
    // Op 21 augustus 2026 sneuvelde hierop een deploy: de map api/prompts/ bracht het
    // totaal op vijftien. De build slaagde, het uitrollen niet — elf commits bleven
    // stil op GitHub staan terwijl de site de oude versie bleef serveren.
    expect(endpoints.length).toBeLessThanOrEqual(12);
  });
});
