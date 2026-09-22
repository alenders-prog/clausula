#!/usr/bin/env node
/**
 * scripts/vergelijk-modellen.mjs — twee modellen dezelfde screening laten doen
 *
 * Draaien:
 *   node scripts/vergelijk-modellen.mjs --deelnemers "claude,chatgpt:gpt-5.6-luna@low"
 *   node scripts/vergelijk-modellen.mjs --deelnemers "chatgpt:gpt-5.6-luna@low,chatgpt:gpt-5.6-luna@high" --runs 3
 *
 * KOST ECHTE API-AANROEPEN, bij beide leveranciers. Eén ronde per deelnemer over de
 * standaardfixture is ordegrootte $0,20–$1,00, afhankelijk van het model.
 *
 * ── WAT ERUIT KOMT ──────────────────────────────────────────────────────────
 *
 * 1. Een telling. Per deelnemer de kosten uitgesplitst naar invoer en uitvoer, de tijd,
 *    de tokens, hoeveel bevindingen er zijn, en hoeveel mechanische defecten
 *    `src/analyse/uitvoercontrole.js` erin vindt. Dat is niet voor discussie vatbaar.
 *
 * 2. Een leesbestand. Per ronde de uitvoer van elke deelnemer onder elkaar, want de
 *    telling ziet niet of een bevinding ergens op slaat — dat blijft mensenwerk.
 *
 *    Standaard mét de naam van de deelnemer erboven. Met `--blind` komen de varianten
 *    als "A", "B", … in wisselende volgorde en staat de sleutel onderaan. Dat is niet
 *    overdreven voorzichtigheid: wie de namen ziet beoordeelt mede het merk. Bij
 *    verkennend lezen is dat geen bezwaar; op het moment dat de uitslag neerkomt op een
 *    kwaliteitsoordeel tussen twee kandidaten die dicht bij elkaar liggen, is één blinde
 *    ronde de goedkoopste manier om jezelf te controleren.
 *
 * ── HOE JE DE UITKOMST LEEST ────────────────────────────────────────────────
 *
 * **Kosten** zijn stabiel over draaien heen en mag je na één ronde opschrijven.
 *
 * **Het aantal bevindingen niet.** Twee identieke runs op deze pijplijn verschillen 8 tot
 * 10 bevindingen per fixture. Een deelnemer die er drie meer vindt, heeft niets bewezen.
 * Wat wél telt is een gericht signaal over meerdere runs — zie scripts/meet-signalen.mjs.
 *
 * ── DE AANROEP IS MET OPZET KAAL ────────────────────────────────────────────
 *
 * Eén poging per deelnemer per ronde, geen herpogingen, geen verdubbeld budget bij een
 * afgekapt antwoord. `askClaude` in productie doet dat wél, en juist daarom niet hier:
 * één deelnemer drie kansen geven en de andere één komt in de telling terecht als
 * kwaliteit. Afgekapte antwoorden worden apart geteld en tellen niet mee als bevinding.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { leesEnv } from '../tests/helpers/test-token.mjs';
import { anonimiseerTekst } from '../src/naam-anonimiseer.js';
import { controleerUitvoer } from '../src/analyse/uitvoercontrole.js';
import {
  maakDeelnemer, bouwVerzoek, leesAntwoord, bouwHeaders, accepteertTemperature,
} from '../src/vergelijking/leverancier.js';
import { kosten, verdeling, prijsBekend } from '../src/vergelijking/prijzen.js';
import { bevindingentool } from '../api/analyseer.js';
import { bouwStabielGedeeld } from '../api/_prompts/gedeeld.js';
import { bouwSysBevindingen } from '../api/_prompts/bevindingen.js';
import {
  bouwAnderDocsNota, bouwRoepnamenNota, bouwJuridischeChecks, bouwHvChecks, bouwIprChecks,
} from '../api/_prompts/fragmenten.js';

leesEnv();

const arg = (naam, standaard) =>
  process.argv.find((a) => a.startsWith(`--${naam}=`))?.split('=')[1]
  ?? (process.argv.includes(`--${naam}`) ? process.argv[process.argv.indexOf(`--${naam}`) + 1] : standaard);

const RUNS    = Math.max(1, parseInt(arg('runs', '1'), 10) || 1);
const FIXTURE = arg('fixture', 'tests/golden/meting/twee-documenten.json');
const UIT     = arg('uit', 'vergelijking');
const SPECS   = String(arg('deelnemers', 'claude,chatgpt')).split(',').map((s) => s.trim()).filter(Boolean);
const BLIND   = process.argv.includes('--blind');
const REGIO   = arg('regio', 'eu');

const DEELNEMERS = SPECS.map((s) => maakDeelnemer(s, { regio: REGIO }));
const MERKEN = 'ABCDEFGH'.split('');

// ── de opdracht, één keer opgebouwd ─────────────────────────────────────────
//
// Dezelfde systeemprompt en hetzelfde schema als productie. Beide komen uit de bron —
// api/_prompts/ en de tooldefinitie in api/analyseer.js — en niet uit een kopie hier,
// want dan meet je een prompt die niemand draait.

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const docType = fixture._meta?.doc_type ?? 'convenant';
const kenmerken = fixture._meta?.situatie_kenmerken ?? [];

const gezien = new Map(); const teller = {};
const piiPh = (type, waarde) => {
  const k = `${type}:${waarde}`;
  if (!gezien.has(k)) { teller[type] = teller[type] ?? 0; gezien.set(k, `[${type}_${teller[type]++}]`); }
  return gezien.get(k);
};
const documenten = fixture.documenten.map((d) => ({
  ...d, tekst: anonimiseerTekst(d.tekst, new Map(), piiPh),
}));
const gezienTekst = documenten.map((d) => d.tekst).join('\n\n');

const vandaag = new Date().toISOString().slice(0, 10);
const systemPrompt = [
  { type: 'text', text: bouwStabielGedeeld(vandaag, kenmerken) },
  { type: 'text', text: bouwSysBevindingen({
    docTypLabel: docType,
    anderDocsNota:    bouwAnderDocsNota(documenten.slice(1).map((d) => d.type)),
    roepnamenNota:    bouwRoepnamenNota([]),
    juridischeChecks: bouwJuridischeChecks(docType),
    hvChecks:         bouwHvChecks(kenmerken.includes('huwelijkse_voorwaarden')),
    iprChecks:        bouwIprChecks(docType),
  }) },
];
const OPDRACHT = {
  systemPrompt,
  userContent: documenten.map((d) => ({ text: `=== ${d.bestandsnaam} (${d.type}) ===\n${d.tekst}` })),
  tool: bevindingentool,
  maxTokens: 8000,
};

// ── draaien ─────────────────────────────────────────────────────────────────

console.log(`fixture     : ${FIXTURE} (${documenten.length} documenten, ${gezienTekst.length} tekens)`);
console.log(`deelnemers  : ${DEELNEMERS.map((d) => d.spec).join(', ')}`);
console.log(`runs        : ${RUNS}`);
console.log(`regio       : ${REGIO}\n`);

// De regio bepaalt wáár het model draait, niet wat het schrijft. Tokens, kosten en
// bevindingen zijn dus overdraagbaar naar de EU; de TIJD niet. Dat voorbehoud hoort
// boven de uitslag te staan en niet eronder, want over een week is het een kaal cijfer.
if (REGIO !== 'eu' && DEELNEMERS.some((d) => d.leverancier === 'chatgpt')) {
  console.warn('LET OP: de uitdager draait NIET op het Europese endpoint. Dat vereist een project');
  console.warn('       met geografiebeperking; een gewone sleutel krijgt daar een 401.');
  console.warn('       Kosten en bevindingen zijn overdraagbaar, de TIJDEN niet.\n');
}

for (const d of DEELNEMERS) {
  if (!prijsBekend(d.model)) console.warn(`LET OP: geen prijs bekend voor ${d.model} — kosten blijven leeg.`);
}

// Niet elke deelnemer krijgt dezelfde temperatuur, en dat is niet gelijk te trekken:
// sommige modellen weigeren de parameter. Dat hoort zichtbaar te zijn vóór de uitslag,
// niet als voetnoot erna.
const zonderTemp = DEELNEMERS.filter((d) => d.leverancier !== 'claude' || !accepteertTemperature(d.model));
if (zonderTemp.length && zonderTemp.length < DEELNEMERS.length) {
  console.warn(`LET OP: niet iedereen krijgt temperature 0,3 — ${zonderTemp.map((d) => d.spec).join(', ')} `
    + `${zonderTemp.length === 1 ? 'draait' : 'draaien'} op de standaard, want dat model accepteert de parameter niet.`);
  console.warn('       Die deelnemers zijn dus niet volledig gelijkgeschakeld. Zie docs/modelvergelijking.md.\n');
}

/** Eén aanroep. Geen herpogingen; zie de kop. */
async function roep(deelnemer) {
  const t0 = Date.now();
  const res = await fetch(deelnemer.url, {
    method: 'POST',
    headers: bouwHeaders(deelnemer),
    body: JSON.stringify(bouwVerzoek(deelnemer, OPDRACHT)),
  });
  if (!res.ok) throw new Error(`${deelnemer.merk} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return { ...leesAntwoord(deelnemer, json), ms: Date.now() - t0 };
}

const metingen = [];   // ruwe tellingen, één regel per aanroep
const rondes   = [];   // per ronde de uitvoer per deelnemer, voor het blinde bestand

for (let r = 1; r <= RUNS; r++) {
  const ronde = {};
  for (const d of DEELNEMERS) {
    process.stdout.write(`run ${r}/${RUNS}  ${d.spec.padEnd(34)} … `);
    try {
      const a = await roep(d);
      const issues = Array.isArray(a.uitvoer?.issues) ? a.uitvoer.issues : [];

      // Nul bevindingen heeft drie heel verschillende oorzaken, en ze zien er van
      // buiten hetzelfde uit. Zonder onderscheid meldt het harnas een mislukking als
      // een oordeel — dat gebeurde op 22 september 2026 met sonnet-5 op `max`.
      const leeg = issues.length === 0
        ? (!a.heeftToolAanroep ? 'geen tool-aanroep'
          : !Array.isArray(a.uitvoer?.issues) ? 'tool aangeroepen zonder issues-veld'
            : 'lege lijst')
        : null;
      const { telling } = controleerUitvoer({ issues }, { documentTekst: gezienTekst });
      const usd = kosten(d.model, a);

      metingen.push({
        run: r, spec: d.spec, model: d.model, diepte: d.diepte,
        temperatuur: d.leverancier === 'claude' && accepteertTemperature(d.model) ? 0.3 : 'standaard',
        ms: a.ms, vers: a.vers, cacheSchrijf: a.cacheSchrijf, cacheLees: a.cacheLees, uit: a.uit,
        usd, verdeling: verdeling(d.model, a),
        aantalIssues: issues.length, afgekapt: a.afgekapt, defecten: telling, fout: null,
        stopReden: a.stopReden, heeftToolAanroep: a.heeftToolAanroep, leeg, regio: d.regio,
        // De bevindingen zelf gaan mee. Ze stonden hier eerst niet in — alleen de
        // tellingen — en bij de eerste echte uitslag moest ik ze uit het leesbestand
        // terugparsen om te kunnen nagaan wélke bekende fouten waren gevonden. Dat is
        // precies wat regel 5 van de meetmethode wil voorkomen: zonder de ruwe uitvoer
        // kost elke vraag achteraf een nieuwe draai, en die vragen komen.
        issues,
      });
      ronde[d.spec] = issues;
      console.log(`${String(issues.length).padStart(3)} bevindingen  ${String(Math.round(a.ms / 1000)).padStart(3)}s  `
        + `${usd === null ? 'prijs onbekend' : '$' + usd.toFixed(4)}`
        + `${a.afgekapt ? '  AFGEKAPT' : ''}  defecten: ${telling.totaal}`
        + `${leeg ? `  ← ${leeg} (stop: ${a.stopReden})` : ''}`);
    } catch (e) {
      metingen.push({ run: r, spec: d.spec, model: d.model, fout: e.message });
      console.log(`FOUT: ${e.message}`);
    }
  }
  rondes.push(ronde);
}

// ── uitkomst ────────────────────────────────────────────────────────────────

const geslaagd = metingen.filter((m) => !m.fout);
if (geslaagd.length === 0) { console.log('\nGEEN geslaagde aanroep — er valt niets te melden.'); process.exit(1); }

console.log(`\n── per deelnemer, gemiddeld over de geslaagde runs ──`);
console.log(`  ${'deelnemer'.padEnd(34)} ${'runs'.padStart(5)} ${'$'.padStart(9)} ${'% invoer'.padStart(9)} ${'s'.padStart(5)} ${'issues'.padStart(7)} ${'defect'.padStart(7)}`);
for (const d of DEELNEMERS) {
  const m = geslaagd.filter((x) => x.spec === d.spec);
  if (m.length === 0) { console.log(`  ${d.spec.padEnd(34)} ${'0'.padStart(5)}  (alle runs mislukt)`); continue; }
  const gem = (f) => m.reduce((a, x) => a + f(x), 0) / m.length;
  const usd = m[0].usd === null ? null : gem((x) => x.usd);
  const invoerAandeel = m[0].verdeling === null ? null
    : gem((x) => (x.verdeling.vers + x.verdeling.cacheSchrijf + x.verdeling.cacheLees)
        / Math.max(1e-12, x.usd)) * 100;
  console.log(`  ${d.spec.padEnd(34)} ${String(m.length).padStart(5)} `
    + `${(usd === null ? '—' : '$' + usd.toFixed(4)).padStart(9)} `
    + `${(invoerAandeel === null ? '—' : invoerAandeel.toFixed(0) + '%').padStart(9)} `
    + `${gem((x) => x.ms / 1000).toFixed(0).padStart(5)} `
    + `${gem((x) => x.aantalIssues).toFixed(1).padStart(7)} `
    + `${gem((x) => x.defecten.totaal).toFixed(1).padStart(7)}`);
}

// ── de bekende fouten ───────────────────────────────────────────────────────
//
// Dit is de maat die de doorslag geeft, en niet het aantal bevindingen. Een deelnemer
// die er minder vindt kan strenger zijn of slechter; alleen dit zegt welke van de twee.
// De fixture noemt de fouten die er aantoonbaar in zitten.
if (Array.isArray(fixture.bekende_fouten) && fixture.bekende_fouten.length) {
  const tekstVan = (i) =>
    `${i.onderwerp ?? ''} ${i.bevinding ?? ''} ${i.passage ?? ''} ${i.aanbeveling ?? ''}`.toLowerCase();

  console.log(`\n── bekende fouten, gevonden in hoeveel van de geslaagde runs ──`);
  console.log(`  ${'fout'.padEnd(24)} ${DEELNEMERS.map((d) => d.kort.padStart(18)).join('')}`);
  for (const f of fixture.bekende_fouten) {
    const cel = DEELNEMERS.map((d) => {
      const m = geslaagd.filter((x) => x.spec === d.spec);
      if (m.length === 0) return '—'.padStart(18);
      const n = m.filter((x) => x.issues.some((i) => f.zoek.some((z) => tekstVan(i).includes(z.toLowerCase())))).length;
      return `${n}/${m.length}`.padStart(18);
    }).join('');
    console.log(`  ${f.sleutel.padEnd(24)}${cel}`);
  }
  console.log(`\n  Lees dit zo: 3/3 is betrouwbaar, 0/3 wijst op de prompt of het model,`);
  console.log(`  en alles ertussenin is variatie — daar helpt alleen méér runs tegen.`);
}

console.log(`\n  Kosten mag je na één ronde opschrijven; het aantal bevindingen niet —`);
console.log(`  twee identieke runs schelen hier 8 tot 10. Zie docs/modelvergelijking.md.`);

// Ruwe tellingen wegschrijven. Zonder dit kost elke correctie achteraf een nieuwe draai,
// en die correcties komen.
writeFileSync(`${UIT}.json`, JSON.stringify({ fixture: FIXTURE, runs: RUNS, metingen }, null, 2));

// Het leesbestand. Met namen tenzij --blind; dan wisselende volgorde en de sleutel
// onderaan.
const regels = BLIND
  ? [`# Blind lezen — ${FIXTURE}`, '',
     'De varianten staan per ronde in wisselende volgorde. De sleutel staat onderaan;',
     'lees eerst, kijk daarna.', '']
  : [`# Lezen — ${FIXTURE}`, ''];
const sleutel = [];

for (const [i, ronde] of rondes.entries()) {
  const specs = Object.keys(ronde);
  if (BLIND) specs.sort(() => Math.random() - 0.5);
  regels.push(`## Ronde ${i + 1}`, '');
  for (const [j, spec] of specs.entries()) {
    if (BLIND) sleutel.push(`ronde ${i + 1} — ${MERKEN[j]} = ${spec}`);
    regels.push(`### ${BLIND ? MERKEN[j] : spec}`, '');
    for (const issue of ronde[spec]) {
      regels.push(`- **${issue.onderwerp}** *(${issue.ernst}, ${(issue.dimensies ?? []).join('/')})*`);
      regels.push(`  ${issue.bevinding}`);
      if (issue.passage) regels.push(`  > ${issue.passage}`);
      regels.push(`  → ${issue.aanbeveling}`, '');
    }
  }
}
if (BLIND) regels.push('', '---', '', '## Sleutel', '', ...sleutel.map((s) => `- ${s}`));
writeFileSync(`${UIT}.md`, regels.join('\n'));

console.log(`\nweggeschreven: ${UIT}.json (ruwe tellingen) en ${UIT}.md (blind lezen)`);
