/**
 * Unit tests — src/ui/traag-melder.js
 *
 * De klacht was: "er lijkt nu niets meer te gebeuren". Er draaiden op dat moment
 * animaties genoeg. Wat ontbrak was informatie: de tekst stond al veertig seconden
 * op hetzelfde. Deze meter bepaalt wanneer dat het geval is.
 *
 * Het subtiele punt zit in wat als voortgang telt. De SSE-lus stuurt bij elk
 * binnenkomend event opnieuw "Bezig met analyseren…". Zou dat als beweging tellen,
 * dan gaat de traagregel nooit af — juist niet in het geval waarvoor hij bestaat.
 */

import { describe, it, expect } from 'vitest';
import { maakTraagMelder, traagZin } from '../../src/ui/traag-melder.js';

/** Verzette klok, zodat de tests niet hoeven te wachten. */
function klok(start = 0) {
  let t = start;
  return { nu: () => t, verder: ms => { t += ms; } };
}

describe('maakTraagMelder', () => {
  it('is niet traag zolang de drempel niet gehaald is', () => {
    const k = klok();
    const m = maakTraagMelder({ drempelMs: 20_000, nu: k.nu });
    m.tik('Bezig met analyseren…');
    k.verder(19_999);
    expect(m.status().traag).toBe(false);
  });

  it('wordt traag zodra de voortgang stilstaat', () => {
    const k = klok();
    const m = maakTraagMelder({ drempelMs: 20_000, nu: k.nu });
    m.tik('Bezig met analyseren…');
    k.verder(20_000);
    const s = m.status();
    expect(s.traag).toBe(true);
    expect(s.stilMs).toBe(20_000);
  });

  it('telt dezelfde melding NIET als voortgang — dit is de kern', () => {
    // De SSE-lus herhaalt dezelfde zin bij elk event. Zou dat de klok resetten,
    // dan gaat de regel nooit af in precies het geval waarvoor hij bedoeld is.
    const k = klok();
    const m = maakTraagMelder({ drempelMs: 20_000, nu: k.nu });
    m.tik('Bezig met analyseren…');
    for (let i = 0; i < 8; i++) { k.verder(3_000); expect(m.tik('Bezig met analyseren…')).toBe(false); }
    expect(m.status().traag).toBe(true);
  });

  it('telt een veranderd percentage wél als voortgang', () => {
    // Een bewegend percentage is zichtbare beweging, ook bij dezelfde zin.
    const k = klok();
    const m = maakTraagMelder({ drempelMs: 20_000, nu: k.nu });
    m.tik('Bezig met analyseren…', 10);
    k.verder(15_000);
    expect(m.tik('Bezig met analyseren…', 20)).toBe(true);
    k.verder(15_000);
    expect(m.status().traag).toBe(false);   // klok is bij 20% opnieuw begonnen
  });

  it('een andere tekst zet de klok terug', () => {
    const k = klok();
    const m = maakTraagMelder({ drempelMs: 20_000, nu: k.nu });
    m.tik('Bezig met voorbereiden…');
    k.verder(19_000);
    m.tik('Bezig met analyseren…');
    k.verder(19_000);
    expect(m.status().traag).toBe(false);
  });

  it('meldt `nieuw` precies één keer', () => {
    // Anders zou de regel bij elke render opnieuw verschijnen — of, erger, opnieuw
    // in beeld schuiven terwijl hij er al staat.
    const k = klok();
    const m = maakTraagMelder({ drempelMs: 20_000, nu: k.nu });
    m.tik('Bezig met analyseren…');
    k.verder(20_000);
    expect(m.status().nieuw).toBe(true);
    expect(m.status().nieuw).toBe(false);
    expect(m.status().traag).toBe(true);   // traag blijft hij wél
  });

  it('meldt opnieuw als het ná voortgang wéér stilvalt', () => {
    const k = klok();
    const m = maakTraagMelder({ drempelMs: 20_000, nu: k.nu });
    m.tik('Bezig met analyseren…');
    k.verder(20_000);
    expect(m.status().nieuw).toBe(true);
    m.tik('Bezig met verwerken…');          // weer beweging
    k.verder(20_000);
    expect(m.status().nieuw).toBe(true);
  });

  it('geeft de laatste melding terug', () => {
    const k = klok();
    const m = maakTraagMelder({ nu: k.nu });
    expect(m.laatsteMelding()).toBeNull();
    m.tik('Bezig met analyseren…', 40);
    expect(m.laatsteMelding()).toEqual({ tekst: 'Bezig met analyseren…', pct: 40 });
  });

  it('herstart zet alles terug', () => {
    const k = klok();
    const m = maakTraagMelder({ drempelMs: 20_000, nu: k.nu });
    m.tik('Bezig met analyseren…');
    k.verder(30_000);
    expect(m.status().traag).toBe(true);
    m.herstart();
    expect(m.status().traag).toBe(false);
    expect(m.laatsteMelding()).toBeNull();
  });
});

describe('traagZin', () => {
  it('noemt waar het op vastloopt, zonder loze geruststelling', () => {
    const z = traagZin(24_000, 'Bezig met analyseren…');
    expect(z).toBe('Dit duurt langer dan gebruikelijk — al 24 seconden bezig met analyseren.');
    expect(z).not.toMatch(/geduld|momentje|even/i);
  });

  it('schakelt naar minuten als het lang duurt', () => {
    expect(traagZin(150_000, 'Bezig met analyseren…')).toContain('al 3 minuten');
  });

  it('werkt ook zonder bekende melding', () => {
    expect(traagZin(21_000, null)).toBe('Dit duurt langer dan gebruikelijk — al 21 seconden geen voortgang.');
  });
});
