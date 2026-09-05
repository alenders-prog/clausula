#!/usr/bin/env node
/**
 * scripts/opschonen.mjs — brondocumenten verwijderen waarvan de bewaartermijn om is
 *
 * Draaien:  npm run opschonen           toont alleen wat er zou verdwijnen
 *           npm run opschonen -- --ja   verwijdert het daadwerkelijk
 *
 * Vereist SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY in `.env`.
 *
 * ── WAAROM ──────────────────────────────────────────────────────────────────
 *
 * B3 uit `docs/architectuurbeoordeling.md`: er was geen enkel mechanisme dat een geüpload
 * document ooit verwijderde. Alles in dit systeem is afgeleid — rapport, classificatie,
 * feiten — behalve deze bestanden: beide uploadpaden sturen het bestand zoals de mediator
 * het koos. Dat is de bron, en daarmee het waardevolste doelwit. Op 5 september 2026 bleek
 * de bucket zonder inloggen bereikbaar te zijn geweest; wat er dan op straat ligt is
 * "alles wat er ooit is geüpload" in plaats van "wat er nu loopt".
 *
 * De termijn stond er al: `organisaties.retention_maanden`, sinds `001_multitenancy.sql`,
 * standaard 12 — en werd door niets gelezen. Dit script sluit hem aan. De regel zelf staat
 * getoetst in `src/avg/bewaartermijn.js`.
 *
 * ── WAT ER WEGGAAT ──────────────────────────────────────────────────────────
 *
 * Alleen het bestand in de bucket `documenten`. De screening, het rapport en de bevindingen
 * blijven staan. Wat daarna niet meer kan: het originele stuk inzien, downloaden, en
 * heranalyseren zonder opnieuw te uploaden.
 *
 * Op elke screening waarvan álle bronbestanden verdwijnen komt
 * `rapport._bronbestanden_verwijderd_op` te staan, zodat de app kan uitleggen wat er is
 * gebeurd in plaats van "Object not found" te tonen (`bronbestandMelding` in dezelfde
 * module).
 *
 * ── DROOGLOOP IS DE STANDAARD ───────────────────────────────────────────────
 *
 * Zonder `--ja` verwijdert dit script niets. Verwijderen is de enige stap in dit project
 * die niet terug te draaien is; er is geen backup van de bucket.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { isVerlopen, vervalMoment } from '../src/avg/bewaartermijn.js';

// ── .env inlezen (geen extra afhankelijkheid nodig) ──────────────────────────
try {
  for (const regel of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    if (!regel.includes('=') || regel.trim().startsWith('#')) continue;
    const i = regel.indexOf('=');
    const sleutel = regel.slice(0, i).trim();
    if (!process.env[sleutel]) process.env[sleutel] = regel.slice(i + 1).trim();
  }
} catch { /* geen .env — dan moeten de variabelen al in de omgeving staan */ }

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('✖ SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt (.env)');
  process.exit(1);
}

const BUCKET = 'documenten';
const ECHT = process.argv.includes('--ja');
const NU = new Date();

const db = createClient(url, key, { auth: { persistSession: false } });
const dag = t => String(t).slice(0, 10);
const mb = b => (b / 1048576).toFixed(1);

console.log(`Opschonen — bucket '${BUCKET}', peildatum ${dag(NU.toISOString())}`);
console.log(ECHT ? '*** --ja meegegeven: er wordt daadwerkelijk verwijderd ***\n'
                 : '(droogloop — geef --ja mee om echt te verwijderen)\n');

// ── De termijn per organisatie ───────────────────────────────────────────────

const { data: orgs, error: fOrg } = await db
  .from('organisaties').select('id, naam, retention_maanden');
if (fOrg) { console.error('✖ organisaties niet te lezen:', fOrg.message); process.exit(1); }

const termijn = new Map(orgs.map(o => [o.id, o.retention_maanden]));

// ── Wat er in de bucket staat ────────────────────────────────────────────────
//
// De indeling is {organisatie_id}/{tijdstempel}-{willekeurig}.pdf — één niveau diep,
// gemeten op 5 september 2026. De eerste map is dus de organisatie, en dat is ook waar de
// RLS-policies in 001_multitenancy.sql op filteren.

const { data: mappen, error: fMap } = await db.storage.from(BUCKET).list('', { limit: 1000 });
if (fMap) { console.error('✖ bucket niet te lezen:', fMap.message); process.exit(1); }

const teVerwijderen = [];   // { pad, orgId, geuploadOp, bytes }
let bekeken = 0;

for (const map of mappen.filter(m => !m.id)) {
  const orgId = map.name;
  const maanden = termijn.get(orgId);

  const { data: bestanden, error } = await db.storage.from(BUCKET).list(orgId, { limit: 1000 });
  if (error) { console.log(`  ! ${orgId}: niet te lezen — ${error.message}`); continue; }

  const echteBestanden = (bestanden ?? []).filter(b => b.id);
  bekeken += echteBestanden.length;

  if (maanden === undefined) {
    // Een map zonder organisatie in de tabel. Niet verwijderen: onbekend is geen reden om
    // weg te gooien, maar het is wel een bevinding — er staan bestanden van een kantoor
    // dat niet (meer) bestaat.
    console.log(`  ! ${orgId}: geen organisatie met dit id — ${echteBestanden.length} bestand(en) blijven staan`);
    continue;
  }

  const verlopen = echteBestanden.filter(b => isVerlopen(b.created_at, maanden, NU));
  const oudste = echteBestanden.map(b => b.created_at).sort()[0];

  console.log(`  ${orgId}  termijn ${maanden} mnd  ${echteBestanden.length} bestand(en)`
    + `  oudste ${oudste ? dag(oudste) : '—'}  verlopen: ${verlopen.length}`);

  for (const b of verlopen) {
    teVerwijderen.push({
      pad: `${orgId}/${b.name}`,
      orgId,
      geuploadOp: b.created_at,
      bytes: b.metadata?.size ?? 0,
    });
  }

  if (!verlopen.length && echteBestanden.length && oudste) {
    const verval = vervalMoment(oudste, maanden);
    if (verval) console.log(`       eerstvolgende vervalt ${dag(verval.toISOString())}`);
  }
}

console.log(`\n${bekeken} bestand(en) bekeken, ${teVerwijderen.length} verlopen`);

if (!teVerwijderen.length) {
  console.log('UITKOMST: niets te verwijderen');
  process.exit(0);
}

const totaal = teVerwijderen.reduce((s, b) => s + b.bytes, 0);
console.log(`Samen ${mb(totaal)} MB, geüpload tussen ${dag(teVerwijderen.map(b => b.geuploadOp).sort()[0])}`
  + ` en ${dag(teVerwijderen.map(b => b.geuploadOp).sort().pop())}`);

// ── Welke screenings raken hun bronbestand kwijt? ────────────────────────────
//
// De paden staan in `rapport._document_bestanden`. Die opzoeking gebeurt vóór het
// verwijderen: daarna is niet meer te achterhalen welke screening erbij hoorde.

const padenWeg = new Set(teVerwijderen.map(b => b.pad));

const { data: screenings, error: fScr } = await db
  .from('screeningen').select('id, rapport').limit(20000);
if (fScr) { console.error('✖ screeningen niet te lezen:', fScr.message); process.exit(1); }

const geraakt = [];
for (const s of screenings ?? []) {
  const paden = (s.rapport?._document_bestanden ?? []).map(b => b?.pad).filter(Boolean);
  if (!paden.length) continue;
  const weg = paden.filter(p => padenWeg.has(p));
  if (weg.length) geraakt.push({ id: s.id, van: paden.length, weg: weg.length, rapport: s.rapport });
}

console.log(`\n${geraakt.length} screening(s) raken een bronbestand kwijt:`);
for (const g of geraakt.slice(0, 10)) {
  console.log(`  ${g.id}  ${g.weg} van ${g.van} bestand(en)`);
}
if (geraakt.length > 10) console.log(`  … en nog ${geraakt.length - 10}`);

const wees = teVerwijderen.length - geraakt.reduce((s, g) => s + g.weg, 0);
if (wees > 0) console.log(`  ${wees} verlopen bestand(en) horen bij geen enkele screening`);

if (!ECHT) {
  console.log('\nUITKOMST: droogloop — er is niets verwijderd. Geef --ja mee om door te zetten.');
  process.exit(0);
}

// ── Verwijderen ──────────────────────────────────────────────────────────────

console.log('\nVerwijderen…');
const paden = [...padenWeg];
let verwijderd = 0;

for (let i = 0; i < paden.length; i += 100) {
  const groep = paden.slice(i, i + 100);
  const { error } = await db.storage.from(BUCKET).remove(groep);
  if (error) { console.error(`  ✖ groep ${i / 100 + 1}: ${error.message}`); continue; }
  verwijderd += groep.length;
  console.log(`  ${verwijderd}/${paden.length}`);
}

// Op de screenings vastleggen dát het is gebeurd, zodat de app het kan uitleggen.
const stempel = NU.toISOString();
let gestempeld = 0;
for (const g of geraakt) {
  if (g.weg < g.van) continue;   // nog niet álle bestanden weg: dan verandert er niets aan de uitleg
  const nieuw = { ...g.rapport, _bronbestanden_verwijderd_op: stempel };
  const { error } = await db.from('screeningen').update({ rapport: nieuw }).eq('id', g.id);
  if (error) console.error(`  ✖ stempel op ${g.id}: ${error.message}`);
  else gestempeld++;
}

console.log(`\nUITKOMST: ${verwijderd} bestand(en) verwijderd, ${gestempeld} screening(s) gemarkeerd`);
process.exitCode = verwijderd === paden.length ? 0 : 1;
