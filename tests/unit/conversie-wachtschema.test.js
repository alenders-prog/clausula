import { describe, it, expect } from 'vitest';
import {
  POLL_WACHT, CONVERSIE_MAX_MS, POLL_MAX_MS,
  pollWacht, tijdsbudget, nogEenPoging, tijdslimietMelding,
} from '../../src/conversie/wachtschema.js';

describe('pollWacht', () => {
  it('loopt op en blijft dan op de hoogste staan', () => {
    expect([0, 1, 2, 3, 4, 9].map(pollWacht)).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
  });

  it('valt niet om op rare invoer', () => {
    expect(pollWacht(-3)).toBe(POLL_WACHT[0]);
    expect(pollWacht(undefined)).toBe(POLL_WACHT[0]);
    expect(pollWacht('kaas')).toBe(POLL_WACHT[0]);
  });
});

describe('tijdsbudget', () => {
  it('telt de WANDKLOK, niet alleen de slaaptijd', () => {
    // Dit is de kern van de fout van 29 augustus 2026. De oude lus telde uitsluitend
    // de wachttijd tussen de pogingen op. Een aanroep die zestig seconden bleef
    // hangen voegde daar nul aan toe, dus de grens van 90s werd nooit bereikt.
    const b = tijdsbudget({ gestartOp: 0, nu: 60_000 });
    expect(b.verstreken).toBe(60_000);
    expect(b.resterend).toBe(30_000);
    expect(b.verlopen).toBe(false);
  });

  it('meldt een verlopen budget', () => {
    const b = tijdsbudget({ gestartOp: 0, nu: CONVERSIE_MAX_MS });
    expect(b.verlopen).toBe(true);
    expect(b.resterend).toBe(0);
    expect(b.aanroepMs).toBe(0);
  });

  it('kapt de limiet van één aanroep af op wat er over is', () => {
    // Zonder dit zou een aanroep van 30s, gestart op t=80s, de grens van 90s met
    // twintig seconden overleven — en dan is de grens weer een suggestie.
    expect(tijdsbudget({ gestartOp: 0, nu: 80_000 }).aanroepMs).toBe(10_000);
  });

  it('gebruikt de eigen limiet zolang die past', () => {
    expect(tijdsbudget({ gestartOp: 0, nu: 0 }).aanroepMs).toBe(POLL_MAX_MS);
  });

  it('gaat niet negatief bij een klok die terugloopt', () => {
    const b = tijdsbudget({ gestartOp: 5_000, nu: 0 });
    expect(b.verstreken).toBe(0);
    expect(b.resterend).toBe(CONVERSIE_MAX_MS);
  });

  it('valt niet om op lege invoer', () => {
    expect(() => tijdsbudget()).not.toThrow();
  });
});

describe('nogEenPoging', () => {
  it('staat een poging toe als er ruim tijd over is', () => {
    expect(nogEenPoging({ gestartOp: 0, nu: 10_000, poging: 0 })).toBe(true);
  });

  it('houdt een poging tegen die niet meer af kan komen', () => {
    // Op t=88s is er 2s over. Poging 3 wacht al 8s vóór hij begint; die aanroep
    // zou alleen een verwarrende fout opleveren.
    expect(nogEenPoging({ gestartOp: 0, nu: 88_000, poging: 3 })).toBe(false);
  });

  it('weegt de wachttijd van juist díe poging mee', () => {
    // Zelfde tijdstip, ander pogingnummer: bij 1s wachten past het nog wél.
    const nu = 86_000;
    expect(nogEenPoging({ gestartOp: 0, nu, poging: 3 })).toBe(false);
    expect(nogEenPoging({ gestartOp: 0, nu, poging: 0 })).toBe(true);
  });
});

describe('tijdslimietMelding', () => {
  it('noemt de duur en zegt wat er nu gebeurt', () => {
    const t = tijdslimietMelding(90_000);
    expect(t).toMatch(/90 seconden/);
    // Zonder deze halve zin leest de melding als eindstation, terwijl de analyse
    // gewoon doorgaat via PDF.js.
    expect(t).toMatch(/rechtstreeks uit de PDF/i);
  });

  it('valt niet om op lege invoer', () => {
    expect(tijdslimietMelding()).toMatch(/0 seconden/);
  });
});
