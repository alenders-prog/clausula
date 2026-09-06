/**
 * Unit tests — src/rapport/mag-samenvoegen.js
 *
 * Aanleiding: pass 4 van `dedupIssues` voegde issues samen op woordoverlap in de titel,
 * zonder naar de passage te kijken. Met het gemeten voorbeeld uit
 * `api/_prompts/consolidatie.js`: "Ingangsdatum kinderalimentatie" ≈ "Ingangsdatum
 * partneralimentatie" haalt 0,50 — precies de drempel — terwijl het twee verschillende
 * issues zijn met elk een eigen correctie.
 */

import { describe, it, expect } from 'vitest';
import { magSamenvoegen, wijstNaarAndereplek } from '../../src/rapport/mag-samenvoegen.js';

describe('twee eigen vindplaatsen blijven twee issues', () => {
  it('houdt issues met verschillende passages uit elkaar', () => {
    const a = { passage: 'De kinderalimentatie word jaarlijks verhoogd met het percentage.' };
    const b = { passage: 'Ouders zijn overeengekomen dat beide hierover beheer wordtgekregen.' };
    expect(magSamenvoegen(a, b)).toBe(false);
  });

  it('houdt issues met verschillende artikelnummers uit elkaar, ook zonder passage', () => {
    expect(magSamenvoegen({ artikel: '21' }, { artikel: '22' })).toBe(false);
  });

  it('is het geval dat aanleiding was', () => {
    // Twee tikfouten rond hetzelfde woord "wordt", op twee plekken in hetzelfde document.
    const a = { onderwerp: "Spelfout: 'word' in plaats van 'wordt'", artikel: '22',
                passage: 'De kinderalimentatie word jaarlijks verhoogd.' };
    const b = { onderwerp: "Spelfout: 'wordtgekregen' aan elkaar geschreven", artikel: '21',
                passage: 'Ouders zijn overeengekomen dat beide hierover beheer wordtgekregen.' };
    expect(magSamenvoegen(a, b)).toBe(false);
  });
});

describe('zonder passage beslist de titel, zoals voorheen', () => {
  it('laat samenvoegen toe als één van beide geen passage heeft', () => {
    // Een gemis heeft van nature geen zin om naar te wijzen — dat staat ook in de
    // serverprompt. Dan zegt de passage niets en blijft de titelvergelijking leidend.
    expect(magSamenvoegen({ passage: 'Een zin.' }, { passage: '' })).toBe(true);
    expect(magSamenvoegen({}, {})).toBe(true);
    expect(magSamenvoegen({ passage: null }, { passage: undefined })).toBe(true);
  });

  it('laat samenvoegen toe bij dezelfde passage', () => {
    const p = 'Partijen komen overeen dat de woning wordt verkocht.';
    expect(magSamenvoegen({ passage: p }, { passage: p })).toBe(true);
  });

  it('ziet een kortere aanhaling van dezelfde zin als dezelfde plek', () => {
    // Analyse-calls citeren dezelfde zin soms korter; dat is één plek, geen twee.
    const lang  = 'Partijen komen overeen dat de woning wordt verkocht en de opbrengst wordt gedeeld.';
    const kort  = 'de woning wordt verkocht';
    expect(wijstNaarAndereplek({ passage: lang }, { passage: kort })).toBe(false);
    expect(magSamenvoegen({ passage: lang }, { passage: kort })).toBe(true);
  });

  it('negeert verschillen in witruimte en hoofdletters', () => {
    expect(wijstNaarAndereplek(
      { passage: 'De  woning   wordt verkocht.' },
      { passage: 'de woning wordt verkocht.' },
    )).toBe(false);
  });
});

describe('het artikelnummer telt alleen als beide het hebben', () => {
  it('blokkeert niet als er maar één een artikel heeft', () => {
    expect(magSamenvoegen({ artikel: '21' }, {})).toBe(true);
    expect(magSamenvoegen({}, { artikel: '21' })).toBe(true);
  });

  it('laat hetzelfde artikel gewoon door', () => {
    expect(magSamenvoegen({ artikel: '21' }, { artikel: '21' })).toBe(true);
  });
});
