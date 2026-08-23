/**
 * Unit tests — src/assistent/deelbare-json.js
 *
 * De stukjes hieronder zijn geknipt uit een echt antwoord van assistent_antwoord,
 * op de plekken waar een netwerkpakket kan eindigen: midden in een escape, midden
 * in een \u-reeks, en tussen de veldnaam en zijn waarde.
 */

import { describe, it, expect } from 'vitest';
import {
  leesTekstVeld, maakVeldVolger, gezieneVelden, maakVeldenVolger,
} from '../../src/assistent/deelbare-json.js';

const VOLLEDIG = '{"intent":"casus","antwoord":"**Zeggenschap over de woning**\\n\\n'
  + 'De woning is gemeenschappelijk eigendom.","bronnen":[]}';

describe('leesTekstVeld', () => {
  it('leest het veld uit een compleet object', () => {
    expect(leesTekstVeld(VOLLEDIG, 'antwoord'))
      .toBe('**Zeggenschap over de woning**\n\nDe woning is gemeenschappelijk eigendom.');
  });

  it('geeft null zolang het veld nog niet begonnen is', () => {
    expect(leesTekstVeld('{"intent":"cas', 'antwoord')).toBe(null);
    expect(leesTekstVeld('{"intent":"casus","antwoord"', 'antwoord')).toBe(null);
    expect(leesTekstVeld('{"intent":"casus","antwoord":', 'antwoord')).toBe(null);
  });

  it('geeft leeg zodra de waarde begint', () => {
    expect(leesTekstVeld('{"intent":"casus","antwoord":"', 'antwoord')).toBe('');
  });

  it('geeft de tekst tot nu toe bij een half antwoord', () => {
    expect(leesTekstVeld('{"intent":"casus","antwoord":"De woning is gemeensch', 'antwoord'))
      .toBe('De woning is gemeensch');
  });

  it('wacht op een escape die half binnen is', () => {
    // "...eigendom.\  — de \ is er, het teken erna nog niet.
    expect(leesTekstVeld('{"antwoord":"regel een\\', 'antwoord')).toBe('regel een');
  });

  it('wacht op een \\u-reeks die half binnen is', () => {
    expect(leesTekstVeld('{"antwoord":"prijs \\u20', 'antwoord')).toBe('prijs ');
    expect(leesTekstVeld('{"antwoord":"prijs \\u20ac', 'antwoord')).toBe('prijs €');
  });

  it('vertaalt de escapes die in een antwoord voorkomen', () => {
    expect(leesTekstVeld('{"antwoord":"a\\nb\\tc\\"d\\\\e"}', 'antwoord'))
      .toBe('a\nb\tc"d\\e');
  });

  it('stopt bij het einde van het veld en pakt niet het volgende erbij', () => {
    expect(leesTekstVeld('{"antwoord":"klaar","signalen":["nog iets"]}', 'antwoord'))
      .toBe('klaar');
  });

  it('vindt een veld dat verderop staat', () => {
    expect(leesTekstVeld(VOLLEDIG, 'intent')).toBe('casus');
  });

  it('geeft null voor een veld dat niet bestaat of geen tekst is', () => {
    expect(leesTekstVeld(VOLLEDIG, 'signalen')).toBe(null);
    expect(leesTekstVeld(VOLLEDIG, 'bronnen')).toBe(null);
    expect(leesTekstVeld('', 'antwoord')).toBe(null);
    expect(leesTekstVeld(null, 'antwoord')).toBe(null);
  });
});

describe('maakVeldVolger', () => {
  it('geeft per keer alleen het nieuwe stuk', () => {
    const volg = maakVeldVolger('antwoord');
    expect(volg('{"intent":"casus","antwoord":"De woning')).toBe('De woning');
    expect(volg('{"intent":"casus","antwoord":"De woning is gemeen')).toBe(' is gemeen');
    expect(volg('{"intent":"casus","antwoord":"De woning is gemeenschappelijk."')).toBe('schappelijk.');
  });

  it('geeft niets terug zolang er geen nieuwe tekens zijn', () => {
    const volg = maakVeldVolger('antwoord');
    volg('{"antwoord":"vast');
    expect(volg('{"antwoord":"vast')).toBe('');
  });

  it('zwijgt tot het veld begint', () => {
    const volg = maakVeldVolger('antwoord');
    expect(volg('{"intent":"cas')).toBe('');
    expect(volg('{"intent":"casus","antwoord":"Ja')).toBe('Ja');
  });

  it('zet een stroom stukjes weer correct in elkaar', () => {
    // Zoals Anthropic het levert: input_json_delta in willekeurige brokjes.
    const volg = maakVeldVolger('antwoord');
    let buffer = '', opgebouwd = '';
    for (let i = 0; i < VOLLEDIG.length; i += 7) {
      buffer += VOLLEDIG.slice(i, i + 7);
      opgebouwd += volg(buffer);
    }
    expect(opgebouwd).toBe(JSON.parse(VOLLEDIG).antwoord);
  });
});

describe('gezieneVelden', () => {
  const ONDERDELEN = ['bronnen', 'aannames', 'signalen', 'vervolgacties'];

  it('meldt alleen wat er al staat', () => {
    const half = '{"intent":"casus","antwoord":"…","bronnen":[{"citation":"art. 1:88 BW"}],"aannames":[';
    expect(gezieneVelden(half, ONDERDELEN)).toEqual(['bronnen', 'aannames']);
  });

  it('meldt niets bij een antwoord dat nog loopt', () => {
    expect(gezieneVelden('{"intent":"casus","antwoord":"De woning is', ONDERDELEN)).toEqual([]);
  });

  it('trapt niet in een geneste sleutel met dezelfde naam', () => {
    // In assistent_antwoord bestaat die botsing niet; dit legt de aanname vast,
    // zodat een schemawijziging die hem breekt hier stukloopt.
    const bron = '{"antwoord":"x","signalen":[{"tekst":"y","ernst":"hoog"}]}';
    expect(gezieneVelden(bron, ['ernst', 'tekst'])).toEqual(['ernst', 'tekst']);
  });

  it('overleeft lege invoer', () => {
    expect(gezieneVelden('', ONDERDELEN)).toEqual([]);
    expect(gezieneVelden(null, ONDERDELEN)).toEqual([]);
    expect(gezieneVelden('{"bronnen":[]}')).toEqual([]);
  });
});

describe('maakVeldenVolger', () => {
  it('meldt elk veld precies één keer', () => {
    const volg = maakVeldenVolger(['bronnen', 'aannames', 'signalen']);
    expect(volg('{"antwoord":"x"')).toEqual([]);
    expect(volg('{"antwoord":"x","bronnen":[')).toEqual(['bronnen']);
    expect(volg('{"antwoord":"x","bronnen":[],"aannames":[')).toEqual(['aannames']);
    expect(volg('{"antwoord":"x","bronnen":[],"aannames":[]')).toEqual([]);
  });

  it('meldt er meerdere tegelijk als ze in één brok binnenkomen', () => {
    const volg = maakVeldenVolger(['bronnen', 'aannames']);
    expect(volg('{"bronnen":[],"aannames":[]}')).toEqual(['bronnen', 'aannames']);
  });
});
