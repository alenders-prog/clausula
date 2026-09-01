/**
 * tests/unit/opslag-waarschuwing.test.js
 *
 * Op 1 september 2026 verdween een analyse van $0,34. De gegevens waren eenduidig:
 * api_verbruik had vier geslaagde fasen, screeningen had geen rij, Storage geen bestand,
 * en de updated_at van het dossier — die `opslaan()` als láátste stap bijwerkt — stond
 * nog op het tijdstip waarop het dossier was aangemaakt.
 *
 * Deze module beslist of de gebruiker weg mag. De tests gaan vooral over de andere kant:
 * niet waarschuwen als er niets te verliezen valt. Een waarschuwing die altijd komt,
 * leert men wegklikken — en dan is hij minder waard dan geen waarschuwing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  opslagToestand, magWeg, VEILIG, BEZIG, MISLUKT, ONOPGESLAGEN,
} from '../../src/opslag-waarschuwing.js';

describe('opslagToestand', () => {
  it('laat gaan als er geen rapport op het scherm staat', () => {
    const t = opslagToestand({ heeftRapport: false, screeningId: null, bezig: false, laatsteFout: '' });
    expect(t.toestand).toBe(VEILIG);
    expect(magWeg(t)).toBe(true);
  });

  it('laat gaan als het rapport is opgeslagen', () => {
    const t = opslagToestand({ heeftRapport: true, screeningId: 'abc', bezig: false, laatsteFout: '' });
    expect(t.toestand).toBe(VEILIG);
  });

  it('houdt tegen zolang het opslaan loopt', () => {
    // Dit is het raam waarin het misging: het rapport staat op het scherm, het opslaan
    // is begonnen en duurt seconden, en niets houdt een vertrek tegen.
    const t = opslagToestand({ heeftRapport: true, screeningId: null, bezig: true, laatsteFout: '' });
    expect(t.toestand).toBe(BEZIG);
    expect(magWeg(t)).toBe(false);
    expect(t.melding).toMatch(/nog opgeslagen/);
  });

  it('houdt tegen bij een rapport dat nooit is weggeschreven', () => {
    const t = opslagToestand({ heeftRapport: true, screeningId: null, bezig: false, laatsteFout: '' });
    expect(t.toestand).toBe(ONOPGESLAGEN);
    expect(magWeg(t)).toBe(false);
  });

  it('noemt de fout als een poging is gestrand', () => {
    const t = opslagToestand({
      heeftRapport: true, screeningId: null, bezig: false,
      laatsteFout: "Uploaden van 'convenant.pdf' mislukt: new row violates row-level security policy",
    });
    expect(t.toestand).toBe(MISLUKT);
    expect(t.melding).toMatch(/convenant\.pdf/);
    expect(t.melding).toMatch(/opnieuw op te slaan/);
  });

  it('meldt een mislukte poging ook als er al een screeningId is', () => {
    // Een heranalyse werkt een bestaande rij bij. Strandt die update, dan staat er in
    // de database nog de vórige versie en op het scherm de nieuwe. Ook dat is verlies.
    const t = opslagToestand({
      heeftRapport: true, screeningId: 'abc', bezig: false, laatsteFout: 'netwerkfout',
    });
    expect(t.toestand).toBe(MISLUKT);
  });

  it('laat bezig vóór mislukt gaan', () => {
    // Tijdens een nieuwe poging is de vorige fout niet meer het verhaal.
    const t = opslagToestand({
      heeftRapport: true, screeningId: null, bezig: true, laatsteFout: 'oude fout',
    });
    expect(t.toestand).toBe(BEZIG);
  });

  it('overleeft een lege aanroep', () => {
    expect(opslagToestand().toestand).toBe(VEILIG);
    expect(magWeg(opslagToestand())).toBe(true);
    expect(magWeg(VEILIG)).toBe(true);          // ook een kale toestandsnaam mag
  });
});

// ── Bedrading ──────────────────────────────────────────────────────────────

describe('index.html gebruikt de toestand ook echt', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

  it('markeert het opslaan als bezig en weer als klaar', () => {
    expect(html).toMatch(/_opslaanBezig = true;/);
    expect(html).toMatch(/finally \{\s*_opslaanBezig = false;/);
  });

  it('onthoudt de fout in plaats van hem alleen te tonen', () => {
    expect(html).toMatch(/_opslaanLaatsteFout = err\.message/);
    expect(html).toMatch(/console\.error\('\[opslaan\] mislukt:'/);
  });

  it('houdt zowel de app-terugknop als het sluiten van het tabblad tegen', () => {
    expect(html).toMatch(/function gaTerug\(\) \{[\s\S]{0,400}window\.magWeg/);
    expect(html).toMatch(/addEventListener\('beforeunload'[\s\S]{0,200}huidigeOpslagToestand/);
  });

  it('biedt een tweede kans in plaats van alleen een melding', () => {
    // Zonder deze knop is de enige uitweg de analyse opnieuw draaien — twee minuten
    // en ruim dertig dollarcent, voor werk dat al gedaan is.
    expect(html).toMatch(/opslagOpnieuwBtn/);
    expect(html).toMatch(/opslag-fout-balk/);
  });
});
