import { describe, it, expect } from 'vitest';
import { tijdsbudget } from '../../src/tijdsbudget.js';

// Twee storingen leidden tot deze functie, en ze deelden hun oorzaak:
//  29-08-2026  de PDF-conversie telde alleen de SLAAPTIJD tussen pogingen op, niet de
//              aanroepen zelf — dus bij het enige geval dat ertoe deed, een aanroep die
//              blijft hangen, kon de grens van 90s niet afgaan.
//  31-08-2026  geen enkele Claude-aanroep had een limiet, dus één trage aanroep at de
//              hele functieduur op en nam de rest van de analyse mee het graf in.
describe('tijdsbudget', () => {
  it('telt de wandklok, niet alleen het wachten', () => {
    const b = tijdsbudget({ gestartOp: 0, nu: 60_000, maxMs: 90_000, perAanroepMs: 30_000 });
    expect(b.verstreken).toBe(60_000);
    expect(b.resterend).toBe(30_000);
    expect(b.verlopen).toBe(false);
  });

  it('kapt de limiet van één aanroep af op wat er over is', () => {
    // Zonder dit overleeft één aanroep de grens alsnog, en is de grens een suggestie.
    const b = tijdsbudget({ gestartOp: 0, nu: 80_000, maxMs: 90_000, perAanroepMs: 30_000 });
    expect(b.aanroepMs).toBe(10_000);
  });

  it('gebruikt de eigen limiet zolang die past', () => {
    expect(tijdsbudget({ gestartOp: 0, nu: 0, maxMs: 300_000, perAanroepMs: 150_000 }).aanroepMs)
      .toBe(150_000);
  });

  it('meldt een verlopen budget en geeft geen tijd meer uit', () => {
    const b = tijdsbudget({ gestartOp: 0, nu: 300_000, maxMs: 300_000, perAanroepMs: 150_000 });
    expect(b.verlopen).toBe(true);
    expect(b.resterend).toBe(0);
    expect(b.aanroepMs).toBe(0);
  });

  it('valt terug op de totale grens als er geen aanroeplimiet is', () => {
    expect(tijdsbudget({ gestartOp: 0, nu: 0, maxMs: 90_000 }).aanroepMs).toBe(90_000);
  });

  it('gaat niet negatief bij een klok die terugloopt', () => {
    const b = tijdsbudget({ gestartOp: 5_000, nu: 0, maxMs: 90_000, perAanroepMs: 30_000 });
    expect(b.verstreken).toBe(0);
    expect(b.resterend).toBe(90_000);
  });

  it('valt niet om op lege invoer', () => {
    expect(() => tijdsbudget()).not.toThrow();
    expect(tijdsbudget().verlopen).toBe(true);
  });
});
