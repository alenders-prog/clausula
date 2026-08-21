/**
 * Unit tests — src/rapport/kennisbank-selectie.js
 *
 * Aanleiding (21 augustus 2026): een verificatie schreef "(art. 1:247 BW,
 * trainingskennis — verifieer bij twijfel)" terwijl dat artikel gewoon in de
 * kennisbank staat, met de tags gezag, ouderschapsplan en kinderen_minderjarig.
 */

import { describe, it, expect } from 'vitest';
import { artikelVerwijzingen, voegChunksSamen, trefwoord } from '../../src/rapport/kennisbank-selectie.js';

describe('artikelVerwijzingen', () => {
  it('vindt BW-artikelen met dubbele punt', () => {
    expect(artikelVerwijzingen('Conform art. 1:88 BW en artikel 3:170 BW'))
      .toEqual(['1:88', '3:170']);
  });

  it('vindt artikelen zonder dubbele punt mét wetsaanduiding', () => {
    // Deze categorie was principieel onvindbaar: het oude patroon eiste een dubbele punt.
    expect(artikelVerwijzingen('jo. art. 828 Rv')).toEqual(['828 rv']);
    expect(artikelVerwijzingen('afwijking conform artikel 5 WVPS')).toEqual(['5 wvps']);
  });

  it('vindt beide soorten in één tekst', () => {
    const t = 'art. 1:80c lid 3 BW jo. art. 828 Rv, en art. 11 WVPS';
    expect(artikelVerwijzingen(t)).toEqual(expect.arrayContaining(['1:80c', '828 rv', '11 wvps']));
  });

  it('negeert een kaal artikelnummer zonder wetsnaam', () => {
    // "art. 5" alleen levert te veel valse treffers op in een kennisbank vol nummers.
    expect(artikelVerwijzingen('zie art. 5 hierboven')).toEqual([]);
  });

  it('ontdubbelt en respecteert het maximum', () => {
    expect(artikelVerwijzingen('1:88 en 1:88 en 1:89')).toEqual(['1:88', '1:89']);
    expect(artikelVerwijzingen('1:1 2:2 3:3 4:4 5:5', 3)).toHaveLength(3);
  });

  it('overleeft lege invoer', () => {
    expect(artikelVerwijzingen('')).toEqual([]);
    expect(artikelVerwijzingen(null)).toEqual([]);
  });
});

describe('voegChunksSamen', () => {
  const a = { citation: 'Art. 1:88 BW' };
  const b = { citation: 'art. 1:247 BW — ouderlijk gezag' };
  const c = { citation: 'Art. 1:157 BW' };

  it('houdt de volgorde artikel → tags → trefwoord aan', () => {
    expect(voegChunksSamen({ trefwoord: [c], tags: [b], artikel: [a] }).map(x => x.citation))
      .toEqual([a.citation, b.citation, c.citation]);
  });

  it('ontdubbelt op citation', () => {
    expect(voegChunksSamen({ artikel: [a, a], tags: [a] })).toHaveLength(1);
  });

  it('respecteert het maximum', () => {
    expect(voegChunksSamen({ artikel: [a, b, c] }, 2)).toHaveLength(2);
  });

  it('overleeft ontbrekende of ongeldige bronnen', () => {
    expect(voegChunksSamen({})).toEqual([]);
    expect(voegChunksSamen()).toEqual([]);
    expect(voegChunksSamen({ artikel: null, tags: 'geen array' })).toEqual([]);
    expect(voegChunksSamen({ artikel: [{ geen: 'citation' }] })).toEqual([]);
  });
});

describe('trefwoord', () => {
  it('kiest het langste woord — het onderwerp, niet het eerste bijwoord', () => {
    // De oude versie nam het eerste woord langer dan vijf letters en kwam op
    // "Ontbinding" uit, wat over elk echtscheidingsdocument iets oplevert.
    expect(trefwoord('Ontbinding geregistreerd partnerschap vermeld'))
      .toBe('geregistreerd');
    expect(trefwoord('Pensioenverevening: uitvoeringsafspraken onvolledig'))
      .toBe('uitvoeringsafspraken');
  });

  it('valt terug op de aanbeveling als de titel niets bruikbaars heeft', () => {
    expect(trefwoord('Fout in tekst', 'Voeg een nihilbeding toe')).toBe('nihilbeding');
  });

  it('negeert de assistent-markering', () => {
    expect(trefwoord('vanuit AI Assistent hoofdverblijfplaats')).toBe('hoofdverblijfplaats');
  });

  it('geeft leeg terug als er niets bruikbaars is', () => {
    expect(trefwoord('Te kort')).toBe('');
    expect(trefwoord('')).toBe('');
    expect(trefwoord(null)).toBe('');
  });
});
