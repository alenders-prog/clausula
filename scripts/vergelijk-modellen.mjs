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
 * 2. Een blind leesbestand. Per ronde de uitvoer van elke deelnemer als "A", "B", … in
 *    wisselende volgorde en zonder modelnaam, met de sleutel onderaan. Want de telling
 *    ziet niet of een bevinding ergens op slaat, en wie de namen ziet beoordeelt het merk.
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
import { maakDeelnemer, bouwVerzoek, leesAntwoord, bouwHeaders } from '../src/vergelijking/leverancier.js';
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

const DEELNEMERS = SPECS.map(maakDeelnemer);
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
console.log(`runs        : ${RUNS}\n`);

for (const d of DEELNEMERS) {
  if (!prijsBekend(d.model)) console.warn(`LET OP: geen prijs bekend voor ${d.model} — kosten blijven leeg.`);
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
      const { telling } = controleerUitvoer({ issues }, { documentTekst: gezienTekst });
      const usd = kosten(d.model, a);

      metingen.push({
        run: r, spec: d.spec, model: d.model, diepte: d.diepte,
        ms: a.ms, vers: a.vers, cacheSchrijf: a.cacheSchrijf, cacheLees: a.cacheLees, uit: a.uit,
        usd, verdeling: verdeling(d.model, a),
        aantalIssues: issues.length, afgekapt: a.afgekapt, defecten: telling, fout: null,
      });
      ronde[d.spec] = issues;
      console.log(`${String(issues.length).padStart(3)} bevindingen  ${String(Math.round(a.ms / 1000)).padStart(3)}s  `
        + `${usd === null ? 'prijs onbekend' : '$' + usd.toFixed(4)}`
        + `${a.afgekapt ? '  AFGEKAPT' : ''}  defecten: ${telling.totaal}`);
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

console.log(`\n  Kosten mag je na één ronde opschrijven; het aantal bevindingen niet —`);
console.log(`  twee identieke runs schelen hier 8 tot 10. Zie docs/modelvergelijking.md.`);

// Ruwe tellingen wegschrijven. Zonder dit kost elke correctie achteraf een nieuwe draai,
// en die correcties komen.
writeFileSync(`${UIT}.json`, JSON.stringify({ fixture: FIXTURE, runs: RUNS, metingen }, null, 2));

// Het blinde leesbestand: wisselende volgorde per ronde, sleutel onderaan.
const regels = [`# Blind lezen — ${FIXTURE}`, '',
  'De varianten staan per ronde in wisselende volgorde. De sleutel staat onderaan;',
  'lees eerst, kijk daarna.', ''];
const sleutel = [];
for (const [i, ronde] of rondes.entries()) {
  const specs = Object.keys(ronde).sort(() => Math.random() - 0.5);
  regels.push(`## Ronde ${i + 1}`, '');
  for (const [j, spec] of specs.entries()) {
    sleutel.push(`ronde ${i + 1} — ${MERKEN[j]} = ${spec}`);
    regels.push(`### ${MERKEN[j]}`, '');
    for (const issue of ronde[spec]) {
      regels.push(`- **${issue.onderwerp}** *(${issue.ernst}, ${(issue.dimensies ?? []).join('/')})*`);
      regels.push(`  ${issue.bevinding}`);
      if (issue.passage) regels.push(`  > ${issue.passage}`);
      regels.push(`  → ${issue.aanbeveling}`, '');
    }
  }
}
regels.push('', '---', '', '## Sleutel', '', ...sleutel.map((s) => `- ${s}`));
writeFileSync(`${UIT}.md`, regels.join('\n'));

console.log(`\nweggeschreven: ${UIT}.json (ruwe tellingen) en ${UIT}.md (blind lezen)`);
