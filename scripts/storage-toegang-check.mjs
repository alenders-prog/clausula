#!/usr/bin/env node
/**
 * scripts/storage-toegang-check.mjs
 *
 * Toetst van búiten of de documenten-bucket dicht zit voor een anonieme bezoeker.
 *
 * ── WAAROM DIT BESTAAT ──────────────────────────────────────────────────────
 *
 * Op 5 september 2026 bleek de bucket open te staan: met alleen de publieke sleutel uit
 * `config.js` — die aan elke bezoeker van app.clausula.nl wordt geserveerd — kon iemand
 * zonder in te loggen de dossiermappen opsommen, de bestanden erin opsommen, en een
 * cliëntdocument downloaden (HTTP 200, 107 kB). Er stond ook een INSERT-policy voor anon,
 * dus anoniem plaatsen kon eveneens.
 *
 * De oorzaak was niet code en niet een migratie: er waren drie policies aangeklikt in het
 * Supabase-dashboard (`allow anon download/signed url/upload`, met de naamsuffix die de
 * policywizard genereert). **Een dashboardwijziging laat geen bestand achter.** Geen
 * enkele test, hook of review in deze repo kon er dus iets van zien — precies de reden dat
 * het maanden kon blijven staan.
 *
 * Daarom deze probe. Hij leest geen migratie en gelooft geen beleid; hij doet wat een
 * willekeurige bezoeker doet en kijkt wat er terugkomt. Beleid lezen zegt wat er hóórt te
 * gebeuren, dit zegt wat er gebeurt.
 *
 * ── WAT HIJ WEL EN NIET DOET ────────────────────────────────────────────────
 *
 * Hij haalt géén documentinhoud op: bij de downloadprobe wordt de body direct afgebroken
 * en alleen de statuscode gelezen. En hij schrijft niets — de INSERT-policy wordt niet
 * getest, want iets in een productiebucket plaatsen om een gat aan te tonen is geen
 * redelijke prijs. Die kant blijft handwerk: kijk in het dashboard of er een INSERT-policy
 * op anon staat.
 *
 * Gebruikt uitsluitend de publieke sleutel uit `config.js`. Geen geheimen, dus veilig in
 * CI en zonder `.env`.
 *
 * Exitcode 0 = dicht. Exitcode 1 = er kwam iets door, en dan staat er in de uitvoer wat.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const wortel = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = fs.readFileSync(path.join(wortel, 'config.js'), 'utf8');

const url = config.match(/SUPABASE_URL\s*=\s*'([^']+)'/)?.[1];
const key = config.match(/SUPABASE_KEY\s*=\s*'([^']+)'/)?.[1];
if (!url || !key) {
  console.error('✖ SUPABASE_URL of SUPABASE_KEY niet gevonden in config.js');
  process.exit(1);
}

const BUCKET = 'documenten';
const kop = { apikey: key, 'Content-Type': 'application/json' };

/** Statuscode ophalen zonder de body te lezen. */
async function status(pad, opties = {}) {
  try {
    const res = await fetch(`${url}${pad}`, { ...opties, headers: { ...kop, ...opties.headers } });
    // Body nooit inlezen: bij een lek zou dat cliëntdata in de logs zetten.
    try { await res.body?.cancel(); } catch { /* al gesloten */ }
    return res.status;
  } catch (e) {
    return `netwerkfout: ${e.message}`;
  }
}

/** Namen ophalen is wél nodig om een downloadpad te kunnen vormen. */
async function lijst(prefix) {
  const res = await fetch(`${url}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST', headers: kop, body: JSON.stringify({ prefix, limit: 1 }),
  });
  if (!res.ok) return { code: res.status, namen: [] };
  const j = await res.json().catch(() => []);
  return { code: res.status, namen: Array.isArray(j) ? j.map((x) => x.name).filter(Boolean) : [] };
}

const bevindingen = [];
const meld = (naam, code, dicht) => {
  console.log(`  ${dicht ? '✓' : '✖'} ${String(code).padEnd(4)}  ${naam}`);
  if (!dicht) bevindingen.push(`${naam} → HTTP ${code}`);
};

console.log(`Anonieme toegang tot bucket '${BUCKET}' op ${url}`);
console.log('(alleen de publieke sleutel uit config.js, niet ingelogd)\n');

const wortelLijst = await lijst('');
meld('mappen opsommen', wortelLijst.code, wortelLijst.code !== 200);

let pad = null;
if (wortelLijst.namen.length) {
  const binnen = await lijst(wortelLijst.namen[0]);
  meld('bestanden in een map opsommen', binnen.code, binnen.code !== 200);
  if (binnen.namen.length) pad = `${wortelLijst.namen[0]}/${binnen.namen[0]}`;
}

if (pad) {
  const dl = await status(`/storage/v1/object/${BUCKET}/${pad}`);
  meld('document downloaden', dl, dl !== 200);

  const sign = await status(`/storage/v1/object/sign/${BUCKET}/${pad}`, {
    method: 'POST', body: JSON.stringify({ expiresIn: 60 }),
  });
  meld('ondertekende URL aanvragen', sign, sign !== 200);
} else {
  // Geen pad betekent dat het opsommen al werd geweigerd — dan is er niets te downloaden
  // en zijn de twee regels hierboven al de uitkomst.
  console.log('  ·  geen pad om download te toetsen (het opsommen gaf al niets prijs)');
}

console.log('');
if (bevindingen.length) {
  console.error('UITKOMST: de bucket is bereikbaar zonder in te loggen');
  for (const b of bevindingen) console.error(`  - ${b}`);
  console.error('\nZie supabase/2026-09-05-storage-anon-dicht.sql. Let op: de INSERT-policy');
  console.error('wordt hier niet getoetst — kijk in het dashboard of er een op anon staat.');
  process.exit(1);
}
console.log('UITKOMST: dicht — geen anonieme toegang tot de bucket');
process.exit(0);
