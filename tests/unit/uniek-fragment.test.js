/**
 * Unit tests — src/viewer/uniek-fragment.js
 *
 * Het geval van 24 augustus 2026. Een bevinding over de kerstverdeling citeerde:
 *
 *     "De ouder waar het kind 2de kerstdag viert, zal het kind blijven tot en met
 *      oud en nieuw. …"
 *
 * De viewer sprong naar het artikel over identiteitsbewijzen, twintig regels
 * eerder. De laatste terugval van het zoeken nam het eerste venster van vier
 * woorden — "De ouder waar het" — en dat staat óók in "…in beheer bij de ouder
 * waar het kind staat ingeschreven".
 *
 * De passage stond gewoon in het document. Hij werd alleen op de verkeerde plek
 * gevonden, en dat is erger dan niets vinden: de mediator leest een citaat naast
 * een alinea die er niets mee te maken heeft en concludeert dat de bevinding niet
 * klopt.
 */

import { describe, it, expect } from 'vitest';
import { kiesUniekFragment, telVoorkomens, normaliseer } from '../../src/viewer/uniek-fragment.js';

// Verkorte weergave van het echte document, met beide plekken erin.
const DOC = `
3. Identiteitsbewijzen
Het identiteitsbewijs van de kinderen is in beheer bij de ouder waar het kind staat
ingeschreven. Deze ouder draagt zorg voor tijdige verlenging van het document.

11. Feestdagen
De ouder waar het kind 2de kerstdag viert, zal het kind blijven tot en met oud en
nieuw. De wissel zal op nieuwjaarsdag voor 12 uur plaatsvinden.
`;

describe('normaliseer', () => {
  it('haalt leestekens weg en plakt witruimte samen', () => {
    expect(normaliseer('De  ouder,\n waar het kind 2de kerstdag viert.'))
      .toBe('de ouder waar het kind 2de kerstdag viert');
  });

  it('gaat om met lege invoer', () => {
    expect(normaliseer('')).toBe('');
    expect(normaliseer(null)).toBe('');
  });
});

describe('telVoorkomens', () => {
  it('telt hoe vaak een fragment voorkomt', () => {
    const doc = normaliseer(DOC);
    expect(telVoorkomens(doc, 'de ouder waar het')).toBe(2);
    expect(telVoorkomens(doc, 'kerstdag viert')).toBe(1);
    expect(telVoorkomens(doc, 'komt hier niet voor')).toBe(0);
  });

  it('telt overlappende voorkomens', () => {
    expect(telVoorkomens('aaaa', 'aa')).toBe(3);
  });
});

describe('kiesUniekFragment', () => {
  const PASSAGE = 'De ouder waar het kind 2de kerstdag viert, zal het kind blijven '
                + 'tot en met oud en nieuw. De wissel zal op nieuwjaarsdag voor 12 uur plaatsvinden.';

  it('slaat het dubbelzinnige begin over — dit is het hele punt', () => {
    const r = kiesUniekFragment(PASSAGE, DOC);
    expect(r).not.toBeNull();
    expect(r.fragment).not.toBe('de ouder waar het');
    expect(r.voorkomens).toBe(1);
  });

  it('wijst naar de feestdagen-alinea en niet naar de identiteitsbewijzen', () => {
    const doc = normaliseer(DOC);
    const r = kiesUniekFragment(PASSAGE, DOC);
    expect(r.index).toBeGreaterThan(doc.indexOf('feestdagen'));
  });

  it('neemt het eerste fragment dat precies één keer voorkomt', () => {
    // Dat is "waar het kind 2de" (het derde venster), niet "kind 2de kerstdag
    // viert". Het schuift dus maar twee woorden op — precies genoeg om het
    // dubbelzinnige begin te ontlopen. Verder opschuiven zou onnodig zijn: hoe
    // korter je bij de start van de passage blijft, hoe beter de markering
    // overeenkomt met wat de bevinding citeert.
    const r = kiesUniekFragment(PASSAGE, DOC);
    expect(r.fragment).toBe('waar het kind 2de');
    expect(r.voorkomens).toBe(1);
  });

  it('valt terug op het minst voorkomende fragment als niets uniek is', () => {
    const doc = 'de ouder en het kind. de ouder en het kind. de ouder en de zorg.';
    const r = kiesUniekFragment('de ouder en het kind', doc);
    expect(r).not.toBeNull();
    expect(r.voorkomens).toBeGreaterThanOrEqual(1);
  });

  it('geeft null als geen enkel venster in het document staat', () => {
    // Beter niets markeren dan iets markeren wat er niet staat.
    expect(kiesUniekFragment('een zin die hier volstrekt niet in voorkomt', DOC)).toBeNull();
  });

  it('geeft null bij een passage die korter is dan het venster', () => {
    expect(kiesUniekFragment('twee woorden', DOC)).toBeNull();
    expect(kiesUniekFragment('', DOC)).toBeNull();
  });

  it('gaat om met een leeg document', () => {
    expect(kiesUniekFragment(PASSAGE, '')).toBeNull();
    expect(kiesUniekFragment(PASSAGE, null)).toBeNull();
  });

  it('laat de venstergrootte instellen', () => {
    const r = kiesUniekFragment(PASSAGE, DOC, { venster: 6 });
    expect(r.fragment.split(' ')).toHaveLength(6);
  });

  it('trekt zich niets aan van hoofdletters en leestekens', () => {
    const r = kiesUniekFragment('KIND 2DE KERSTDAG VIERT,', DOC);
    expect(r.fragment).toBe('kind 2de kerstdag viert');
  });
});
