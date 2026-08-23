/**
 * Unit tests — src/assistent/gedeeltelijk-json.js
 *
 * De fragmenten zijn geknipt uit een echt antwoord van assistent_antwoord, op de
 * plekken waar een netwerkpakket kan eindigen: midden in een sleutel, midden in een
 * waarde, na een komma, en midden in een escape.
 *
 * De harde eis: nooit een half object teruggeven. Een afgekapt signaal leest een
 * mediator als een bevinding.
 */

import { describe, it, expect } from 'vitest';
import { parseerGedeeltelijk, maakSectieVolger } from '../../src/assistent/gedeeltelijk-json.js';

const VOLLEDIG = JSON.stringify({
  intent: 'casus',
  antwoord: '**Zeggenschap**\n\nDe woning is gemeenschappelijk.',
  bronnen: [{ citation: 'art. 3:170 BW' }, { citation: 'art. 1:88 BW' }],
  aannames: ['Uitgaande van gezamenlijk eigendom van de woning'],
  signalen: [{ perspectief: 'juridisch', ernst: 'hoog', tekst: 'Geen boetebeding opgenomen' }],
  vervolgacties: ['clausule_opstellen'],
});

describe('parseerGedeeltelijk', () => {
  it('leest een compleet object gewoon uit', () => {
    expect(parseerGedeeltelijk(VOLLEDIG)).toEqual(JSON.parse(VOLLEDIG));
  });

  it('geeft de complete velden terug en laat het lopende veld weg', () => {
    const half = '{"intent":"casus","antwoord":"De woning is gemeensch';
    expect(parseerGedeeltelijk(half)).toEqual({ intent: 'casus' });
  });

  it('geeft null zolang er nog geen enkele waarde af is', () => {
    expect(parseerGedeeltelijk('{"intent"')).toBe(null);
    expect(parseerGedeeltelijk('{"intent":')).toBe(null);
    expect(parseerGedeeltelijk('{"intent":"cas')).toBe(null);
    expect(parseerGedeeltelijk('')).toBe(null);
    expect(parseerGedeeltelijk(null)).toBe(null);
  });

  it('knipt een half array-element weg in plaats van het te gokken', () => {
    // Dit is de kern: een bron zonder citation zou als lege bron gerenderd worden.
    const half = '{"bronnen":[{"citation":"art. 3:170 BW"},{"citation":"art. 1:8';
    expect(parseerGedeeltelijk(half)).toEqual({ bronnen: [{ citation: 'art. 3:170 BW' }] });
  });

  it('houdt een compleet array-element wél vast', () => {
    const half = '{"bronnen":[{"citation":"art. 3:170 BW"},{"citation":"art. 1:88 BW"}';
    expect(parseerGedeeltelijk(half))
      .toEqual({ bronnen: [{ citation: 'art. 3:170 BW' }, { citation: 'art. 1:88 BW' }] });
  });

  it('laat een half signaal met drie velden vallen', () => {
    const half = '{"signalen":[{"categorie":"juridisch","ernst":"hoog","tekst":"Geen boete';
    expect(parseerGedeeltelijk(half)).toEqual({ signalen: [] });
  });

  it('verwart een sleutel niet met een waarde', () => {
    // Knippen ná "bronnen" zou {"bronnen"} opleveren: ongeldig.
    expect(parseerGedeeltelijk('{"intent":"casus","bronnen"')).toEqual({ intent: 'casus' });
    expect(parseerGedeeltelijk('{"intent":"casus","bronnen":')).toEqual({ intent: 'casus' });
  });

  it('wacht op een getal dat nog kan doorgroeien', () => {
    // "12" kan nog "123" worden; pas na de komma of het haakje staat het vast.
    expect(parseerGedeeltelijk('{"a":"x","n":12')).toEqual({ a: 'x' });
    expect(parseerGedeeltelijk('{"a":"x","n":12,')).toEqual({ a: 'x', n: 12 });
  });

  it('overleeft een escape midden in een waarde', () => {
    expect(parseerGedeeltelijk('{"a":"regel\\')).toBe(null);
    expect(parseerGedeeltelijk('{"a":"regel\\n","b":"x"}')).toEqual({ a: 'regel\n', b: 'x' });
  });

  it('geeft een half array-element nooit terug, ook niet met meerdere velden', () => {
    // Het geval dat de eerste versie van deze lezer liet doorglippen: een signaal
    // met wél een perspectief en ernst maar een halve tekst. Dat leest als een
    // afgeronde bevinding terwijl het er geen is.
    const half = '{"signalen":[{"perspectief":"juridisch","ernst":"hoog","tekst":"Geen boete';
    expect(parseerGedeeltelijk(half)).toEqual({ signalen: [] });
  });

  it('laat een aanhalingsteken binnen een waarde met rust', () => {
    expect(parseerGedeeltelijk('{"a":"hij zei \\"ja\\"","b":1}'))
      .toEqual({ a: 'hij zei "ja"', b: 1 });
  });

  it('bouwt hetzelfde object op als de stroom brok voor brok binnenkomt', () => {
    const eind = JSON.parse(VOLLEDIG);
    let buffer = '', laatste = null;
    for (let i = 0; i < VOLLEDIG.length; i += 5) {
      buffer += VOLLEDIG.slice(i, i + 5);
      const nu = parseerGedeeltelijk(buffer);
      if (nu) laatste = nu;
    }
    expect(laatste).toEqual(eind);
  });

  it('geeft onderweg nooit iets terug dat niet in het eindobject staat', () => {
    const eind = JSON.parse(VOLLEDIG);
    let buffer = '';
    for (let i = 0; i < VOLLEDIG.length; i += 3) {
      buffer += VOLLEDIG.slice(i, i + 3);
      const nu = parseerGedeeltelijk(buffer);
      if (!nu) continue;
      for (const [k, v] of Object.entries(nu)) {
        if (Array.isArray(v)) {
          // Elk element dat er staat, moet identiek in het eindresultaat voorkomen.
          v.forEach(el => expect(eind[k]).toContainEqual(el));
        } else {
          expect(v).toEqual(eind[k]);
        }
      }
    }
  });
});

describe('maakSectieVolger', () => {
  it('meldt een veld pas als de inhoud verandert', () => {
    const volg = maakSectieVolger(['bronnen', 'signalen']);
    expect(volg('{"intent":"casus","bronnen":[{"citation":"art. 3:170 BW"},')).toEqual({
      bronnen: [{ citation: 'art. 3:170 BW' }],
    });
    // Zelfde invoer nog eens: niets nieuws.
    expect(volg('{"intent":"casus","bronnen":[{"citation":"art. 3:170 BW"},')).toEqual({});
  });

  it('meldt een array die aangroeit opnieuw, met alles erin', () => {
    const volg = maakSectieVolger(['bronnen']);
    volg('{"bronnen":[{"citation":"a"},');
    expect(volg('{"bronnen":[{"citation":"a"},{"citation":"b"},')).toEqual({
      bronnen: [{ citation: 'a' }, { citation: 'b' }],
    });
  });

  it('zwijgt zolang er niets te melden valt', () => {
    const volg = maakSectieVolger(['bronnen']);
    expect(volg('{"intent":"cas')).toEqual({});
    expect(volg('{"intent":"casus"')).toEqual({});
  });
});
