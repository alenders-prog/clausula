/**
 * tests/unit/vergelijking-leverancier.test.js
 *
 * De gelijkschakeling. Wat hier wordt bewaakt is niet dat de verzoeken op elkaar lijken,
 * maar dat de dingen die gelijk MOETEN zijn dat ook zijn — systeemtekst, gebruikersinhoud
 * en vooral het schema, want dat draagt hier een deel van de instructie. En dat de
 * dingen die niet gelijk KUNNEN zijn bewust verschillen in plaats van per ongeluk.
 */

import { describe, it, expect } from 'vitest';
import {
  maakDeelnemer, bouwVerzoek, bouwClaudeVerzoek, bouwChatGptVerzoek,
  leesAntwoord, leesClaudeAntwoord, leesChatGptAntwoord, bouwHeaders,
  alsTekst, gebruikersTekst, UITDAGER_BUDGETFACTOR, LEVERANCIERS,
  accepteertTemperature, ZONDER_TEMPERATURE, accepteertEffort,
} from '../../src/vergelijking/leverancier.js';

/** Een tool in de vorm die api/analyseer.js gebruikt, mét een sprekende beschrijving. */
const TOOL = {
  name: 'registreer_bevindingen',
  description: 'Registreert juridische, balans-, grammatica- en conflictbevindingen.',
  input_schema: {
    type: 'object',
    properties: {
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            onderwerp: { type: 'string', description: 'Korte kop, geen hele zin.' },
            ernst:     { type: 'string', enum: ['laag', 'midden', 'hoog'] },
          },
          required: ['onderwerp', 'ernst'],
        },
      },
    },
    required: ['issues'],
  },
};

const OPDRACHT = {
  systemPrompt: [{ type: 'text', text: 'Je bent een screener.' }, { type: 'text', text: 'Wees streng.' }],
  userContent:  [{ text: 'Document A', cache: true }, { text: 'Vraag: beoordeel.' }],
  tool: TOOL,
  maxTokens: 8000,
};

describe('maakDeelnemer', () => {
  it('vult het model aan en laat de diepte leeg', () => {
    // Geen `@diepte` betekent: niets meesturen, dus de stand van de leverancier — wat
    // productie ook doet. Een stilzwijgende `low` zou een deelnemer die "de huidige
    // stand" heet iets anders laten zijn dan de huidige stand.
    const d = maakDeelnemer('claude');
    expect(d.leverancier).toBe('claude');
    expect(d.model).toBe('claude-sonnet-4-6');
    expect(d.diepte).toBeNull();
    expect(d.merk).toBe('Claude');
  });

  it('leest leverancier, model, diepte en variant uit de spec', () => {
    const d = maakDeelnemer('chatgpt:gpt-5.6-luna@high#parallel');
    expect(d).toMatchObject({
      leverancier: 'chatgpt', model: 'gpt-5.6-luna', diepte: 'high', variant: 'parallel',
    });
  });

  it('laat één model tegen zichzelf op een andere stand toe', () => {
    const laag = maakDeelnemer('chatgpt:gpt-5.6-luna@low');
    const hoog = maakDeelnemer('chatgpt:gpt-5.6-luna@high');
    expect(laag.model).toBe(hoog.model);
    expect(laag.kort).not.toBe(hoog.kort);
  });

  it('weigert een onbekende leverancier en noemt de geldige', () => {
    expect(() => maakDeelnemer('gemini:pro')).toThrow(/Onbekende leverancier/);
    expect(() => maakDeelnemer('gemini:pro')).toThrow(/claude/);
    expect(() => maakDeelnemer('')).toThrow(/Lege deelnemer/);
  });

  it('wijst de uitdager standaard naar het Europese endpoint', () => {
    // De EU is waar het naartoe moet, dus dat is de standaard en niet de uitzondering.
    expect(maakDeelnemer('chatgpt').url).toContain('eu.api.openai.com');
    expect(maakDeelnemer('chatgpt').regio).toBe('eu');
  });

  it('kan bewust naar het globale endpoint, want het EU-project bestaat nog niet', () => {
    // Een gewone sleutel krijgt op het EU-endpoint een 401: "This endpoint is only
    // accessible by projects with geography restrictions enabled." Gemeten 22 sep 2026.
    const g = maakDeelnemer('chatgpt', { regio: 'globaal' });
    expect(g.url).toBe('https://api.openai.com/v1/responses');
    expect(g.regio).toBe('globaal');
  });

  it('weigert een regio die niet bestaat', () => {
    expect(() => maakDeelnemer('chatgpt', { regio: 'maan' })).toThrow(/Onbekende regio/);
  });

  it('laat Claude onveranderd, want daar bestaat geen EU-verwerking', () => {
    expect(maakDeelnemer('claude', { regio: 'globaal' }).url)
      .toBe(maakDeelnemer('claude', { regio: 'eu' }).url);
  });
});

describe('platslaan van blokken', () => {
  it('voegt systeemblokken samen tot één tekst', () => {
    expect(alsTekst(OPDRACHT.systemPrompt)).toBe('Je bent een screener.\n\nWees streng.');
    expect(alsTekst('plat')).toBe('plat');
  });

  it('voegt gebruikersblokken samen, ook als ze een cache-markering dragen', () => {
    expect(gebruikersTekst(OPDRACHT.userContent)).toBe('Document A\n\nVraag: beoordeel.');
  });
});

describe('de gelijkschakeling — wat identiek moet zijn', () => {
  const claude  = bouwVerzoek(maakDeelnemer('claude:claude-sonnet-4-6@low'), OPDRACHT);
  const chatgpt = bouwVerzoek(maakDeelnemer('chatgpt:gpt-5.6-luna@low'), OPDRACHT);

  it('geeft beide kanten letterlijk hetzelfde schema', () => {
    // Dit is de kern. Hier iets aan bewerken is de opdracht wijzigen, en dan meet je je
    // eigen vertaalwerk in plaats van twee modellen.
    expect(chatgpt.tools[0].parameters).toBe(TOOL.input_schema);
    expect(claude.tools[0].input_schema).toBe(TOOL.input_schema);
  });

  it('behoudt de beschrijvingen in het schema, want die dragen de instructie', () => {
    const uitChatgpt = chatgpt.tools[0].parameters
      .properties.issues.items.properties.onderwerp.description;
    expect(uitChatgpt).toBe('Korte kop, geen hele zin.');
  });

  it('geeft beide kanten dezelfde systeemtekst en gebruikersinhoud', () => {
    expect(claude.system[0].text).toBe(chatgpt.instructions);
    expect(claude.messages[0].content).toBe(chatgpt.input);
  });

  it('dwingt aan beide kanten dezelfde functie af', () => {
    expect(claude.tool_choice).toEqual({ type: 'tool', name: 'registreer_bevindingen' });
    expect(chatgpt.tool_choice).toEqual({ type: 'function', name: 'registreer_bevindingen' });
    expect(chatgpt.tools[0].name).toBe(claude.tools[0].name);
  });

  it('laat de prompt-cache aan beide kanten uit, net als in productie', () => {
    expect(JSON.stringify(claude)).not.toContain('cache_control');
  });
});

describe('de gelijkschakeling — wat bewust verschilt', () => {
  const claude  = bouwVerzoek(maakDeelnemer('claude'), OPDRACHT);
  const chatgpt = bouwVerzoek(maakDeelnemer('chatgpt:gpt-5.6-luna@high'), OPDRACHT);

  it('stuurt temperature naar een Claude-model dat hem accepteert', () => {
    expect(claude.temperature).toBe(0.3);
  });

  it('stuurt hem niet naar de uitdager', () => {
    // Redeneermodellen daar accepteren alleen de standaardwaarde.
    expect(chatgpt).not.toHaveProperty('temperature');
  });

  it('laat hem weg bij een Claude-model dat hem weigert', () => {
    // Gemeten bij de eerste draai, 22 september 2026: claude-sonnet-5 gaf een 400 met
    // "`temperature` is deprecated for this model". Temperature is dus geen eigenschap
    // van de leverancier maar van het model.
    const sonnet5 = bouwVerzoek(maakDeelnemer('claude:claude-sonnet-5@low'), OPDRACHT);
    expect(sonnet5).not.toHaveProperty('temperature');
    expect(sonnet5.model).toBe('claude-sonnet-5');
  });

  it('kent de weigeraars, ook met een datumsuffix', () => {
    expect(accepteertTemperature('claude-sonnet-4-6')).toBe(true);
    expect(accepteertTemperature('claude-haiku-4-5')).toBe(true);
    expect(accepteertTemperature('claude-sonnet-5')).toBe(false);
    expect(accepteertTemperature('claude-opus-5')).toBe(false);
    expect(accepteertTemperature('claude-sonnet-5-20260401')).toBe(false);
  });

  it('is een weigerlijst, zodat een onbekend model luid faalt in plaats van stil', () => {
    // Een nieuw model dat de parameter niet slikt geeft een 400 die je niet kunt missen.
    // Andersom zou het stilzwijgend de standaardtemperatuur krijgen in plaats van de 0,3
    // die productie stuurt, en dan meet je iets anders dan je denkt.
    expect(accepteertTemperature('claude-iets-nieuws')).toBe(true);
  });

  it('geeft de uitdager een ruimer budget, want redeneertokens tellen daar mee', () => {
    expect(claude.max_tokens).toBe(8000);
    expect(chatgpt.max_output_tokens).toBe(8000 * UITDAGER_BUDGETFACTOR);
    expect(chatgpt).not.toHaveProperty('max_tokens');
  });

  it('geeft de diepte door als reasoning_effort', () => {
    expect(chatgpt.reasoning).toEqual({ effort: 'high' });
  });

  it('geeft de diepte óók door aan Claude, als output_config.effort', () => {
    // Dit ging tot 22 september 2026 verloren: alleen de uitdager kreeg de diepte mee,
    // dus `claude:…@low` en `claude:…@high` waren hetzelfde verzoek. Het etiket zei iets
    // anders dan het verzoek deed, zonder dat er iets misging.
    const laag = bouwVerzoek(maakDeelnemer('claude:claude-sonnet-5@low'), OPDRACHT);
    const hoog = bouwVerzoek(maakDeelnemer('claude:claude-sonnet-5@high'), OPDRACHT);
    expect(laag.output_config).toEqual({ effort: 'low' });
    expect(hoog.output_config).toEqual({ effort: 'high' });
    expect(laag).not.toEqual(hoog);
  });

  it('stuurt geen diepte mee als de spec er geen noemt', () => {
    const kaal = bouwVerzoek(maakDeelnemer('claude:claude-sonnet-5'), OPDRACHT);
    expect(kaal).not.toHaveProperty('output_config');
    expect(bouwVerzoek(maakDeelnemer('chatgpt:gpt-5.6-luna'), OPDRACHT))
      .not.toHaveProperty('reasoning');
  });

  it('laat de diepte weg bij een Claude-model dat hem niet kent', () => {
    const haiku = bouwVerzoek(maakDeelnemer('claude:claude-haiku-4-5@low'), OPDRACHT);
    expect(haiku).not.toHaveProperty('output_config');
    expect(accepteertEffort('claude-sonnet-4-6')).toBe(true);
    expect(accepteertEffort('claude-sonnet-5')).toBe(true);
    expect(accepteertEffort('claude-haiku-4-5')).toBe(false);
  });

  it('bouwt geen herpogingen in — die horen in het harnas, voor iedereen gelijk', () => {
    for (const body of [claude, chatgpt]) {
      expect(JSON.stringify(body)).not.toMatch(/retry|herpoging/i);
    }
  });
});

describe('het antwoord uitpakken — Claude', () => {
  const ANTWOORD = {
    stop_reason: 'tool_use',
    content: [
      { type: 'text', text: 'Ik ga de tool aanroepen.' },
      { type: 'tool_use', name: 'registreer_bevindingen', input: { issues: [{ onderwerp: 'A' }] } },
    ],
    usage: {
      input_tokens: 1200, cache_creation_input_tokens: 40,
      cache_read_input_tokens: 300, output_tokens: 700,
    },
  };

  it('haalt het ingevulde schema uit het tool_use-blok', () => {
    expect(leesClaudeAntwoord(ANTWOORD).uitvoer).toEqual({ issues: [{ onderwerp: 'A' }] });
  });

  it('neemt de vier tellingen over', () => {
    expect(leesClaudeAntwoord(ANTWOORD)).toMatchObject({
      vers: 1200, cacheSchrijf: 40, cacheLees: 300, uit: 700, afgekapt: false,
    });
  });

  it('herkent een afgekapt antwoord', () => {
    expect(leesClaudeAntwoord({ ...ANTWOORD, stop_reason: 'max_tokens' }).afgekapt).toBe(true);
  });

  it('geeft null als er geen tool-aanroep in zit', () => {
    expect(leesClaudeAntwoord({ content: [{ type: 'text', text: 'nee' }] }).uitvoer).toBeNull();
    expect(leesClaudeAntwoord({}).uitvoer).toBeNull();
  });
});

describe('het antwoord uitpakken — de uitdager', () => {
  // De vorm van /v1/responses: een "output"-lijst met daarin een "function_call"-item,
  // en een usage waarin "input_tokens" het TOTAAL is, met een aparte uitsplitsing.
  const ANTWOORD = {
    status: 'completed',
    incomplete_details: null,
    output: [
      { type: 'reasoning', summary: [] },
      { type: 'function_call', name: 'registreer_bevindingen', arguments: '{"issues":[{"onderwerp":"A"}]}' },
    ],
    usage: {
      input_tokens: 1500, output_tokens: 700,
      input_tokens_details: { cached_tokens: 300, cache_write_tokens: 0 },
    },
  };

  it('ontleedt de argumenten, die als string binnenkomen', () => {
    expect(leesChatGptAntwoord(ANTWOORD).uitvoer).toEqual({ issues: [{ onderwerp: 'A' }] });
  });

  it('trekt de cache van input_tokens af, anders telt hij dubbel', () => {
    // input_tokens is hier het TOTAAL; input_tokens bij Anthropic juist het verse deel.
    // Wie dat verwisselt rekent de cache twee keer en komt te hoog uit.
    expect(leesChatGptAntwoord(ANTWOORD)).toMatchObject({
      vers: 1200, cacheLees: 300, cacheSchrijf: 0, uit: 700,
    });
  });

  it('trekt ook de cache-schrijftokens af', () => {
    const met = { ...ANTWOORD, usage: { ...ANTWOORD.usage,
      input_tokens_details: { cached_tokens: 300, cache_write_tokens: 200 } } };
    expect(leesChatGptAntwoord(met)).toMatchObject({ vers: 1000, cacheSchrijf: 200 });
  });

  it('komt niet onder nul als de telling ontbreekt', () => {
    expect(leesChatGptAntwoord({ usage: { input_tokens_details: { cached_tokens: 50 } } }).vers).toBe(0);
  });

  it('herkent een afgekapt antwoord', () => {
    const afgekapt = { ...ANTWOORD, status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' } };
    expect(leesChatGptAntwoord(afgekapt).afgekapt).toBe(true);
    expect(leesChatGptAntwoord(afgekapt).stopReden).toBe('max_output_tokens');
  });

  it('geeft null bij kapotte JSON in plaats van te struikelen', () => {
    const kapot = { output: [{ type: 'function_call', arguments: '{"issues":[' }] };
    expect(leesChatGptAntwoord(kapot).uitvoer).toBeNull();
  });

  it('geeft null als er geen functie-aanroep in zit', () => {
    expect(leesChatGptAntwoord({ output: [{ type: 'message', content: [] }] }).uitvoer).toBeNull();
    expect(leesChatGptAntwoord({}).uitvoer).toBeNull();
  });

  it('bewaart de ruwe usage, zodat een correctie achteraf geen nieuwe draai kost', () => {
    expect(leesChatGptAntwoord(ANTWOORD).ruweUsage).toBe(ANTWOORD.usage);
  });
});

describe('leesAntwoord kiest de juiste uitpakker', () => {
  it('per leverancier', () => {
    const claudeJson = { content: [{ type: 'tool_use', input: { a: 1 } }], usage: {} };
    expect(leesAntwoord(maakDeelnemer('claude'), claudeJson).uitvoer).toEqual({ a: 1 });

    const gptJson = {
      output: [{ type: 'function_call', arguments: '{"a":1}' }], usage: {},
    };
    expect(leesAntwoord(maakDeelnemer('chatgpt'), gptJson).uitvoer).toEqual({ a: 1 });
  });
});

describe('bouwHeaders', () => {
  it('zet de juiste kop per leverancier', () => {
    const env = { ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'b' };
    expect(bouwHeaders(maakDeelnemer('claude'), env)).toMatchObject({
      'x-api-key': 'a', 'anthropic-version': '2023-06-01',
    });
    expect(bouwHeaders(maakDeelnemer('chatgpt'), env)).toMatchObject({ Authorization: 'Bearer b' });
  });

  it('meldt een ontbrekende sleutel bij naam in plaats van een 401 te halen', () => {
    expect(() => bouwHeaders(maakDeelnemer('chatgpt'), {})).toThrow(/OPENAI_API_KEY/);
  });
});

describe('bronwachter', () => {
  it('geeft elke leverancier een sleutelnaam, een standaardmodel en een url', () => {
    for (const [naam, l] of Object.entries(LEVERANCIERS)) {
      expect(l.sleutel, naam).toMatch(/_API_KEY$/);
      expect(l.standaardModel, naam).toBeTruthy();
      for (const regio of ['eu', 'globaal']) {
        expect(l.urls[regio], `${naam}/${regio}`).toMatch(/^https:\/\//);
      }
    }
  });
});

describe('waaróm er niets uitkwam', () => {
  it('meldt of de tool überhaupt is aangeroepen', () => {
    // Nul bevindingen heeft drie oorzaken die er van buiten hetzelfde uitzien: geen
    // tool-aanroep, een aanroep zonder issues-veld, of een echt lege lijst. Op
    // 22 september 2026 meldde het harnas de eerste als de derde — een mislukking die
    // als oordeel in de uitslag stond.
    const zonder = leesClaudeAntwoord({
      stop_reason: 'end_turn', content: [{ type: 'text', text: 'Ik zie niets.' }], usage: {},
    });
    expect(zonder.heeftToolAanroep).toBe(false);
    expect(zonder.stopReden).toBe('end_turn');

    const met = leesClaudeAntwoord({
      stop_reason: 'tool_use', content: [{ type: 'tool_use', input: { issues: [] } }], usage: {},
    });
    expect(met.heeftToolAanroep).toBe(true);
    expect(met.uitvoer).toEqual({ issues: [] });
  });

  it('doet hetzelfde voor de uitdager', () => {
    const zonder = leesChatGptAntwoord({
      status: 'completed', output: [{ type: 'message', content: [] }], usage: {},
    });
    expect(zonder.heeftToolAanroep).toBe(false);
    expect(zonder.stopReden).toBe('completed');
  });
});
