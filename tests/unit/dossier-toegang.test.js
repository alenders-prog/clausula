/**
 * tests/unit/dossier-toegang.test.js
 *
 * De zaak van 5 september 2026: `api/ai-assistent.js` haalde de screening op met de
 * SERVICE_ROLE-sleutel — RLS dus omzeild — en filterde alleen op het `dossier_id` dat de
 * beller zélf meestuurde. Kantoor A kon daarmee het dossierprofiel van kantoor B lezen.
 *
 * De hoofdtest hieronder is precies dat geval. De tweede is de tak die je met de hand
 * nooit tegenkomt en die in productie het zwaarst weegt: `organisatieId` is null omdat
 * het opzoeken van het profiel mislukte, en dan mag er níéts door.
 */

import { describe, it, expect } from 'vitest';
import { screeningVoorDossier } from '../../src/auth/dossier-toegang.js';

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';
const DOSSIER_VAN_B = 'bbbbbbbb-0000-0000-0000-000000000000';

/**
 * Een minimale nep-Supabase met precies de kettingmethodes die de module gebruikt.
 * Hij houdt bij welke filters er zijn gezet, zodat een test kan aantonen dát er op
 * organisatie is gefilterd — niet alleen dat de uitkomst toevallig leeg was.
 */
function nepDb({ dossiers = [], screeningen = [], faalOp = null } = {}) {
  const aanroepen = [];
  const bouw = (tabel) => {
    const filters = {};
    const ketting = {
      select() { return ketting; },
      order()  { return ketting; },
      eq(kolom, waarde) { filters[kolom] = waarde; return ketting; },
      limit() {
        aanroepen.push({ tabel, filters: { ...filters } });
        if (faalOp === tabel) return Promise.resolve({ data: null, error: new Error('db stuk') });
        if (tabel === 'dossiers') {
          const treffers = dossiers.filter((d) =>
            (filters.id === undefined || d.id === filters.id) &&
            (filters.organisatie_id === undefined || d.organisatie_id === filters.organisatie_id));
          return Promise.resolve({ data: treffers, error: null });
        }
        const treffers = screeningen.filter((s) =>
          filters.dossier_id === undefined || s.dossier_id === filters.dossier_id);
        return Promise.resolve({ data: treffers, error: null });
      },
    };
    return ketting;
  };
  return { from: (t) => bouw(t), aanroepen };
}

/** Eén dossier van kantoor B, met een screening eraan. */
const opstelling = {
  dossiers:    [{ id: DOSSIER_VAN_B, organisatie_id: ORG_B }],
  screeningen: [{ dossier_id: DOSSIER_VAN_B, classificatie: { partij_a_naam: 'Geheim' } }],
};

describe('kantoor A komt niet bij het dossier van kantoor B', () => {
  it('geeft niets terug op een vreemd dossier — dit is de bevinding', () => {
    const db = nepDb(opstelling);
    return expect(
      screeningVoorDossier(db, { dossierId: DOSSIER_VAN_B, organisatieId: ORG_A }),
    ).resolves.toBeNull();
  });

  it('filtert aantoonbaar op organisatie, en niet alleen op dossier', async () => {
    // Zonder deze test zou een lege uitkomst ook kunnen komen doordat er toevallig niets
    // stond. Hier staat vast dát het filter is meegegeven.
    const db = nepDb(opstelling);
    await screeningVoorDossier(db, { dossierId: DOSSIER_VAN_B, organisatieId: ORG_A });

    expect(db.aanroepen[0]).toEqual({
      tabel: 'dossiers',
      filters: { id: DOSSIER_VAN_B, organisatie_id: ORG_A },
    });
  });

  it('vraagt de screening niet eens op als het dossier niet van de beller is', async () => {
    // De volgorde is het punt: eigendom eerst, gegevens daarna. Andersom staat de
    // screening al in het geheugen voordat vaststaat of hij gelezen mag worden.
    const db = nepDb(opstelling);
    await screeningVoorDossier(db, { dossierId: DOSSIER_VAN_B, organisatieId: ORG_A });

    expect(db.aanroepen.map((a) => a.tabel)).toEqual(['dossiers']);
  });
});

describe('het eigen kantoor komt er wel bij', () => {
  it('geeft de screening terug aan de eigenaar', async () => {
    const db = nepDb(opstelling);
    const uit = await screeningVoorDossier(db, { dossierId: DOSSIER_VAN_B, organisatieId: ORG_B });

    expect(uit?.classificatie?.partij_a_naam).toBe('Geheim');
  });

  it('haalt standaard geen `rapport` op', async () => {
    // Dat veld werd wel opgehaald en nooit gebruikt; het is ~130 KB met de documenttekst.
    const db = nepDb(opstelling);
    let gevraagd = null;
    const bespied = { from: (t) => {
      const k = db.from(t);
      return { ...k, select(v) { if (t === 'screeningen') gevraagd = v; return k.select(v); } };
    } };
    await screeningVoorDossier(bespied, { dossierId: DOSSIER_VAN_B, organisatieId: ORG_B });

    expect(gevraagd).toBe('classificatie');
    expect(gevraagd).not.toContain('rapport');
  });
});

describe('fail-closed: twijfel is geen toegang', () => {
  it('geen organisatie bekend → niets, ook niet met een geldig dossier-id', () => {
    // gebruikerContext() geeft organisatieId: null als het opzoeken van het profiel
    // mislukte — die catch in api/_auth.js waarschuwt en gaat door. Een filter dat bij
    // null "geen filter" betekent, geeft dan iedereen toegang tot alles, precies op het
    // moment dat er al iets stuk is.
    const db = nepDb(opstelling);
    return expect(
      screeningVoorDossier(db, { dossierId: DOSSIER_VAN_B, organisatieId: null }),
    ).resolves.toBeNull();
  });

  it('geen dossier-id → niets', () => {
    return expect(
      screeningVoorDossier(nepDb(opstelling), { dossierId: null, organisatieId: ORG_B }),
    ).resolves.toBeNull();
  });

  it('een databasefout bij de eigendomscontrole is geen toestemming', () => {
    const db = nepDb({ ...opstelling, faalOp: 'dossiers' });
    return expect(
      screeningVoorDossier(db, { dossierId: DOSSIER_VAN_B, organisatieId: ORG_B }),
    ).resolves.toBeNull();
  });
});
