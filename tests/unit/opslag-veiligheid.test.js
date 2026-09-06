/**
 * Unit tests — src/avg/opslag-veiligheid.js
 *
 * Aanleiding: op 6 september 2026 stond een screening voor het eerst gepseudonimiseerd in
 * de database. Twintig minuten later stond de volledige documenttekst er weer in, met
 * echte namen — zonder foutmelding en zonder dat iemand iets verkeerd deed.
 *
 * `laadScreening` herbouwt de namenkaart uit de ontsleutelde `namen_map`, maar alleen als
 * `/api/naam-decrypt` slaagt. Faalde die aanroep, dan bleef de kaart leeg terwijl het
 * rapport in het geheugen wél de echte namen droeg, en schreef de eerstvolgende opslag de
 * onbewerkte versie over de beveiligde rij heen.
 */

import { describe, it, expect } from 'vitest';
import { beoordeelOpslag } from '../../src/avg/opslag-veiligheid.js';

describe('het geval dat aanleiding was', () => {
  it('houdt de opslag tegen als de rij beschermd was en we nu niet kunnen pseudonimiseren', () => {
    const uit = beoordeelOpslag({ rijHadNamenkaart: true, kanPseudonimiseren: false });
    expect(uit.toegestaan).toBe(false);
    expect(uit.reden).toBe('zou_pseudonimisering_verliezen');
  });

  it('zegt wat de gebruiker moet doen, en wat het kost', () => {
    const { melding } = beoordeelOpslag({ rijHadNamenkaart: true, kanPseudonimiseren: false });
    expect(melding).toMatch(/herlaad/i);
    expect(melding).toMatch(/verloren/i);   // eerlijk over de prijs van tegenhouden
  });
});

describe('wat gewoon door moet kunnen', () => {
  it('laat een verse analyse door — er is nog geen rij om te beschermen', () => {
    expect(beoordeelOpslag({ isNieuweAnalyse: true, rijHadNamenkaart: false, kanPseudonimiseren: false }).toegestaan).toBe(true);
  });

  it('laat een oude screening van vóór de pseudonimisering door', () => {
    // Geen namenkaart op de rij betekent: daar valt niets te verslechteren.
    expect(beoordeelOpslag({ rijHadNamenkaart: false, kanPseudonimiseren: false }).toegestaan).toBe(true);
  });

  it('laat de gewone gang van zaken door', () => {
    expect(beoordeelOpslag({ rijHadNamenkaart: true, kanPseudonimiseren: true }).toegestaan).toBe(true);
  });

  it('houdt niets tegen zonder toestand — een defecte toets mag geen slot worden', () => {
    expect(beoordeelOpslag().toegestaan).toBe(true);
    expect(beoordeelOpslag({}).toegestaan).toBe(true);
  });
});

describe('de grens ligt op verslechtering, niet op onvolkomenheid', () => {
  it('blokkeert niet als er wél gepseudonimiseerd kan worden, ook zonder verse versleuteling', () => {
    // Mislukt alleen het VERSLEUTELEN van de kaart, dan blijft de opslag gepseudonimiseerd
    // en verliest de gebruiker hooguit het terugzetten van namen. Dat is geen reden om
    // een opslag tegen te houden — zie de terugval in index.html (`_magPseudo`).
    expect(beoordeelOpslag({ rijHadNamenkaart: true, kanPseudonimiseren: true }).toegestaan).toBe(true);
  });
});
