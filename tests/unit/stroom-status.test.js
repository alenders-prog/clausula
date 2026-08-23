/**
 * Unit tests — src/verificatie/stroom-status.js
 *
 * Het geval dat aanleiding was: een verificatie die op 60 seconden werd afgekapt.
 * De leeslus eindigde met `done: true`, de halve analyse werd getoond alsof hij
 * compleet was, en de aanpasknop deed stilzwijgend niets.
 */

import { describe, it, expect } from 'vitest';
import { splitsAnalyse, leesVoorstel, beoordeelAfronding } from '../../src/verificatie/stroom-status.js';

const ANALYSE = '## Beoordeling\n\nDe bepaling verwijst naar art. 1:157 BW.';
const VOORSTEL = '{"ernst":"midden","bevinding":"Motivering ontbreekt","aanbeveling":"Vul aan"}';
const VOLLEDIG = `${ANALYSE}\n---VOORSTEL---\n${VOORSTEL}`;

describe('het geval dat aanleiding was', () => {
  it('merkt op dat een afgekapte stroom niet compleet is', () => {
    // Geen message_stop ontvangen: de verbinding viel weg.
    const { compleet, melding } = beoordeelAfronding({ kreegStop: false });
    expect(compleet).toBe(false);
    expect(melding).toMatch(/verbinding viel weg/);
  });

  it('toont de halve analyse wél — die klopt tot waar hij komt', () => {
    const half = `${ANALYSE.slice(0, 30)}`;
    expect(splitsAnalyse(half).analyse).toBe(half);
    expect(splitsAnalyse(half).voorstelRuw).toBe('');
  });

  it('meldt apart dat er geen voorstel is bij een wél afgerond antwoord', () => {
    const { compleet, melding } = beoordeelAfronding({ kreegStop: true, heeftVoorstel: false });
    expect(compleet).toBe(true);
    expect(melding).toMatch(/geen voorstel/);
  });
});

describe('splitsAnalyse', () => {
  it('splitst een compleet antwoord', () => {
    expect(splitsAnalyse(VOLLEDIG)).toEqual({ analyse: ANALYSE, voorstelRuw: VOORSTEL });
  });

  it('geeft alles als analyse zolang de scheiding nog niet binnen is', () => {
    expect(splitsAnalyse(ANALYSE).analyse).toBe(ANALYSE);
  });

  it('toont een half binnengekomen scheidingsteken niet', () => {
    // Zonder deze afhandeling flikkert "---VOOR" even in beeld tijdens het streamen.
    expect(splitsAnalyse(`${ANALYSE}\n---VOOR`).analyse).toBe(ANALYSE);
    expect(splitsAnalyse(`${ANALYSE}\n---VOORSTEL--`).analyse).toBe(ANALYSE);
  });

  it('laat een losse streep met rust — die hoort bij markdown', () => {
    const metRegel = `${ANALYSE}\n\n---\n\nMeer tekst`;
    expect(splitsAnalyse(metRegel).analyse).toBe(metRegel);
  });

  it('overleeft lege invoer', () => {
    expect(splitsAnalyse('')).toEqual({ analyse: '', voorstelRuw: '' });
    expect(splitsAnalyse(null)).toEqual({ analyse: '', voorstelRuw: '' });
  });
});

describe('leesVoorstel', () => {
  it('leest een geldig voorstel', () => {
    expect(leesVoorstel(VOORSTEL)).toEqual({
      ernst: 'midden', bevinding: 'Motivering ontbreekt', aanbeveling: 'Vul aan',
    });
  });

  it('geeft null bij een afgekapt voorstel in plaats van te gooien', () => {
    expect(leesVoorstel('{"ernst":"midden","bevinding":"Motiv')).toBe(null);
  });

  it('geeft null bij leeg of onzin', () => {
    expect(leesVoorstel('')).toBe(null);
    expect(leesVoorstel(null)).toBe(null);
    expect(leesVoorstel('"tekst"')).toBe(null);
  });
});

describe('beoordeelAfronding', () => {
  it('meldt max_tokens apart van een weggevallen verbinding', () => {
    const uit = beoordeelAfronding({ stopReason: 'max_tokens', kreegStop: true });
    expect(uit.compleet).toBe(false);
    expect(uit.melding).toMatch(/maximale lengte/);
  });

  it('zwijgt als alles goed ging', () => {
    expect(beoordeelAfronding({ stopReason: 'end_turn', kreegStop: true, heeftVoorstel: true }))
      .toEqual({ compleet: true, melding: null });
  });

  it('laat max_tokens zwaarder wegen dan een ontbrekend voorstel', () => {
    // Bij max_tokens ontbreekt het voorstel per definitie; noem de oorzaak, niet het gevolg.
    expect(beoordeelAfronding({ stopReason: 'max_tokens', kreegStop: true, heeftVoorstel: false }).melding)
      .toMatch(/maximale lengte/);
  });

  it('gaat er bij lege invoer van uit dat het misging', () => {
    expect(beoordeelAfronding().compleet).toBe(false);
  });
});
