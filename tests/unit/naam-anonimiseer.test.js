/**
 * Unit tests — src/naam-anonimiseer.js
 *
 * Verifieert bouwAnonMap() en anonimiseerTekst() — de naam-pseudonimisering
 * die gebruikersinvoer anonimiseert vóór verzending naar de Anthropic API.
 *
 * Geen DOM-afhankelijkheden. Draait in Node/Vitest.
 */

import { describe, it, expect } from 'vitest';
import { bouwAnonMap, anonimiseerTekst } from '../../src/naam-anonimiseer.js';

// ── Hulpfunctie ───────────────────────────────────────────────────────────────
// Retourneert de eerste nep-voornaam die bouwAnonMap koppelt aan partij A.
function nepVoornaamA() {
  return 'Thomas'; // NEP_PERSONEN[0].fn
}
function nepVoornaamB() {
  return 'Lisette'; // NEP_PERSONEN[1].fn
}

// ── bouwAnonMap — basisregistratie ────────────────────────────────────────────

describe('bouwAnonMap — basisregistratie', () => {
  it('registreert volledige naam in naarAnon (lowercase)', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Martijn Jasperse' });
    expect(naarAnon.has('martijn jasperse')).toBe(true);
  });

  it('registreert voornaam als nep-voornaam (niet dubbele nep-naam)', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Martijn Jasperse' });
    // Voornaam "martijn" → nep.fn (alleen voornaam), NIET "Thomas Bergman"
    expect(naarAnon.get('martijn')).toBe(nepVoornaamA());
  });

  it('registreert achternaam als nep-achternaam', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Martijn Jasperse' });
    expect(naarAnon.get('jasperse')).toBe('Bergman');
  });

  it('registreert bezitsvorm voornaam (naam + s)', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Peter Jansen' });
    expect(naarAnon.has('peters')).toBe(true);
    expect(naarAnon.get('peters')).toBe(nepVoornaamA());
  });

  it('partij_a en partij_b krijgen verschillende nep-namen', () => {
    // Voornamen < 4 tekens worden niet geregistreerd (drempel length > 3).
    // Gebruik namen met voornaam ≥ 4 tekens.
    const { naarAnon } = bouwAnonMap({
      partij_a_naam: 'Peter Smit',
      partij_b_naam: 'Sandra Visser',
    });
    expect(naarAnon.get('peter')).toBe(nepVoornaamA());
    expect(naarAnon.get('sandra')).toBe(nepVoornaamB());
  });
});

// ── bouwAnonMap — gedeelde achternaam ─────────────────────────────────────────

describe('bouwAnonMap — gedeelde achternaam', () => {
  it('achternaam wordt NIET in naarAnon gezet als beide partijen die delen', () => {
    const { naarAnon } = bouwAnonMap({
      partij_a_naam: 'Peter de Vries',
      partij_b_naam: 'Sandra de Vries',
    });
    // Gedeelde achternaam mag niet in de map (verkeerde toewijzing)
    expect(naarAnon.has('de vries')).toBe(false);
    expect(naarAnon.has('vries')).toBe(false);
  });

  it('voornamen worden wél geregistreerd bij gedeelde achternaam', () => {
    const { naarAnon } = bouwAnonMap({
      partij_a_naam: 'Peter de Vries',
      partij_b_naam: 'Sandra de Vries',
    });
    expect(naarAnon.has('peter')).toBe(true);
    expect(naarAnon.has('sandra')).toBe(true);
  });
});

// ── bouwAnonMap — roepnamen ───────────────────────────────────────────────────

describe('bouwAnonMap — roepnamen via classificatie', () => {
  it('partij_a_roepnaam wordt als alias geregistreerd', () => {
    const { naarAnon } = bouwAnonMap({
      partij_a_naam:     'Alexander Lenders',
      partij_a_roepnaam: 'Sander Lenders',
    });
    // Roepnaam "sander" → zelfde nep als "alexander"
    expect(naarAnon.has('sander')).toBe(true);
    expect(naarAnon.get('sander')).toBe(naarAnon.get('alexander'));
  });

  it('naarEcht geeft roepnaam terug voor nep-voornaam', () => {
    const { naarEcht } = bouwAnonMap({
      partij_a_naam:     'Alexander Lenders',
      partij_a_roepnaam: 'Sander Lenders',
    });
    // Na herstel: nep.fn → roepnaam
    expect(naarEcht.get(nepVoornaamA())).toBe('Sander');
  });

  it('sterk afwijkende roepnaam levert een waarschuwing op', () => {
    const { waarschuwingen } = bouwAnonMap({
      partij_a_naam:     'Herma Eugenie ten Brink',
      partij_a_roepnaam: 'Manon ten Brink',
    });
    expect(waarschuwingen.length).toBeGreaterThan(0);
    expect(waarschuwingen[0].roepnaam).toBe('Manon');
  });
});

// ── bouwAnonMap — kinderen ────────────────────────────────────────────────────

describe('bouwAnonMap — kinderen', () => {
  it('kindernamen worden geregistreerd', () => {
    const { naarAnon } = bouwAnonMap({
      partij_a_naam:  'Kees Bakker',
      kinderen_namen: ['Emma Bakker'],
    });
    expect(naarAnon.has('emma')).toBe(true);
  });

  it('kind-legacy-placeholder [KIND_1] staat in naarEcht', () => {
    const { naarEcht } = bouwAnonMap({
      partij_a_naam:  'Kees Bakker',
      kinderen_namen: ['Emma Bakker'],
    });
    // Legacy placeholder verwijst naar roepnaam kind
    expect(naarEcht.get('[KIND_1]')).toBe('Emma');
  });

  it('meerdere kinderen krijgen elk een andere nep-naam', () => {
    const { naarAnon } = bouwAnonMap({
      partij_a_naam:  'Kees Bakker',
      kinderen_namen: ['Emma Bakker', 'Luuk Bakker'],
    });
    const nepEmma = naarAnon.get('emma');
    const nepLuuk = naarAnon.get('luuk');
    expect(nepEmma).toBeDefined();
    expect(nepLuuk).toBeDefined();
    expect(nepEmma).not.toBe(nepLuuk); // verschillende nep-namen
  });
});

// ── bouwAnonMap — bronNamen-parameter ─────────────────────────────────────────

describe('bouwAnonMap — roepnaam detectie via bronNamen', () => {
  it('roepnaam herkend uit bronNaam als die afwijkt van formele naam', () => {
    const { naarAnon } = bouwAnonMap(
      { partij_a_naam: 'Alexander Lenders' },
      ['Sander Lenders - bestandsnaam.pdf'],
    );
    // "Sander" uit de bestandsnaam → alias voor nep-voornaam A
    expect(naarAnon.has('sander')).toBe(true);
    expect(naarAnon.get('sander')).toBe(nepVoornaamA());
  });

  it('zonder bronNamen: geen roepnaam-detectie via bestandsnamen', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Alexander Lenders' });
    // Zonder bronNamen: "sander" staat er niet in (formele naam is "alexander")
    expect(naarAnon.has('sander')).toBe(false);
  });
});

// ── bouwAnonMap — return-structuur ────────────────────────────────────────────

describe('bouwAnonMap — return-structuur', () => {
  it('geeft alle vier maps/arrays terug', () => {
    const result = bouwAnonMap({ partij_a_naam: 'Jan Smit' });
    expect(result.naarAnon).toBeInstanceOf(Map);
    expect(result.naarEcht).toBeInstanceOf(Map);
    expect(result.naarEchtVolledig).toBeInstanceOf(Map);
    expect(Array.isArray(result.roepnamen)).toBe(true);
    expect(Array.isArray(result.waarschuwingen)).toBe(true);
  });

  it('lege classificatie geeft lege maps (geen crash)', () => {
    const result = bouwAnonMap({});
    expect(result.naarAnon.size).toBe(0);
  });

  it('null-classificatie geeft lege maps (geen crash)', () => {
    const result = bouwAnonMap(null);
    expect(result.naarAnon.size).toBe(0);
  });
});

// ── anonimiseerTekst — naam-vervanging ────────────────────────────────────────

describe('anonimiseerTekst — naam-vervanging', () => {
  it('vervangt volledige naam case-insensitief', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Jan Smit' });
    const r = anonimiseerTekst('jan smit betaalt', naarAnon);
    expect(r).not.toContain('jan');
    expect(r).not.toContain('smit');
  });

  it('vervangt hoofdlettervariant', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Jan Smit' });
    expect(anonimiseerTekst('JAN SMIT tekent', naarAnon)).not.toContain('JAN');
  });

  it('langste match gaat voor — geen dubbele nep-naam', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Martijn Jasperse' });
    const r = anonimiseerTekst('Martijn Jasperse tekent het convenant', naarAnon);
    // Volledige naam → één nep. Mag NIET dubbel zijn ("Thomas Bergman Thomas")
    expect(r).not.toMatch(/Thomas Bergman Thomas|Bergman Bergman/);
  });

  it('geen match midden in woord (unicode-woordgrens)', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Jan Smit' });
    // "Janssen" bevat "jan" maar mag niet vervangen worden
    expect(anonimiseerTekst('Janssen is aanwezig', naarAnon)).toContain('Janssen');
  });

  it('BSN gemaskeerd als naarAnon entries bevat', () => {
    // anonimiseerTekst keert vroegtijdig terug als naarAnon leeg is (size === 0).
    // BSN-masking werkt alleen als er ook namen zijn geregistreerd.
    // Primaire BSN-masking is piiAnonimiseer(); dit is de secondary check.
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Peter Smit' });
    expect(anonimiseerTekst('BSN 123456789 van cliënt', naarAnon)).toContain('[BSN]');
  });
});

// ── anonimiseerTekst — edge cases ─────────────────────────────────────────────

describe('anonimiseerTekst — edge cases', () => {
  it('lege string → lege string', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Jan Smit' });
    expect(anonimiseerTekst('', naarAnon)).toBe('');
  });

  it('null → null', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Jan Smit' });
    expect(anonimiseerTekst(null, naarAnon)).toBeNull();
  });

  it('lege naarAnon-map → tekst ongewijzigd terug', () => {
    const result = anonimiseerTekst('Geen namen hier.', new Map());
    expect(result).toBe('Geen namen hier.');
  });

  it('naam met regex-speciale tekens veroorzaakt geen crash', () => {
    // Punt, haak, ster zijn speciale regex-tekens
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Jan (de) Smit' });
    expect(() => anonimiseerTekst('Jan (de) Smit tekent', naarAnon)).not.toThrow();
  });
});

// ── Gecombineerde casus ───────────────────────────────────────────────────────

describe('bouwAnonMap + anonimiseerTekst — gecombineerde casus', () => {
  it('volledige pipeline: namen + BSN verwijderd', () => {
    const { naarAnon } = bouwAnonMap({
      partij_a_naam: 'Peter Dikkeschei',
      partij_b_naam: 'Sandra Ropers',
    });
    const input = 'Peter Dikkeschei (BSN 123456789) en Sandra Ropers (BSN 987654321) tekenen.';
    const result = anonimiseerTekst(input, naarAnon);
    expect(result).not.toContain('Peter');
    expect(result).not.toContain('Dikkeschei');
    expect(result).not.toContain('Sandra');
    expect(result).not.toContain('Ropers');
    expect(result).not.toContain('123456789');
    expect(result).not.toContain('987654321');
    expect(result).toContain('[BSN]');
  });

  it('dezelfde input twee keer geanonimiseerd geeft hetzelfde resultaat', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Jan Smit' });
    const r1 = anonimiseerTekst('Jan Smit betaalt alimentatie.', naarAnon);
    const r2 = anonimiseerTekst('Jan Smit betaalt alimentatie.', naarAnon);
    expect(r1).toBe(r2);
  });
});
