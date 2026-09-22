/**
 * src/vergelijking/leverancier.js — dezelfde opdracht, aan wie dan ook
 *
 * Bestaat om te kunnen meten wie het beter doet. De valkuil bij zo'n vergelijking is dat
 * je twee prompts vergelijkt in plaats van twee modellen. Daarom bouwen beide kanten
 * hier hun verzoek uit exact dezelfde ingrediënten: dezelfde systeemtekst, dezelfde
 * gebruikersinhoud, en hetzelfde JSON Schema. Alleen de vorm van het verzoek verschilt,
 * want die moet wel.
 *
 * ── HET BESLUIT UIT FASE 0 ──────────────────────────────────────────────────
 *
 * Aan beide kanten een **afgedwongen functie-aanroep met hetzelfde schema** — niet een
 * afgedwongen tool tegenover een `json_schema`-antwoordformaat. Dan is de vorm aan beide
 * kanten dezelfde: één benoemde functie die het model moet aanroepen.
 *
 * Dat is hier ook inhoudelijk de eerlijke keuze, want het schema draagt een flink deel
 * van de instructie. `onderwerpBeschrijving` en de beschrijving bij `samenvatting` in
 * `api/analyseer.js` zijn geen typeannotaties maar opdrachten, en die reizen zo woord
 * voor woord mee.
 *
 * ── WAT NIET GELIJK TE SCHAKELEN IS ─────────────────────────────────────────
 *
 * Drie dingen, en ze horen in de uitslag te staan in plaats van weggepoetst:
 *
 * 1. `temperature`. De productie stuurt 0,3. Dat is geen leverancierseigenschap maar een
 *    MODELeigenschap: `claude-sonnet-4-6` accepteert hem, `claude-sonnet-5` geeft er een
 *    400 op ("temperature is deprecated for this model"), en de redeneermodellen aan de
 *    andere kant accepteren alleen de standaardwaarde. Zie `ZONDER_TEMPERATURE`.
 *
 *    Dat betekent dat een vergelijking tussen 4.6 en 5 principieel níét volledig gelijk
 *    te schakelen is: de een krijgt 0,3, de ander de standaard. Dat is geen detail om weg
 *    te poetsen — het hoort in de uitslag. Het harnas noteert per deelnemer wat
 *    `accepteertTemperature` zegt, zodat het verschil in de ruwe tellingen terugkomt.
 *
 * 2. Het tokenbudget. `max_tokens` bij Anthropic telt alleen wat er geschreven wordt;
 *    `max_completion_tokens` bij OpenAI telt de redeneertokens mee. Gelijke getallen
 *    zijn dus ONgelijke budgetten. Daarom `UITDAGER_BUDGETFACTOR` hieronder. Met een
 *    krap budget gaat het grootste deel op aan nadenken en komt de JSON er half uit —
 *    dat leest als een slecht model en is een instellingsfout.
 *
 * 3. De tool-overhead. Een afgedwongen keuze kost bij Anthropic 589 systeemtokens op
 *    Sonnet 4.6, tegen 497 bij `auto`. Dat zit in de invoertelling die we vergelijken.
 *
 * ── GEEN HERPOGINGEN HIER ───────────────────────────────────────────────────
 *
 * `askClaude` in `api/analyseer.js` probeert bij `max_tokens` automatisch opnieuw met
 * een verdubbeld budget, en daarnaast tot twee keer bij een fout. Dat hoort niet in dit
 * bestand thuis: laat je het staan voor één deelnemer, dan krijgt die er twee of drie
 * pogingen bij en komt dat in de telling terecht als kwaliteit. Hier is één aanroep één
 * aanroep. Het harnas beslist wat het met een afgekapt antwoord doet, voor iedereen
 * gelijk, en telt ze apart.
 */

/**
 * Het uitvoerbudget van de uitdager, ten opzichte van dat van Claude.
 *
 * Vier is geen gemeten waarde maar een ruime marge, en met opzet aan de royale kant:
 * te krap kost een meting (half afgekapte JSON die als modelfout leest), te ruim kost
 * alleen geld als het model het opmaakt — en dat doet het niet vanzelf.
 */
export const UITDAGER_BUDGETFACTOR = 4;

/**
 * Claude-modellen die `temperature` weigeren met een 400.
 *
 * Gemeten op 22 september 2026, bij de eerste draai van dit harnas:
 * `claude-sonnet-5` gaf "`temperature` is deprecated for this model". De
 * sampling-parameters zijn verwijderd op Sonnet 5 en de hele Opus 4.7-en-later-reeks;
 * Sonnet 4.6, Opus 4.6 en Haiku 4.5 accepteren ze nog.
 *
 * Dit is een weigerlijst en geen toestaanlijst, met opzet. Komt er een model bij dat de
 * parameter niet accepteert, dan geeft het een luide 400 die je niet kunt missen. Zou ik
 * het omdraaien, dan kreeg een nieuw model stilzwijgend de standaardtemperatuur in plaats
 * van de 0,3 die productie stuurt — en dan meet je iets anders dan je denkt, zonder dat
 * er iets misgaat.
 */
export const ZONDER_TEMPERATURE = Object.freeze([
  'claude-sonnet-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7',
  'claude-fable-5', 'claude-fable-5-1',
]);

/** Accepteert dit model de temperatuur die productie meestuurt? */
export const accepteertTemperature = (model) =>
  !ZONDER_TEMPERATURE.some((m) => String(model ?? '').startsWith(m));

/**
 * Claude-modellen die `output_config.effort` niet kennen en er een fout op geven.
 * Sonnet 4.6 en Opus 4.6 en later kennen hem wel.
 */
export const ZONDER_EFFORT = Object.freeze(['claude-haiku-4-5', 'claude-sonnet-4-5']);

/** Kent dit model de diepte-instelling? */
export const accepteertEffort = (model) =>
  !ZONDER_EFFORT.some((m) => String(model ?? '').startsWith(m));

export const LEVERANCIERS = Object.freeze({
  claude: {
    merk: 'Claude',
    sleutel: 'ANTHROPIC_API_KEY',
    standaardModel: 'claude-sonnet-4-6',
    // Anthropic kent geen EU-verwerking: `inference_geo` heeft alleen "us" en "global".
    // Beide sleutels wijzen hier dus naar hetzelfde adres.
    urls: { eu: 'https://api.anthropic.com/v1/messages', globaal: 'https://api.anthropic.com/v1/messages' },
  },
  chatgpt: {
    merk: 'ChatGPT',
    sleutel: 'OPENAI_API_KEY',
    standaardModel: 'gpt-5.6-terra',
    // Twee endpoints, en de keuze is er een.
    //
    // `eu` is waar het naartoe moet: Europese verwerking geldt voor
    // /v1/chat/completions en vereist een project met geografiebeperking, plus
    // goedkeuring voor aangepaste abuse-monitoring of zero data retention. Zie
    // docs/modelvergelijking.md.
    //
    // `globaal` bestaat omdat dat project er nog niet is. Een gewone sleutel krijgt op
    // het EU-endpoint een 401: "This endpoint is only accessible by projects with
    // geography restrictions enabled." Gemeten op 22 september 2026.
    //
    // Wat je dan nog steeds eerlijk meet: het model is hetzelfde, dus de tokens, de
    // kosten en de bevindingen zijn overdraagbaar. Wat NIET overdraagbaar is, is de
    // tijd — die hangt aan de regio. Het harnas zegt dat er hardop bij, want anders is
    // het over een week een cijfer zonder voorbehoud.
    urls: {
      eu:      'https://eu.api.openai.com/v1/chat/completions',
      globaal: 'https://api.openai.com/v1/chat/completions',
    },
  },
});

/**
 * Een deelnemer uit `leverancier:model@diepte#variant`.
 *
 * Model, diepte en variant mogen weg. Zo zet je merken naast elkaar, maar ook één model
 * tegen zichzelf op een andere stand — en dat laatste is vaak de vraag die er werkelijk
 * toe doet.
 */
export function maakDeelnemer(spec, { regio = 'eu' } = {}) {
  const tekst = String(spec ?? '').trim();
  if (!tekst) throw new Error('Lege deelnemer.');

  const [zonderVariant, variant = null] = tekst.split('#');
  // Geen `@diepte` betekent: niets meesturen, dus de stand van de leverancier zelf.
  // Dat is bewust geen stilzwijgende `low`: productie stuurt ook niets mee, en een
  // deelnemer die "de huidige stand" heet moet dan ook de huidige stand zijn.
  const [voor, diepte = null] = zonderVariant.split('@');
  const [naam, model] = voor.split(':');

  const l = LEVERANCIERS[naam];
  if (!l) {
    throw new Error(
      `Onbekende leverancier "${naam}". Kies uit ${Object.keys(LEVERANCIERS).join(', ')}.`,
    );
  }

  if (!l.urls[regio]) throw new Error(`Onbekende regio "${regio}". Kies uit ${Object.keys(l.urls).join(', ')}.`);

  return {
    spec: tekst,
    leverancier: naam,
    merk: l.merk,
    sleutel: l.sleutel,
    regio,
    url: l.urls[regio],
    model: model || l.standaardModel,
    diepte,
    variant,
    kort: `${(model || l.standaardModel).replace(/^claude-/, '')} ${diepte ?? 'standaard'}`,
  };
}

/** De systeemblokken van `api/analyseer.js` platgeslagen tot één tekst. */
export function alsTekst(systemPrompt) {
  if (typeof systemPrompt === 'string') return systemPrompt;
  if (Array.isArray(systemPrompt)) return systemPrompt.map((b) => b?.text ?? '').join('\n\n');
  return String(systemPrompt ?? '');
}

/** Hetzelfde voor de gebruikersinhoud, die als `{text, cache}`-blokken kan komen. */
export function gebruikersTekst(userContent) {
  if (typeof userContent === 'string') return userContent;
  if (Array.isArray(userContent)) return userContent.map((b) => b?.text ?? '').join('\n\n');
  return String(userContent ?? '');
}

/**
 * Het verzoeklichaam voor Claude — gelijk aan wat `askClaude` in productie stuurt.
 *
 * De prompt-cache staat hier uit, net als daar. Zie `src/api/prompt-cache.js`: 153.284
 * tokens aangelegd en nul gelezen. Zou hij hier aan staan, dan meet je een instelling
 * die in productie niet geldt.
 */
export function bouwClaudeVerzoek({ systemPrompt, userContent, tool, model, maxTokens, diepte = null, temperature = 0.3 }) {
  return {
    model,
    max_tokens: maxTokens,
    // Alleen waar het model hem accepteert — zie ZONDER_TEMPERATURE.
    ...(accepteertTemperature(model) ? { temperature } : {}),
    // De diepte ging hier tot 22 september 2026 verloren: `bouwChatGptVerzoek` gebruikte
    // hem wel en deze niet. Gevolg was dat `claude:…@low` en `claude:…@high` exact
    // hetzelfde verzoek opleverden — het etiket zei iets anders dan het verzoek deed, en
    // dat ging stil mis. Gevonden doordat een uitslag te mooi klopte om te controleren.
    //
    // Geen diepte in de spec betekent niets meesturen: dan geldt de stand van de
    // leverancier, en dat is wat productie ook doet.
    ...(diepte && accepteertEffort(model) ? { output_config: { effort: diepte } } : {}),
    system: [{ type: 'text', text: alsTekst(systemPrompt) }],
    messages: [{ role: 'user', content: gebruikersTekst(userContent) }],
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
  };
}

/**
 * Het verzoeklichaam voor de uitdager. Hetzelfde schema, andere verpakking.
 *
 * Geen `temperature`: zie punt 1 in de kop. En `max_completion_tokens` in plaats van
 * `max_tokens`, ruimer bemeten om punt 2.
 */
export function bouwChatGptVerzoek({ systemPrompt, userContent, tool, model, maxTokens, diepte = null }) {
  return {
    model,
    max_completion_tokens: maxTokens * UITDAGER_BUDGETFACTOR,
    // Net als hierboven: geen diepte in de spec betekent de stand van de leverancier.
    ...(diepte ? { reasoning_effort: diepte } : {}),
    messages: [
      { role: 'system', content: alsTekst(systemPrompt) },
      { role: 'user',   content: gebruikersTekst(userContent) },
    ],
    tools: [{
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        // Hetzelfde schema-object, inclusief alle beschrijvingen. Dit is de plek waar de
        // gelijkschakeling staat of valt: hier iets aan bewerken is de opdracht wijzigen.
        parameters: tool.input_schema,
      },
    }],
    tool_choice: { type: 'function', function: { name: tool.name } },
  };
}

/** Het verzoek voor een deelnemer, welke dan ook. */
export function bouwVerzoek(deelnemer, opdracht) {
  const bouw = deelnemer.leverancier === 'claude' ? bouwClaudeVerzoek : bouwChatGptVerzoek;
  return bouw({ ...opdracht, model: deelnemer.model, diepte: deelnemer.diepte });
}

// ── het antwoord uitpakken ───────────────────────────────────────────────────
//
// Beide kanten leveren vier tellingen en één ingevuld schema. Dat de velden anders heten
// en anders geteld worden is precies waarom dit hier gebeurt en niet bij de aanroeper.

/**
 * @returns {{uitvoer: object|null, vers, cacheSchrijf, cacheLees, uit, afgekapt: boolean}}
 */
export function leesClaudeAntwoord(json) {
  const toolUse = json?.content?.find((b) => b.type === 'tool_use');
  return {
    uitvoer:      toolUse?.input ?? null,
    // Waaróm er niets uitkwam, als er niets uitkwam. Zonder dit is "het model riep de
    // tool niet aan" niet te onderscheiden van "het model vond niets", en dat is precies
    // wat er op 22 september 2026 misging: sonnet-5 op `max` leverde twee keer nul
    // bevindingen bij 5.457 uitvoertokens, en de meting meldde dat als een oordeel.
    stopReden:    json?.stop_reason ?? null,
    heeftToolAanroep: !!toolUse,
    vers:         json?.usage?.input_tokens ?? 0,
    cacheSchrijf: json?.usage?.cache_creation_input_tokens ?? 0,
    cacheLees:    json?.usage?.cache_read_input_tokens ?? 0,
    uit:          json?.usage?.output_tokens ?? 0,
    afgekapt:     json?.stop_reason === 'max_tokens',
  };
}

/**
 * Idem voor de uitdager.
 *
 * Twee dingen zijn anders dan ze lijken. `prompt_tokens` is daar het TOTAAL inclusief
 * wat uit de cache kwam, terwijl `input_tokens` bij Anthropic juist het verse deel is —
 * dus eraf trekken, anders tel je de cache dubbel en komt de rekening te hoog uit. En de
 * argumenten van de functie-aanroep komen als string binnen, niet als object.
 */
export function leesChatGptAntwoord(json) {
  const keuze = json?.choices?.[0];
  const ruw   = keuze?.message?.tool_calls?.[0]?.function?.arguments;

  let uitvoer = null;
  if (typeof ruw === 'string' && ruw.trim()) {
    try { uitvoer = JSON.parse(ruw); } catch { uitvoer = null; }
  }

  const cacheLees = json?.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    uitvoer,
    stopReden: keuze?.finish_reason ?? null,
    heeftToolAanroep: !!keuze?.message?.tool_calls?.[0],
    vers:         Math.max(0, (json?.usage?.prompt_tokens ?? 0) - cacheLees),
    // Er komt geen aparte telling voor cache-schrijven terug; die is niet te meten en
    // dus niet te beprijzen. Nul is hier de eerlijke waarde, geen aanname.
    cacheSchrijf: 0,
    cacheLees,
    uit:          json?.usage?.completion_tokens ?? 0,
    afgekapt:     keuze?.finish_reason === 'length',
  };
}

/** Het antwoord van een deelnemer uitpakken, welke dan ook. */
export function leesAntwoord(deelnemer, json) {
  return deelnemer.leverancier === 'claude'
    ? leesClaudeAntwoord(json)
    : leesChatGptAntwoord(json);
}

/** De headers voor een deelnemer. De sleutel komt uit de omgeving, niet uit de spec. */
export function bouwHeaders(deelnemer, env = process.env) {
  const sleutel = env[deelnemer.sleutel];
  if (!sleutel) throw new Error(`${deelnemer.sleutel} ontbreekt in de omgeving.`);

  return deelnemer.leverancier === 'claude'
    ? { 'Content-Type': 'application/json', 'x-api-key': sleutel, 'anthropic-version': '2023-06-01' }
    : { 'Content-Type': 'application/json', Authorization: `Bearer ${sleutel}` };
}
