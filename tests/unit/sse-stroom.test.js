/**
 * Unit tests — src/assistent/sse-stroom.js
 *
 * De brokjes zijn met opzet op ongelukkige plekken geknipt: midden in een JSON-regel
 * en midden in de scheiding tussen twee berichten. Zo komt een SSE-stroom over het
 * net ook binnen — nooit netjes per bericht.
 */

import { describe, it, expect, vi } from 'vitest';
import { splitsBerichten, leesStroom } from '../../src/assistent/sse-stroom.js';

/** Bouwt een Response-achtig object met een stroom van vooraf bepaalde brokjes. */
const stroomVan = (brokjes) => ({
  body: {
    getReader() {
      let i = 0;
      const enc = new TextEncoder();
      return {
        read: async () => i < brokjes.length
          ? { done: false, value: enc.encode(brokjes[i++]) }
          : { done: true, value: undefined },
      };
    },
  },
});

const sse = obj => `data: ${JSON.stringify(obj)}\n\n`;

describe('splitsBerichten', () => {
  it('geeft complete berichten terug en houdt de rest vast', () => {
    const { berichten, rest } = splitsBerichten('data: {"a":1}\n\ndata: {"b":2');
    expect(berichten).toEqual(['{"a":1}']);
    expect(rest).toBe('data: {"b":2');
  });

  it('slaat keepalive-regels over', () => {
    const { berichten } = splitsBerichten(': keepalive\n\ndata: {"a":1}\n\n');
    expect(berichten).toEqual(['{"a":1}']);
  });

  it('geeft niets terug bij een buffer zonder complete grens', () => {
    expect(splitsBerichten('data: {"a"').berichten).toEqual([]);
  });
});

describe('leesStroom', () => {
  it('geeft de deltas door en levert het eindobject', async () => {
    const stukken = [];
    const data = await leesStroom(
      stroomVan([
        sse({ type: 'fase', tekst: 'Kennisbank raadplegen…' }),
        sse({ type: 'delta', tekst: 'De woning' }),
        sse({ type: 'delta', tekst: ' is gemeenschappelijk.' }),
        sse({ type: 'klaar', data: { intent: 'casus', antwoord: 'De woning is gemeenschappelijk.' } }),
      ]),
      { onDelta: s => stukken.push(s) },
    );
    expect(stukken.join('')).toBe('De woning is gemeenschappelijk.');
    expect(data.intent).toBe('casus');
  });

  it('overleeft brokjes die midden in een bericht eindigen', async () => {
    const heel = sse({ type: 'delta', tekst: 'abc' }) + sse({ type: 'klaar', data: { ok: true } });
    const brokjes = [];
    for (let i = 0; i < heel.length; i += 5) brokjes.push(heel.slice(i, i + 5));

    const stukken = [];
    const data = await leesStroom(stroomVan(brokjes), { onDelta: s => stukken.push(s) });
    expect(stukken.join('')).toBe('abc');
    expect(data).toEqual({ ok: true });
  });

  it('meldt de faselabels', async () => {
    const fases = [];
    await leesStroom(
      stroomVan([sse({ type: 'fase', tekst: 'Antwoord opstellen…' }), sse({ type: 'klaar', data: {} })]),
      { onFase: t => fases.push(t) },
    );
    expect(fases).toEqual(['Antwoord opstellen…']);
  });

  it('gooit de melding van de server door', async () => {
    await expect(leesStroom(stroomVan([sse({ type: 'fout', melding: 'Tijdslimiet bereikt' })])))
      .rejects.toThrow('Tijdslimiet bereikt');
  });

  it('meldt het als de verbinding wegvalt vóór het eindbericht', async () => {
    await expect(leesStroom(stroomVan([sse({ type: 'delta', tekst: 'half' })])))
      .rejects.toThrow(/viel weg/);
  });

  it('slaat een onleesbaar bericht over in plaats van de stroom te laten vallen', async () => {
    const stukken = [];
    const data = await leesStroom(
      stroomVan(['data: {kapot\n\n', sse({ type: 'delta', tekst: 'ok' }), sse({ type: 'klaar', data: { n: 1 } })]),
      { onDelta: s => stukken.push(s) },
    );
    expect(stukken).toEqual(['ok']);
    expect(data).toEqual({ n: 1 });
  });

  it('meldt het als er helemaal geen stroom is', async () => {
    await expect(leesStroom({ body: null })).rejects.toThrow(/leesbare stroom/);
  });
});
