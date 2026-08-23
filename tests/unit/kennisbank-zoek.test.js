/**
 * Unit tests — src/kennisbank/zoek.js
 *
 * De zoekopdrachten en chunktitels komen uit de echte kennisbank van 23 augustus
 * 2026 (94 chunks). Het geval dat aanleiding was staat bovenaan: op "zeggenschap
 * gezamenlijke koopwoning" gaf het oude woordzoeken vier procedurele artikelen
 * terug, puur omdat "echtscheiding" in hun titel staat.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { zoekwoorden, rangschik, embedZoekvraag, zoekChunks } from '../../src/kennisbank/zoek.js';

const chunk = (citation, tags = [], content = '') => ({ citation, topic_tags: tags, content });

const KENNISBANK = [
  chunk('art. 815 Rv — convenant bij gemeenschappelijk echtscheidingsverzoek',
    ['convenant', 'volledigheid'], 'Het verzoekschrift tot echtscheiding bevat…'),
  chunk('art. 826 Rv — ouderschapsplan bij echtscheiding met kinderen',
    ['ouderschapsplan'], 'Bij een echtscheiding met minderjarige kinderen…'),
  chunk('art. 3:170 BW — beheer en beschikking gemeenschappelijk goed',
    ['woning', 'verdeling', 'eigen_woning'],
    'Beheershandelingen kunnen door iedere deelgenoot; beschikking vereist medewerking van allen.'),
  chunk('Art. 1:88 BW — toestemming echtgenoot (volledig)',
    ['eigen_woning', 'toestemming', 'woning'],
    'Een echtgenoot behoeft toestemming van de andere echtgenoot voor vervreemding van de woning.'),
];

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });

describe('zoekwoorden', () => {
  it('laat woorden weg die in elke chunk staan', () => {
    // "echtscheiding" komt in de halve kennisbank voor en onderscheidt dus niets.
    expect(zoekwoorden('zeggenschap gezamenlijke koopwoning tijdens echtscheiding'))
      .toEqual(['zeggenschap', 'gezamenlijke', 'koopwoning']);
  });

  it('laat korte woorden weg', () => {
    expect(zoekwoorden('bij de ouder in het huis')).toEqual(['ouder', 'huis']);
  });

  it('houdt artikelnummers heel', () => {
    expect(zoekwoorden('artikel 3:170 BW beheer')).toContain('3:170');
  });

  it('ontdubbelt', () => {
    expect(zoekwoorden('woning woning Woning')).toEqual(['woning']);
  });

  it('overleeft lege invoer', () => {
    expect(zoekwoorden('')).toEqual([]);
    expect(zoekwoorden(null)).toEqual([]);
  });
});

describe('rangschik', () => {
  it('zet een treffer in de titel boven een treffer in de lopende tekst', () => {
    const uit = rangschik(KENNISBANK, ['woning', 'toestemming'], 5);
    expect(uit[0].citation).toMatch(/1:88/);
  });

  it('laat chunks zonder enige treffer weg', () => {
    // Zo kwamen die vier procedurele artikelen in de oude uitkomst terecht.
    const uit = rangschik(KENNISBANK, ['zeggenschap', 'koopwoning'], 5);
    expect(uit.every(c => !/815 Rv|826 Rv/.test(c.citation))).toBe(true);
  });

  it('telt een tag mee als titeltreffer', () => {
    const uit = rangschik(KENNISBANK, ['eigen_woning'], 5);
    expect(uit.length).toBe(2);
  });

  it('respecteert het gevraagde aantal', () => {
    expect(rangschik(KENNISBANK, ['echtscheiding', 'woning'], 1).length).toBe(1);
  });

  it('overleeft lege invoer', () => {
    expect(rangschik([], ['woning'])).toEqual([]);
    expect(rangschik(KENNISBANK, [])).toHaveLength(4);
  });
});

describe('embedZoekvraag', () => {
  const vector = Array.from({ length: 1024 }, (_, i) => i / 1024);

  it('geeft de vector terug', async () => {
    const nep = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ embedding: vector }] }) });
    expect(await embedZoekvraag('woning verkopen', 'sleutel', nep)).toEqual(vector);
  });

  it('geeft null zonder sleutel — dan volgt de terugval', async () => {
    const nep = vi.fn();
    expect(await embedZoekvraag('woning', '', nep)).toBe(null);
    expect(nep).not.toHaveBeenCalled();
  });

  it('geeft null bij een foutstatus in plaats van te gooien', async () => {
    const nep = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limit' });
    expect(await embedZoekvraag('woning', 'sleutel', nep)).toBe(null);
  });

  it('geeft null als Voyage niet reageert', async () => {
    const nep = vi.fn().mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    expect(await embedZoekvraag('woning', 'sleutel', nep)).toBe(null);
  });
});

describe('zoekChunks', () => {
  const vector = Array.from({ length: 1024 }, () => 0.1);
  const okEmbed = () => vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ embedding: vector }] }) });

  /** Minimale Supabase-dubbel: rpc + de ketting van de woordvariant. */
  const nepSb = ({ rpcData, rpcError, tabelData, tabelError }) => ({
    rpc: vi.fn().mockResolvedValue({ data: rpcData, error: rpcError ?? null }),
    from: vi.fn(() => {
      const ketting = {
        select:   () => ketting,
        or:       () => ketting,
        overlaps: () => ketting,
        limit:    () => Promise.resolve({ data: tabelData, error: tabelError ?? null }),
      };
      return ketting;
    }),
  });

  it('zoekt semantisch als dat lukt', async () => {
    const sb = nepSb({ rpcData: [KENNISBANK[2]] });
    const uit = await zoekChunks(sb, 'zeggenschap over de woning', null,
      { apiKey: 'sleutel', fetchImpl: okEmbed() });
    expect(uit.methode).toBe('semantisch');
    expect(uit.chunks[0].citation).toMatch(/3:170/);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('geeft de tags door aan de zoekfunctie', async () => {
    const sb = nepSb({ rpcData: [] });
    await zoekChunks(sb, 'woning', ['eigen_woning'], { apiKey: 'sleutel', fetchImpl: okEmbed() });
    expect(sb.rpc).toHaveBeenCalledWith('zoek_legal_chunks',
      expect.objectContaining({ filter_tags: ['eigen_woning'] }));
  });

  it('stuurt null mee als er geen tags zijn', async () => {
    const sb = nepSb({ rpcData: [] });
    await zoekChunks(sb, 'woning', [], { apiKey: 'sleutel', fetchImpl: okEmbed() });
    expect(sb.rpc).toHaveBeenCalledWith('zoek_legal_chunks',
      expect.objectContaining({ filter_tags: null }));
  });

  it('valt terug op woorden zonder API-sleutel', async () => {
    const sb = nepSb({ tabelData: KENNISBANK });
    const uit = await zoekChunks(sb, 'toestemming woning vervreemding', null, { fetchImpl: vi.fn() });
    expect(uit.methode).toBe('woorden');
    expect(uit.chunks[0].citation).toMatch(/1:88/);
  });

  it('valt terug op woorden als de zoekfunctie nog niet bestaat', async () => {
    // Precies wat er gebeurt als kennisbank-semantisch.sql nog niet gedraaid is.
    const sb = nepSb({
      rpcError:  { message: 'function zoek_legal_chunks does not exist' },
      tabelData: KENNISBANK,
    });
    const uit = await zoekChunks(sb, 'toestemming woning', null,
      { apiKey: 'sleutel', fetchImpl: okEmbed() });
    expect(uit.methode).toBe('woorden');
    expect(uit.chunks.length).toBeGreaterThan(0);
  });

  it('geeft niets terug als er geen bruikbaar zoekwoord overblijft', async () => {
    const sb = nepSb({ tabelData: KENNISBANK });
    const uit = await zoekChunks(sb, 'de en of bij', null, { fetchImpl: vi.fn() });
    expect(uit).toEqual({ chunks: [], methode: 'geen' });
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('gooit niet als ook het woordzoeken faalt', async () => {
    const sb = nepSb({ tabelError: { message: 'connection reset' } });
    const uit = await zoekChunks(sb, 'toestemming woning', null, { fetchImpl: vi.fn() });
    expect(uit).toEqual({ chunks: [], methode: 'geen' });
  });
});
