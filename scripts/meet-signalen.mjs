#!/usr/bin/env node
/**
 * scripts/meet-signalen.mjs — gerichte telling op één signaal, over meerdere runs
 *
 * Draaien:  node scripts/meet-signalen.mjs --runs=3
 *           node scripts/meet-signalen.mjs --runs=3 --host=http://localhost:3000
 *
 * KOST ECHTE API-AANROEPEN. Eén run over de meetfixture is ongeveer $0,90.
 *
 * ── WAAROM DIT BESTAAT ──────────────────────────────────────────────────────
 *
 * CLAUDE.md schrijft voor hoe je meet of een wijziging aan de analyse werkte: **één
 * gericht signaal, meerdere runs.** Niet de bevindingenlijst lezen — die verschilt tussen
 * twee identieke runs met 8 tot 10 bevindingen, dus daar is elk verschil te verklaren en
 * niets te bewijzen.
 *
 * Dit script doet precies dat, en niets meer. Het telt per run:
 *
 *   • of elk van de bekende fouten uit de fixture is gemeld
 *   • hoeveel bevindingen er per dimensie zijn
 *
 * ── DE TWEE VRAGEN WAARVOOR HET IS GEBOUWD ──────────────────────────────────
 *
 * 1. **Hoe betrouwbaar is het model op taalfouten?** Op 6 september 2026 miste een analyse
 *    `wordtgekregen` en `het identiteitsbewijzen`, terwijl eerdere analyses van dezelfde
 *    documenten die wél vonden. Het model kan het dus — het doet het niet elke keer. Zonder
 *    cijfer is niet te zeggen of dat 90% of 40% is, en dus ook niet of er iets moet veranderen.
 *
 * 2. **Waarom staat de dimensie `balans` op nul?** In de analyse van 6 september: 12
 *    volledigheid, 8 grammatica, 3 conflicten, 3 juridisch, 0 balans — terwijl er een issue
 *    tussen zat dat in zijn eigen tekst "eenzijdig" noemt. Twee kandidaten: de
 *    voorrangsregel (volledigheid wint vóór balans) of de opsplitsing over twee aanroepen.
 *
 * ── HOE JE DE UITKOMST LEEST ────────────────────────────────────────────────
 *
 * Een fout die in 3 van de 3 runs gevonden wordt is betrouwbaar. 0 van de 3 wijst op de
 * prompt of de consolidatie. Alles ertussenin is variatie, en dán is meer runs het enige
 * dat helpt — niet harder nadenken over één run.
 */

import { readFileSync } from 'node:fs';
import { leesEnv, haalToken } from '../tests/helpers/test-token.mjs';
import { anonimiseerTekst } from '../src/naam-anonimiseer.js';

leesEnv();

const arg = (naam, standaard) =>
  process.argv.find((a) => a.startsWith(`--${naam}=`))?.split('=')[1] ?? standaard;

const RUNS = Math.max(1, parseInt(arg('runs', '3'), 10) || 3);
const HOST = arg('host', 'https://app.clausula.nl');
const FIXTURE = arg('fixture', 'tests/golden/meting/twee-documenten.json');

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
console.log(`meetfixture : ${FIXTURE}`);
console.log(`documenten  : ${fixture.documenten.map((d) => `${d.type} (${d.tekst.length} tekens)`).join(', ')}`);
console.log(`runs        : ${RUNS}   host: ${HOST}`);
console.log(`geschat     : ~$${(RUNS * 0.9).toFixed(2)}\n`);

const TOKEN = await haalToken();

/** Eén analyse draaien en de issues per document teruggeven. */
async function draaiAnalyse() {
  // Dezelfde PII-bewerking als de browser doet, met genummerde placeholders per type.
  const gezien = new Map(); const teller = {};
  const piiPh = (type, waarde) => {
    const k = `${type}:${waarde}`;
    if (!gezien.has(k)) { teller[type] = teller[type] ?? 0; gezien.set(k, `[${type}_${teller[type]++}]`); }
    return gezien.get(k);
  };

  const res = await fetch(`${HOST}/api/analyseer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      classificatie: {
        doc_type: fixture._meta.doc_type,
        situatie_kenmerken: fixture._meta.situatie_kenmerken ?? [],
      },
      documenten: fixture.documenten.map((d) => ({
        bestandsnaam: d.bestandsnaam,
        type: d.type,
        tekst: anonimiseerTekst(d.tekst, new Map(), piiPh),
      })),
      runId: crypto.randomUUID(),
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);

  // SSE lezen; we bewaren per document de laatste consolidatie (of anders alles).
  const perDoc = new Map();
  const lezer = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await lezer.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const blokken = buf.split('\n\n');
    buf = blokken.pop();
    for (const blok of blokken) {
      const regel = blok.split('\n').find((r) => r.startsWith('data: '));
      if (!regel) continue;
      let ev; try { ev = JSON.parse(regel.slice(6)); } catch { continue; }
      if (!ev.bestandsnaam || !Array.isArray(ev.result?.issues)) continue;
      const lijst = perDoc.get(ev.bestandsnaam) ?? { losse: [], consolidatie: null };
      if (ev.type === 'consolidatie') lijst.consolidatie = ev.result.issues;
      else lijst.losse.push(...ev.result.issues);
      perDoc.set(ev.bestandsnaam, lijst);
    }
  }
  const uit = new Map();
  for (const [naam, l] of perDoc) uit.set(naam, l.consolidatie ?? l.losse);
  return uit;
}

// ── Draaien ──────────────────────────────────────────────────────────────────

const gevondenPerFout = new Map(fixture.bekende_fouten.map((f) => [f.sleutel, 0]));
const dimensieTellingen = [];
const totalen = [];
// Alleen geslaagde runs tellen mee. Stond hier tot 6 september 2026 niet, en toen viel
// er één run om: elk recall-getal werd door 3 gedeeld terwijl er 2 metingen waren, dus
// alles kwam te laag uit. Een meetfout die precies de kant op wijst waar je bang voor bent.
let geslaagd = 0;

for (let r = 1; r <= RUNS; r++) {
  process.stdout.write(`run ${r}/${RUNS} … `);
  const t0 = Date.now();
  let perDoc;
  try { perDoc = await draaiAnalyse(); }
  catch (e) { console.log(`FOUT: ${e.message} — deze run telt niet mee`); continue; }
  geslaagd++;

  const alle = [...perDoc.values()].flat();
  totalen.push(alle.length);
  const dims = {};
  for (const i of alle) for (const d of (i.dimensies ?? ['?'])) dims[d] = (dims[d] ?? 0) + 1;
  dimensieTellingen.push(dims);

  const tekstVan = (i) => `${i.onderwerp ?? ''} ${i.bevinding ?? ''} ${i.passage ?? ''} ${i.aanbeveling ?? ''}`.toLowerCase();
  const gevonden = [];
  for (const f of fixture.bekende_fouten) {
    const raak = alle.some((i) => f.zoek.some((z) => tekstVan(i).includes(z.toLowerCase())));
    if (raak) { gevondenPerFout.set(f.sleutel, gevondenPerFout.get(f.sleutel) + 1); gevonden.push(f.sleutel); }
  }
  console.log(`${alle.length} bevindingen, ${Math.round((Date.now() - t0) / 1000)}s — gevonden: ${gevonden.length}/${fixture.bekende_fouten.length}`);
}

// ── Uitkomst ─────────────────────────────────────────────────────────────────

if (geslaagd === 0) { console.log('\nGEEN geslaagde run — er valt niets te melden.'); process.exit(1); }
if (geslaagd < RUNS) {
  console.log(`\nLET OP: ${RUNS - geslaagd} van de ${RUNS} runs mislukte. Hieronder telt`);
  console.log('alleen wat werkelijk is gemeten — anders komt elk getal te laag uit.');
}
console.log(`\n── bekende fouten, gevonden in hoeveel van de ${geslaagd} geslaagde runs ──`);
for (const f of fixture.bekende_fouten) {
  const n = gevondenPerFout.get(f.sleutel);
  const merk = n === geslaagd ? '✓ altijd' : n === 0 ? '✖ nooit ' : '~ soms  ';
  console.log(`  ${merk} ${String(n)}/${geslaagd}  ${f.sleutel.padEnd(22)} (${f.soort})`);
}

console.log(`\n── dimensies per run ──`);
const alleDims = [...new Set(dimensieTellingen.flatMap((d) => Object.keys(d)))].sort();
console.log(`  ${'dimensie'.padEnd(14)} ${dimensieTellingen.map((_, i) => `run${i + 1}`.padStart(6)).join('')}`);
for (const d of alleDims) {
  console.log(`  ${d.padEnd(14)} ${dimensieTellingen.map((t) => String(t[d] ?? 0).padStart(6)).join('')}`);
}
console.log(`  ${'TOTAAL'.padEnd(14)} ${totalen.map((t) => String(t).padStart(6)).join('')}`);

console.log(`\nLees dit zo: 3/3 is betrouwbaar, 0/3 wijst op de prompt of de consolidatie,`);
console.log(`en alles ertussenin is variatie — daar helpt alleen méér runs tegen.`);
