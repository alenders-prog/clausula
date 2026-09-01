/**
 * scripts/meet-zoekronde-model.mjs — kan de zoekronde op Haiku in plaats van Sonnet?
 *
 * Aanleiding (1 september 2026). Uit api_verbruik over de laatste 400 aanroepen:
 *
 *   ai-assistent · zoekronde · claude-sonnet-4-6   17× | gem $0,0203 | gem 4792 ms
 *
 * Die aanroep heeft `max_tokens: 400` en één taak: bepalen wáárop er in de kennisbank
 * gezocht wordt. Het antwoord zelf komt in een volgende stap. Er staat geen `model` in het
 * verzoek, dus hij valt terug op de standaard van callClaude — Sonnet. Met MAX_ZOEK = 5
 * kost het kiezen van zoektermen zo tot $0,10 per vraag: meer dan de consolidatie en de
 * consistentiecheck van een hele analyse samen.
 *
 * ── WAT ER GEMETEN WORDT, EN WAAROM ZO ──────────────────────────────────────
 *
 * Niet "leest de uitkomst er goed uit" — dat is precies de valkuil die in CLAUDE.md staat
 * bij de eval-diff. Wat telt is wélke kennisbank-chunks er uiteindelijk bij het antwoord
 * belanden, want dat is het enige dat de zoekronde beïnvloedt.
 *
 * Daarom per vraag, per model, twee keer:
 *   1. de zoekronde draaien met de ECHTE ZOEK_SYSTEEM en ZOEK_TOOLS (uit de bron
 *      gelezen, niet nagetypt — een kopie zou meten wat ik denk dat er staat);
 *   2. de gekozen zoektermen door zoekChunks halen;
 *   3. de citaten van de gevonden chunks vergelijken tussen de modellen.
 *
 * Twee runs per combinatie, omdat één run niets zegt: op 24 augustus verschilden twee
 * controleruns op identieke code al 8 tot 10 bevindingen per fixture.
 *
 * Draaien:  node scripts/meet-zoekronde-model.mjs
 * Kosten:   ruwweg $0,25–0,40. Er wordt niets weggeschreven.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { zoekChunks } from '../src/kennisbank/zoek.js';

const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(),
             l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));

const { ANTHROPIC_API_KEY: KEY, VOYAGE_API_KEY: VKEY,
        SUPABASE_URL: SB_URL, SUPABASE_SERVICE_ROLE_KEY: SB_KEY } = env;

// De embed-sleutel is een ANDERE dan die van Anthropic. Bij de eerste run gaf ik hier
// per ongeluk KEY mee: Voyage antwoordde 401, zoekChunks viel terug op woordzoeken, en
// de overlap was dus gemeten op iets wat productie niet doet. Vandaar deze controle.
if (!VKEY) throw new Error('VOYAGE_API_KEY ontbreekt — dan meet je woordzoeken, niet semantisch.');
const supabase = createClient(SB_URL, SB_KEY);

// ── De echte prompt en tools uit api/ai-assistent.js ────────────────────────
//
// Uit de bron gelezen in plaats van overgeschreven. Een kopie hier zou langzaam gaan
// afwijken, en dan meet dit script iets anders dan de app doet — dezelfde soort fout als
// de drie schaduwtabellen die vandaag boven water kwamen.
const bron = readFileSync('api/ai-assistent.js', 'utf8');

/** Pakt `const NAAM = <waarde>;` uit de bron, van het `=` tot de afsluitende regel. */
function pak(naam, eind) {
  const start = bron.indexOf(`const ${naam} = `);
  if (start < 0) throw new Error(`${naam} niet gevonden in api/ai-assistent.js`);
  const na = start + `const ${naam} = `.length;
  const eindPos = bron.indexOf(eind, na);
  if (eindPos < 0) throw new Error(`einde van ${naam} niet gevonden (gezocht: ${eind})`);
  return bron.slice(na, eindPos + eind.length - 1);   // zonder de puntkomma
}

// eslint-disable-next-line no-eval
const ZOEK_SYSTEEM = eval(pak('ZOEK_SYSTEEM', '`;'));
// eslint-disable-next-line no-eval
const ZOEK_TOOLS = eval(`(${pak('ZOEK_TOOLS', '\n];')})`);

if (typeof ZOEK_SYSTEEM !== 'string' || !Array.isArray(ZOEK_TOOLS) || ZOEK_TOOLS.length !== 2) {
  throw new Error('ZOEK_SYSTEEM of ZOEK_TOOLS niet goed uit de bron gehaald — '
    + 'meten met een halve prompt zegt niets.');
}

// ── De vragen ───────────────────────────────────────────────────────────────
//
// Uit de praktijk van een MfN-mediator, en bewust gemengd: vier waar écht iets opgezocht
// moet worden, twee waar dat niet hoeft. Die laatste twee zijn het scherpst — een model
// dat altijd gaat zoeken kost vijf rondes in plaats van nul.
const VRAGEN = [
  'Hoe wordt kinderalimentatie berekend volgens de Tremanormen bij co-ouderschap?',
  'Moet pensioenverevening in het convenant worden geregeld als partijen het uitsluiten?',
  'Wat geldt er voor een woning die vóór het huwelijk is aangekocht bij een beperkte gemeenschap na 1-1-2018?',
  'Welke termijn geldt voor het verzoek tot verdeling van een nalatenschap bij echtscheiding?',
  'Kun je deze zin wat vriendelijker formuleren voor de klant?',
  'Bedankt, dat is duidelijk.',
];

const MODELLEN = ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001'];
const RUNS = 2;

async function zoekronde(model, vraag) {
  const t0 = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model, max_tokens: 400, temperature: 0.3,
      system: ZOEK_SYSTEEM, tools: ZOEK_TOOLS,
      messages: [{ role: 'user', content: vraag }],
    }),
  });
  const j = await res.json();
  if (j.error) return { fout: j.error.message, duur: Date.now() - t0 };

  const tools = (j.content || []).filter(c => c.type === 'tool_use');
  const tekst = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join(' ').trim();
  const u = j.usage || {};
  // Prijzen per miljoen tokens, 1 september 2026.
  const P = { 'claude-sonnet-4-6': [3, 15], 'claude-haiku-4-5-20251001': [1, 5] }[model];
  return {
    duur:    Date.now() - t0,
    kosten:  (u.input_tokens / 1e6) * P[0] + (u.output_tokens / 1e6) * P[1],
    zoekt:   tools.length > 0,
    termen:  tools.filter(t => t.name === 'zoek_juridisch').map(t => t.input.zoektermen),
    tags:    tools.filter(t => t.name === 'zoek_juridisch').flatMap(t => t.input.tags || []),
    web:     tools.some(t => t.name === 'zoek_web'),
    tekst,
  };
}

/** De citaten die déze zoektermen uit de kennisbank halen. */
async function citaten(termen, tags) {
  const uit = new Set();
  for (const t of termen) {
    const { chunks, methode } = await zoekChunks(supabase, t, tags, { apiKey: VKEY, aantal: 5 });
    if (methode !== 'semantisch') throw new Error('terugval op woordzoeken — meting zegt niets over productie');
    for (const c of chunks || []) uit.add(c.citation);
  }
  return uit;
}

const overlap = (a, b) => {
  if (!a.size && !b.size) return 1;
  const gedeeld = [...a].filter(x => b.has(x)).length;
  return gedeeld / Math.max(a.size, b.size);
};

// ── Meten ───────────────────────────────────────────────────────────────────

const totaal = {};
for (const m of MODELLEN) totaal[m] = { kosten: 0, duur: 0, n: 0, zoekt: 0 };

for (const vraag of VRAGEN) {
  console.log(`\n${'─'.repeat(78)}\n${vraag}`);
  const perModel = {};

  for (const model of MODELLEN) {
    const rondes = [];
    for (let r = 0; r < RUNS; r++) rondes.push(await zoekronde(model, vraag));

    const naam = model.split('-').slice(0, 3).join('-');
    for (const x of rondes) {
      if (x.fout) { console.log(`  ${naam.padEnd(18)} FOUT: ${x.fout}`); continue; }
      totaal[model].kosten += x.kosten; totaal[model].duur += x.duur;
      totaal[model].n++; if (x.zoekt) totaal[model].zoekt++;
    }
    const goed = rondes.filter(x => !x.fout);
    if (!goed.length) continue;

    const alleTermen = [...new Set(goed.flatMap(x => x.termen))];
    const alleTags   = [...new Set(goed.flatMap(x => x.tags))];
    perModel[model]  = await citaten(alleTermen, alleTags);

    console.log(`  ${naam.padEnd(18)} zoekt: ${goed.map(x => x.zoekt ? 'ja' : 'nee').join('/')}`
      + ` | $${(goed.reduce((a, x) => a + x.kosten, 0) / goed.length).toFixed(4)}`
      + ` | ${Math.round(goed.reduce((a, x) => a + x.duur, 0) / goed.length)}ms`
      + ` | ${perModel[model].size} chunk(s)`);
    for (const t of alleTermen) console.log(`      → "${t}"`);
    if (alleTags.length) console.log(`      tags: ${alleTags.join(', ')}`);
    const stil = goed.find(x => !x.zoekt);
    if (stil) console.log(`      zonder zoekopdracht: "${stil.tekst.slice(0, 60)}"`);
  }

  const [a, b] = MODELLEN.map(m => perModel[m]).filter(Boolean);
  if (a && b) {
    const o = overlap(a, b);
    console.log(`  OVERLAP van de gevonden chunks: ${(o * 100).toFixed(0)}%`
      + (o < 1 ? `  (alleen Sonnet: ${[...a].filter(x => !b.has(x)).join(', ') || '—'}`
               + ` | alleen Haiku: ${[...b].filter(x => !a.has(x)).join(', ') || '—'})` : ''));
  }
}

console.log(`\n${'═'.repeat(78)}\nTOTAAL over ${VRAGEN.length} vragen × ${RUNS} runs`);
for (const m of MODELLEN) {
  const t = totaal[m];
  console.log(`  ${m.padEnd(28)} $${t.kosten.toFixed(4)} totaal`
    + ` | $${(t.kosten / t.n).toFixed(4)} per ronde`
    + ` | ${Math.round(t.duur / t.n)}ms gemiddeld`
    + ` | zocht ${t.zoekt}/${t.n}×`);
}
const [s, h] = MODELLEN.map(m => totaal[m]);
console.log(`\n  Haiku is ${(s.kosten / h.kosten).toFixed(1)}× goedkoper`
  + ` en ${(s.duur / h.duur).toFixed(1)}× sneller per ronde.`);
