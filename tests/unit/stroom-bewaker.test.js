/**
 * Unit tests — src/analyse/stroom-bewaker.js
 *
 * Aanleiding: op 6 september 2026 bleef een analyse oneindig staan nadat de verbinding was
 * weggevallen (`ERR_SSL_PROTOCOL_ERROR`). De fetch had geen AbortSignal en de leeslus geen
 * tijdsgrens.
 *
 * CLAUDE.md schrijft bij dit soort grenzen voor: **toets hem door hem te laten afgaan.**
 * Anders weet je alleen dat de code compileert. Vandaar een gestuurde klok en gestuurde
 * timers, zodat elke grens hier daadwerkelijk vuurt.
 */

import { describe, it, expect } from 'vitest';
import { maakStroomBewaker, TOTAAL_MS, STILTE_MS } from '../../src/analyse/stroom-bewaker.js';

/** Een klok en timers die wij opdraaien, zodat er niets echt hoeft te wachten. */
function nepTijd() {
  let nu = 0;
  const timers = new Map();
  let volgende = 1;
  return {
    nu: () => nu,
    zetTimer: (fn, ms) => { const id = volgende++; timers.set(id, { fn, op: nu + ms }); return id; },
    wisTimer: (id) => { timers.delete(id); },
    /** Klok vooruit, en alles wat onderweg af had moeten gaan laten vuren. */
    verstrijk(ms) {
      const doel = nu + ms;
      for (;;) {
        const klaar = [...timers.entries()].filter(([, t]) => t.op <= doel).sort((a, b) => a[1].op - b[1].op);
        if (!klaar.length) break;
        const [id, t] = klaar[0];
        timers.delete(id);
        nu = t.op;
        t.fn();
      }
      nu = doel;
    },
  };
}

const maak = (t, opties = {}) => maakStroomBewaker({ nu: t.nu, zetTimer: t.zetTimer, wisTimer: t.wisTimer, ...opties });

describe('de grens gaat werkelijk af', () => {
  it('breekt af als er te lang niets binnenkomt', () => {
    const t = nepTijd();
    const b = maak(t);
    expect(b.signaal.aborted).toBe(false);

    t.verstrijk(STILTE_MS - 1);
    expect(b.signaal.aborted).toBe(false);

    t.verstrijk(2);
    expect(b.signaal.aborted).toBe(true);
    expect(b.reden).toBe('stilte');
  });

  it('breekt af als het geheel te lang duurt, ook al blijft er data komen', () => {
    const t = nepTijd();
    const b = maak(t);
    // Elke 10 seconden een levensteken: de stiltegrens gaat dus nooit af.
    for (let ms = 0; ms < TOTAAL_MS + 10_000; ms += 10_000) {
      t.verstrijk(10_000);
      if (!b.signaal.aborted) b.levensteken();
    }
    expect(b.signaal.aborted).toBe(true);
    expect(b.reden).toBe('totaal');
  });
});

describe('een levende stroom wordt niet afgekapt', () => {
  it('schuift de stiltegrens op bij elk stuk', () => {
    const t = nepTijd();
    const b = maak(t);
    // Zes stukken van 40 seconden: elk net binnen de stiltegrens, samen 240s en dus
    // ruim binnen de totaalgrens. Meer rondes zouden de tótale grens laten vuren — dat
    // is goed gedrag, maar dan toetst deze test iets anders dan zijn naam zegt.
    for (let i = 0; i < 6; i++) {
      t.verstrijk(STILTE_MS - 5_000);
      b.levensteken();
    }
    expect(b.signaal.aborted).toBe(false);
    expect(b.reden).toBeNull();
  });

  it('laat de keepalive van 5 seconden ruim binnen de grens vallen', () => {
    // De server stuurt elke 5s een keepalive; de grens staat op 45s. Negen gemiste
    // keepalives is genoeg bewijs dat er niemand meer is.
    expect(STILTE_MS / 5_000).toBeGreaterThanOrEqual(6);
  });

  it('stopt de timers zodat een afgeronde analyse niet alsnog afbreekt', () => {
    const t = nepTijd();
    const b = maak(t);
    b.stop();
    t.verstrijk(TOTAAL_MS * 2);
    expect(b.signaal.aborted).toBe(false);
    expect(b.reden).toBeNull();
  });
});

describe('de melding zegt wat er aan de hand is', () => {
  it('noemt bij stilte hoe lang het stil was', () => {
    const t = nepTijd();
    const b = maak(t);
    t.verstrijk(STILTE_MS + 1);
    expect(b.melding()).toMatch(/verbinding/i);
    expect(b.melding()).toMatch(/45 seconden niets meer/);
    expect(b.melding()).toMatch(/opnieuw/i);
  });

  it('noemt bij een totaaloverschrijding de duur en een uitweg', () => {
    // Wél levenstekens blijven geven, anders vuurt de stiltegrens eerst — die staat op
    // 45s en is dus altijd als eerste aan de beurt bij een dóde verbinding.
    const t = nepTijd();
    const b = maak(t);
    for (let ms = 0; ms < TOTAAL_MS + 10_000 && !b.signaal.aborted; ms += 10_000) {
      t.verstrijk(10_000);
      if (!b.signaal.aborted) b.levensteken();
    }
    expect(b.reden).toBe('totaal');
    expect(b.melding()).toMatch(/330 seconden/);
    expect(b.melding()).toMatch(/minder documenten/);
  });

  it('zwijgt zolang er niets mis is', () => {
    const t = nepTijd();
    expect(maak(t).melding()).toBe('');
  });

  it('houdt de eerste reden vast — een tweede afbreking zegt niets', () => {
    const t = nepTijd();
    const b = maak(t);
    t.verstrijk(STILTE_MS + 1);
    expect(b.reden).toBe('stilte');
    t.verstrijk(TOTAAL_MS * 2);
    expect(b.reden).toBe('stilte');
  });
});

describe('de grenzen staan zinnig ten opzichte van de server', () => {
  it('geeft de server de kans als eerste op te geven', () => {
    // api/analyseer.js kapt zichzelf af op 280s, vercel.json staat 300s toe. Zou de
    // browser eerder afbreken, dan zag de gebruiker een netwerkfout terwijl de server
    // nog een net antwoord aan het opmaken was.
    expect(TOTAAL_MS).toBeGreaterThan(300_000);
  });
});
