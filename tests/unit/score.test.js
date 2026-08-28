import { describe, it, expect } from 'vitest';
import { berekenGemiddeldeScore, rapportScore, GEWICHT, ERNST_SCORE } from '../../src/rapport/score.js';

const iss = (ernst, ...dimensies) => ({ ernst, dimensies: dimensies.length ? dimensies : ['volledigheid'] });

describe('berekenGemiddeldeScore — schema v2', () => {
  it('geeft 100 bij een rapport zonder bevindingen', () => {
    expect(berekenGemiddeldeScore({ issues: [] })).toBe(100);
  });

  it('geeft 0 bij uitsluitend hoog-ernst bevindingen', () => {
    expect(berekenGemiddeldeScore({ issues: [iss('hoog'), iss('hoog')] })).toBe(0);
  });

  it('geeft 100 bij uitsluitend laag-ernst bevindingen', () => {
    // Een laag punt is een aandachtspunt, geen gebrek — dat hoort de score niet te raken.
    expect(berekenGemiddeldeScore({ issues: [iss('laag'), iss('laag')] })).toBe(100);
  });

  it('weegt een juridisch punt zwaarder dan een grammaticapunt', () => {
    const jur  = berekenGemiddeldeScore({ issues: [iss('hoog', 'juridisch'), iss('laag', 'grammatica')] });
    const gram = berekenGemiddeldeScore({ issues: [iss('laag', 'juridisch'), iss('hoog', 'grammatica')] });
    // Zelfde aantal punten, zelfde ernstverdeling — alleen omgekeerd verdeeld over de
    // dimensies. De variant waar het zware punt juridisch is, moet lager scoren.
    expect(jur).toBeLessThan(gram);
    expect(jur).toBe(20);   // (0×2 + 1×0.5) / 2.5
    expect(gram).toBe(80);  // (1×2 + 0×0.5) / 2.5
  });

  it('neemt bij meerdere dimensies de zwaarste', () => {
    // Een bevinding die juridisch én grammaticaal is, is een juridische bevinding.
    const a = berekenGemiddeldeScore({ issues: [iss('hoog', 'grammatica', 'juridisch')] });
    const b = berekenGemiddeldeScore({ issues: [iss('hoog', 'juridisch')] });
    expect(a).toBe(b);
  });

  it('behandelt cross_doc als even zwaar als juridisch', () => {
    expect(GEWICHT.cross_doc).toBe(GEWICHT.juridisch);
  });

  it('valt terug op volledigheid als de dimensies ontbreken of leeg zijn', () => {
    expect(berekenGemiddeldeScore({ issues: [{ ernst: 'hoog' }] })).toBe(0);
    expect(berekenGemiddeldeScore({ issues: [{ ernst: 'hoog', dimensies: [] }] })).toBe(0);
  });

  it('behandelt een onbekende ernst als midden', () => {
    expect(berekenGemiddeldeScore({ issues: [{ ernst: 'onbekend', dimensies: ['balans'] }] })).toBe(50);
    expect(ERNST_SCORE.midden).toBe(0.5);
  });

  it('laat MfN buiten de score', () => {
    // MfN heeft een eigen schaal en een eigen noemer per documenttype. Meetellen zou
    // een ernstschaal bij een compleetheidsschaal optellen.
    const zonder = berekenGemiddeldeScore({ issues: [iss('laag')] });
    const met    = berekenGemiddeldeScore({
      issues: [iss('laag')],
      mfn_score: { elementen: [{ status: 'ontbreekt' }, { status: 'ontbreekt' }] },
    });
    expect(met).toBe(zonder);
  });

  it('geeft null bij ontbrekende invoer', () => {
    expect(berekenGemiddeldeScore(null)).toBeNull();
    expect(berekenGemiddeldeScore(undefined)).toBeNull();
  });
});

describe('berekenGemiddeldeScore — oud schema', () => {
  it('rekent met volledigheid, juridisch, balans en grammatica', () => {
    const s = berekenGemiddeldeScore({
      volledigheid: [{ status: 'aanwezig' }, { status: 'ontbreekt' }],
      juridisch: [{ ernst: 'laag' }],
      balans: [],
      grammatica: [],
    });
    // volledigheid 0.5, juridisch 1, balans 1 (leeg = perfect), grammatica 1 → 87,5
    expect(s).toBe(88);
  });

  it('geeft null als er in het oude schema niets te scoren valt', () => {
    expect(berekenGemiddeldeScore({ onbekend: true })).toBe(100);
  });
});

describe('rapportScore', () => {
  it('middelt over alle documenten in een multi-doc rapport', () => {
    // De dossierkaart pakt documenten[0]; voor een dashboard is dat te smal. Een
    // convenant van 100 naast een ouderschapsplan van 0 is geen dossier van 100.
    const r = {
      documenten: [
        { issues: [iss('laag')] },   // 100
        { issues: [iss('hoog')] },   // 0
      ],
    };
    expect(rapportScore(r)).toBe(50);
  });

  it('werkt op een rapport met één document zonder documenten-array', () => {
    expect(rapportScore({ issues: [iss('laag')] })).toBe(100);
  });

  it('slaat documenten zonder score over', () => {
    const r = { documenten: [{ issues: [iss('laag')] }, null] };
    expect(rapportScore(r)).toBe(100);
  });

  it('geeft null als geen enkel document een score oplevert', () => {
    expect(rapportScore(null)).toBeNull();
    expect(rapportScore({ documenten: [] })).toBeNull();
  });
});
