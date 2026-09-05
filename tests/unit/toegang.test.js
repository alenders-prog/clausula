/**
 * Unit tests — src/auth/toegang.js
 *
 * Aanleiding: `verwijder_gebruiker` schrapt alleen de rij in `gebruikersprofiel`. Het
 * auth-account blijft, dus een uit het kantoor verwijderde mediator houdt een werkende
 * login — en tot 5 september 2026 keek geen enkel endpoint verder dan een geldige JWT.
 *
 * De belangrijkste twee tests staan onderaan: een storing bij het ophalen mag géén
 * weigering worden. Dat is het verschil tussen "hoort nergens bij" en "kon het niet
 * ophalen", en als die twee samenvallen wordt een hapering bij Supabase een uitval voor
 * iedereen tegelijk.
 */

import { describe, it, expect } from 'vitest';
import { magApiGebruiken, PROFIEL } from '../../src/auth/toegang.js';

const ctx = (extra = {}) => ({ gebruikerId: 'u-1', organisatieId: 'org-1', profielStatus: PROFIEL.GEVONDEN, ...extra });

describe('de gewone gang van zaken', () => {
  it('laat een gebruiker met profiel en organisatie door', () => {
    const uit = magApiGebruiken(ctx());
    expect(uit.toegestaan).toBe(true);
    expect(uit.reden).toBe('ok');
  });
});

describe('het geval dat aanleiding was', () => {
  it('weigert een account zonder profielrij', () => {
    const uit = magApiGebruiken(ctx({ organisatieId: null, profielStatus: PROFIEL.GEEN_PROFIEL }));
    expect(uit.toegestaan).toBe(false);
    expect(uit.http).toBe(403);
  });

  it('weigert een profiel zonder organisatie', () => {
    const uit = magApiGebruiken(ctx({ organisatieId: null, profielStatus: PROFIEL.GEEN_ORG }));
    expect(uit.toegestaan).toBe(false);
    expect(uit.http).toBe(403);
  });

  it('zegt wat de gebruiker eraan kan doen, in plaats van alleen "geen toegang"', () => {
    const uit = magApiGebruiken(ctx({ profielStatus: PROFIEL.GEEN_PROFIEL }));
    expect(uit.melding).toMatch(/kantoor/i);
    expect(uit.melding).toMatch(/beheerder/i);
    expect(uit.melding).toMatch(/uit te nodigen/i);
  });

  it('onderscheidt 401 van 403 — niet ingelogd is iets anders dan niet welkom', () => {
    expect(magApiGebruiken(null).http).toBe(401);
    expect(magApiGebruiken({}).http).toBe(401);
    expect(magApiGebruiken({ gebruikerId: null }).http).toBe(401);
    expect(magApiGebruiken(ctx({ profielStatus: PROFIEL.GEEN_PROFIEL })).http).toBe(403);
  });
});

describe('een storing is geen weigering', () => {
  it('laat door als het profiel niet opgehaald kon worden', () => {
    // Anders wordt een hapering bij Supabase een uitval voor iedereen tegelijk, precies
    // op het moment dat er al iets stuk is. Het gat dat dit openlaat is niet uit te
    // lokken door een aanvaller.
    const uit = magApiGebruiken(ctx({ organisatieId: null, profielStatus: PROFIEL.ONBEKEND }));
    expect(uit.toegestaan).toBe(true);
    expect(uit.reden).toBe('profiel_onbekend');
  });

  it('laat ook door als de status ontbreekt — een oude aanroeper mag niets breken', () => {
    const uit = magApiGebruiken({ gebruikerId: 'u-1', organisatieId: 'org-1' });
    expect(uit.toegestaan).toBe(true);
  });

  it('weigert nooit op een lege organisatie alléén', () => {
    // organisatieId is null bij zowel "geen profiel" als "lookup mislukt". Wie op dát veld
    // beslist in plaats van op de status, weigert dus ook tijdens een storing.
    const uit = magApiGebruiken({ gebruikerId: 'u-1', organisatieId: null });
    expect(uit.toegestaan).toBe(true);
  });
});
