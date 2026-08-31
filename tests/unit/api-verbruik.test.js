import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { meetAanroep, usageUitSse, schrijfVerbruik, wachtOpVerbruik } from '../../api/_verbruik.js';

// De helper schrijft met fetch weg. Die vangen we af zodat de tests niets versturen en
// we kunnen zien wát er verstuurd zou worden.
let verstuurd;
let origFetch;

beforeEach(() => {
  verstuurd = [];
  origFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (url, opties) => {
    verstuurd.push({ url, body: JSON.parse(opties.body) });
    return { ok: true, text: async () => '' };
  });
  process.env.SUPABASE_URL = 'https://voorbeeld.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-sleutel';
});

afterEach(() => { globalThis.fetch = origFetch; });

describe('usageUitSse', () => {
  it('haalt de invoerkant uit message_start', () => {
    // Die draagt óók de cachevelden. Wie alleen message_delta pakt, mist de hele
    // invoertelling en elke gestreamde aanroep lijkt dan bijna gratis.
    const u = usageUitSse({ type: 'message_start', message: { usage: {
      input_tokens: 1200, cache_read_input_tokens: 3500, output_tokens: 1 } } });
    expect(u).toMatchObject({ input_tokens: 1200, cache_read_input_tokens: 3500 });
  });

  it('haalt de uitvoerkant uit message_delta', () => {
    expect(usageUitSse({ type: 'message_delta', usage: { output_tokens: 1850 } }))
      .toMatchObject({ output_tokens: 1850 });
  });

  it('negeert alle andere berichten', () => {
    expect(usageUitSse({ type: 'content_block_delta', delta: { text: 'x' } })).toBeNull();
    expect(usageUitSse({ type: 'ping' })).toBeNull();
    expect(usageUitSse(null)).toBeNull();
    expect(usageUitSse('tekst')).toBeNull();
  });
});

describe('meetAanroep — usage samenvoegen', () => {
  it('voegt de twee stukken samen in plaats van te overschrijven', () => {
    // Bij streamen komt de invoerkant eerst en de uitvoerkant aan het eind. Simpel
    // overschrijven wist de invoertelling.
    const m = meetAanroep({ endpoint: 'ai-assistent', fase: 'clausule', model: 'claude-sonnet-4-6' });
    m.usage({ input_tokens: 1200, cache_read_input_tokens: 3500 });
    m.usage({ output_tokens: 1850 });
    m.klaar();

    const r = verstuurd[0].body;
    expect(r.input_tokens).toBe(1200);
    expect(r.cache_lees_tokens).toBe(3500);
    expect(r.output_tokens).toBe(1850);
    expect(r.kosten_usd).toBeGreaterThan(0);
  });

  it('negeert velden die geen getal zijn', () => {
    const m = meetAanroep({ endpoint: 'x', fase: 'clausule' });
    m.usage({ input_tokens: 10, service_tier: 'standard' });
    m.klaar();
    expect(verstuurd[0].body.input_tokens).toBe(10);
    expect(verstuurd[0].body.service_tier).toBeUndefined();
  });

  it('valt niet om als er nooit usage binnenkwam', () => {
    const m = meetAanroep({ endpoint: 'x', fase: 'clausule' });
    m.klaar();
    expect(verstuurd[0].body).toMatchObject({ input_tokens: 0, output_tokens: 0, kosten_usd: 0 });
  });
});

describe('meetAanroep — tijden', () => {
  it('onthoudt alleen het éérste token', () => {
    const m = meetAanroep({ endpoint: 'x', fase: 'clausule' });
    m.eersteTokenNu();
    const eerste = m;
    m.eersteTokenNu();   // latere stukjes mogen de meting niet verzetten
    eerste.klaar();
    const r = verstuurd[0].body;
    expect(r.eerste_token_ms).not.toBeNull();
    expect(r.eerste_token_ms).toBeLessThanOrEqual(r.duur_ms);
  });

  it('laat eerste_token_ms leeg als er nooit een token kwam', () => {
    // Nul zou als "razendsnel" in de percentielen belanden.
    const m = meetAanroep({ endpoint: 'x', fase: 'afronding' });
    m.klaar();
    expect(verstuurd[0].body.eerste_token_ms).toBeNull();
    expect(verstuurd[0].body.duur_ms).not.toBeNull();
  });
});

describe('meetAanroep — mislukte aanroep', () => {
  it('schrijft een timeout wél weg, met de tokens die al binnen waren', () => {
    // Die tokens zijn betaald, ook al kwam het antwoord niet af. En een timeout is
    // juist wat je wilt zien staan.
    const m = meetAanroep({ endpoint: 'ai-assistent', fase: 'clausule', model: 'claude-sonnet-4-6' });
    m.usage({ input_tokens: 1200 });
    m.eersteTokenNu();
    m.mislukt(new Error('Claude antwoordde niet binnen de beschikbare tijd'));

    const r = verstuurd[0].body;
    expect(r.geslaagd).toBe(false);
    expect(r.foutsoort).toBe('timeout');
    expect(r.input_tokens).toBe(1200);
    expect(r.kosten_usd).toBeGreaterThan(0);
  });

  it('herkent een afgebroken stroom apart van een timeout', () => {
    const m = meetAanroep({ endpoint: 'x', fase: 'clausule' });
    m.mislukt(new Error('De verbinding viel weg voordat het antwoord af was.'));
    expect(verstuurd[0].body.foutsoort).toBe('afgebroken');
  });
});

describe('meetAanroep — context', () => {
  it('neemt organisatie, gebruiker en screening over', () => {
    const m = meetAanroep({
      endpoint: 'analyseer', fase: 'cross_doc', model: 'claude-sonnet-4-6',
      organisatieId: 'o1', gebruikerId: 'g1', screeningId: '11111111-1111-4111-8111-111111111111',
    });
    m.klaar();
    expect(verstuurd[0].body).toMatchObject({
      endpoint: 'analyseer', fase: 'cross_doc',
      organisatie_id: 'o1', gebruiker_id: 'g1', screening_id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('zet een fase die niet op de lijst staat om naar onbekend', () => {
    const m = meetAanroep({ endpoint: 'x', fase: 'alimentatie Bergman' });
    m.klaar();
    expect(verstuurd[0].body.fase).toBe('onbekend');
  });

  it('laat extra velden bij klaar() de context aanvullen', () => {
    // De screening-id is bij analyseer pas ná de aanroep bekend.
    const m = meetAanroep({ endpoint: 'analyseer', fase: 'structuur' });
    m.klaar({ screeningId: '99999999-9999-4999-8999-999999999999' });
    expect(verstuurd[0].body.screening_id).toBe('99999999-9999-4999-8999-999999999999');
  });
});

// De regel die boven alles gaat: een analyse van twee minuten mag niet stranden omdat
// een insert niet lukte.
describe('meten mag de aanroep nooit laten stranden', () => {
  it('gooit niets als de insert een fout teruggeeft', () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'kapot' }));
    const m = meetAanroep({ endpoint: 'x', fase: 'clausule' });
    expect(() => m.klaar()).not.toThrow();
  });

  it('gooit niets als fetch zelf omvalt', () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('netwerk weg'); });
    const m = meetAanroep({ endpoint: 'x', fase: 'clausule' });
    expect(() => m.klaar()).not.toThrow();
  });

  it('doet niets zonder databasegegevens', () => {
    delete process.env.SUPABASE_URL;
    schrijfVerbruik({ endpoint: 'x' });
    expect(verstuurd).toHaveLength(0);
  });

  it('doet niets bij een lege regel', () => {
    schrijfVerbruik(null);
    expect(verstuurd).toHaveLength(0);
  });
});

// Aanleiding (31 augustus 2026): van een analyse met twee documenten stonden er vier
// regels in api_verbruik waar er vijf hadden moeten staan. De insert werd niet
// afgewacht, en een serverless functie mag bevriezen zodra het antwoord eruit is — wat
// er dan nog openstaat komt er niet meer doorheen. De tabel telde dus stil te weinig,
// en juist die stille onvolledigheid was wat hij moest wegnemen.
describe('wachtOpVerbruik — geen regel mag onderweg verdampen', () => {
  it('wacht tot een trage insert echt weg is', async () => {
    let losmaken;
    globalThis.fetch = vi.fn((url, opties) => new Promise(r => {
      losmaken = () => { verstuurd.push({ url, body: JSON.parse(opties.body) }); r({ ok: true, text: async () => '' }); };
    }));

    meetAanroep({ endpoint: 'analyseer', fase: 'structuur' }).klaar();
    expect(verstuurd).toHaveLength(0);          // nog onderweg

    // Losmaken pas ná een tel, en niet zelf afwachten: alleen een implementatie die
    // écht wacht ziet de regel binnenkomen. Losmaken vóór het wachten zou de test
    // ook groen laten zonder reparatie.
    setTimeout(() => losmaken(), 100);
    await wachtOpVerbruik(5000);
    expect(verstuurd).toHaveLength(1);          // en nu binnen
  });

  it('geeft het na de bovengrens op in plaats van de gebruiker te laten wachten', async () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {}));   // komt nooit terug
    meetAanroep({ endpoint: 'analyseer', fase: 'structuur' }).klaar();

    const t0 = Date.now();
    await wachtOpVerbruik(120);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('valt niet om als er niets openstaat', async () => {
    await expect(wachtOpVerbruik(50)).resolves.toBeUndefined();
  });

  it('schrijfVerbruik geeft een promise terug, ook zonder omgeving', async () => {
    delete process.env.SUPABASE_URL;
    await expect(schrijfVerbruik({ endpoint: 'x' })).resolves.toBeUndefined();
  });
});

// gestart_op heette gestart_op en bevatte het EINDtijdstip: de regel wordt pas gebouwd
// als de aanroep klaar is. Sorteren erop gaf de volgorde van afronden — waardoor de
// fasen van een analyse in een verkeerde volgorde leken te lopen — en een wandklok-
// berekening kwam een hele aanroepduur te hoog uit.
describe('gestart_op is het begin, niet het eind', () => {
  // De duur moet rúim boven de tolerantie liggen, anders kan deze test niet falen:
  // met de oude fout is het verschil precies één aanroepduur, en verdwijnt dat in de
  // speling dan bewijst de test niets. (Eerst met 60ms en 500ms speling gebouwd —
  // die bleef groen mét de fout erin.)
  const DUUR = 400;
  const SPELING = 150;

  it('ligt een aanroepduur vóór het moment van wegschrijven', async () => {
    const nuVoor = Date.now();
    const m = meetAanroep({ endpoint: 'analyseer', fase: 'structuur' });
    await new Promise(r => setTimeout(r, DUUR));
    m.klaar();

    const r = verstuurd[0].body;
    const begin = new Date(r.gestart_op).getTime();
    expect(r.duur_ms).toBeGreaterThanOrEqual(DUUR - 50);
    // Het weggeschreven begin ligt bij het begin van de aanroep…
    expect(Math.abs(begin - nuVoor)).toBeLessThan(SPELING);
    // …en dus een hele duur vóór nu, niet erop.
    expect(Date.now() - begin).toBeGreaterThanOrEqual(DUUR - 50);
  });

  it('geldt ook voor een mislukte aanroep', async () => {
    const nuVoor = Date.now();
    const m = meetAanroep({ endpoint: 'analyseer', fase: 'structuur' });
    await new Promise(r => setTimeout(r, DUUR));
    m.mislukt(new Error('boem'));

    const r = verstuurd[0].body;
    expect(Math.abs(new Date(r.gestart_op).getTime() - nuVoor)).toBeLessThan(SPELING);
    expect(r.geslaagd).toBe(false);
  });
});
