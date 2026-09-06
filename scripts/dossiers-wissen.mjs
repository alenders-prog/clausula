#!/usr/bin/env node
/**
 * scripts/dossiers-wissen.mjs — alle dossiers, screenings en documenten verwijderen
 *
 * Draaien:  node scripts/dossiers-wissen.mjs          toont wat er weg zou gaan
 *           node scripts/dossiers-wissen.mjs --ja     verwijdert het daadwerkelijk
 *
 * ── WAAROM DIT BESTAAT ──────────────────────────────────────────────────────
 *
 * Op 6 september 2026 bleek dat de opslag nooit had gepseudonimiseerd: `index.html` las
 * `namen_map` uit een antwoord dat `blob` heet, dus élke screening ging onbewerkt de
 * database in — rapport, classificatie, bestandsnaam en de volledige documenttekst.
 * Vier rijen, van 19 augustus tot die dag.
 *
 * De reparatie geldt alleen voor nieuwe analyses. De bestaande rijen alsnog
 * pseudonimiseren kan niet netjes: de namenkaart van toen bestaat niet meer, dus je zou
 * moeten raden welke woorden namen waren. Bij testdata is weggooien dan beter dan
 * halverwege schoonmaken — dan blijft er geen twijfel over wat er nog in staat.
 *
 * ── VOLGORDE ────────────────────────────────────────────────────────────────
 *
 * Eerst de bestanden in Storage, dán de rijen. Andersom zijn de paden weg — die staan in
 * `rapport._document_bestanden` — en blijven er verweesde PDF's met persoonsgegevens
 * achter. Dat is hier eerder gebeurd: 336 stuks, augustus 2026.
 *
 * ── WAT BLIJFT STAAN, EN WAAROM DAT NIET VANZELF SPREEKT ────────────────────
 *
 * `api_verbruik`: tokens, kosten en duur per Claude-aanroep. Geen documentinhoud, en het
 * is de meetgeschiedenis waarop de tijd- en kostenbesluiten rusten. Gevolg: `npm run
 * check:data` meldt daarna verbruik zonder bewaarde screenings, tot er weer analyses
 * bewaard zijn. Dat is juist gedrag van die controle, geen nieuwe fout.
 *
 * `analyse_feiten`: **niet aanraken.** Die tabel bestaat er juist om verwijdering te
 * ÓVERLEVEN — zie de eerste regel van `supabase/2026-08-28-analyse-feiten.sql`:
 * "tellingen die blijven staan als het dossier verdwijnt". Geen cascade, en bewust geen
 * inhoud: geen namen, geen titels, geen bestandsnamen, alleen tellingen. Er is dus ook
 * geen AVG-reden om hem te wissen.
 *
 * Bij de eerste uitvoering op 6 september 2026 stond hij hier wél in, en zijn vier regels
 * historie verloren gegaan. Terughalen kon niet: `feiten-sync.mjs` vult aan vanuit
 * bestaande screenings, en die waren op dat moment ook weg. Vandaar deze regel, en de
 * controle hieronder die het tegenhoudt.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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
if (!url || !key) { console.error('✖ SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt'); process.exit(1); }

const ECHT = process.argv.includes('--ja');
const db = createClient(url, key, { auth: { persistSession: false } });

console.log(ECHT ? '*** --ja meegegeven: er wordt daadwerkelijk verwijderd ***\n'
                 : 'Droogloop — er wordt niets verwijderd. Geef --ja mee om door te zetten.\n');

// ── 1. Wat staat er ──────────────────────────────────────────────────────────

const { data: screenings } = await db.from('screeningen').select('id, bestandsnaam, rapport, namen_map, created_at');
const { data: dossiers }   = await db.from('dossiers').select('id, naam');
const { data: feiten }     = await db.from('analyse_feiten').select('id');
if ((feiten?.length ?? 0) === 0) {
  console.log('LET OP: analyse_feiten is leeg. Die tabel hoort verwijdering te overleven —');
  console.log('        staat hij op nul terwijl er analyses zijn gedraaid, dan is er eerder');
  console.log('        iets misgegaan. Zie scripts/feiten-sync.mjs.\n');
}

console.log(`screeningen    ${screenings?.length ?? 0}`);
for (const s of screenings ?? []) {
  const bulk = s.rapport && '_teksten_per_pad' in s.rapport;
  console.log(`   ${String(s.created_at).slice(0, 10)}  ${s.id}  namen_map: ${s.namen_map ? 'ja' : 'NEE'}${bulk ? '  documenttekst: JA' : ''}`);
}
console.log(`dossiers       ${dossiers?.length ?? 0}`);
console.log(`analyse_feiten ${feiten?.length ?? 0}  (BLIJFT STAAN — historie)`);

// De paden uit de rapporten halen vóór het verwijderen — daarna zijn ze weg.
const paden = new Set();
for (const s of screenings ?? []) {
  for (const b of s.rapport?._document_bestanden ?? []) if (b?.pad) paden.add(b.pad);
}
// En alles wat er verder in de bucket staat, want een pad kan ontbreken.
const { data: mappen } = await db.storage.from('documenten').list('', { limit: 100 });
for (const m of (mappen ?? []).filter((x) => !x.id)) {
  const { data: b } = await db.storage.from('documenten').list(m.name, { limit: 1000 });
  for (const f of (b ?? []).filter((x) => x.id)) paden.add(`${m.name}/${f.name}`);
}
console.log(`Storage        ${paden.size} bestand(en)`);
console.log(`   (${[...paden].filter((p) => !p.includes('/')).length} zonder map, ${[...paden].filter((p) => p.includes('/')).length} in een organisatiemap)`);

console.log('\napi_verbruik blijft staan — geen documentinhoud, wél de meetgeschiedenis.');

if (!ECHT) {
  console.log('\nUITKOMST: droogloop, er is niets verwijderd.');
  process.exit(0);
}

// ── 2. Verwijderen, bestanden eerst ──────────────────────────────────────────

console.log('\nVerwijderen…');
const lijst = [...paden];
let weg = 0;
for (let i = 0; i < lijst.length; i += 100) {
  const groep = lijst.slice(i, i + 100);
  const { error } = await db.storage.from('documenten').remove(groep);
  if (error) console.error(`  ✖ storage: ${error.message}`);
  else { weg += groep.length; console.log(`  storage ${weg}/${lijst.length}`); }
}

// analyse_feiten staat hier bewust NIET tussen — zie de kop van dit bestand.
for (const [tabel, veld] of [['screeningen', 'id'], ['dossiers', 'id']]) {
  const { error, count } = await db.from(tabel).delete({ count: 'exact' }).not(veld, 'is', null);
  if (error) console.error(`  ✖ ${tabel}: ${error.message}`);
  else console.log(`  ${tabel}: ${count} rij(en) verwijderd`);
}

// ── 3. Nameten ───────────────────────────────────────────────────────────────

console.log('\nControle:');
for (const t of ['screeningen', 'dossiers', 'analyse_feiten']) {
  const { count } = await db.from(t).select('*', { count: 'exact', head: true });
  console.log(`  ${t.padEnd(16)} ${count} rij(en)`);
}
const { data: na } = await db.storage.from('documenten').list('', { limit: 100 });
let over = 0;
for (const m of (na ?? []).filter((x) => !x.id)) {
  const { data: b } = await db.storage.from('documenten').list(m.name, { limit: 1000 });
  over += (b ?? []).filter((x) => x.id).length;
}
console.log(`  ${'Storage'.padEnd(16)} ${over} bestand(en)`);
console.log(over === 0 ? '\nUITKOMST: alles verwijderd' : '\nUITKOMST: er staan nog bestanden — kijk na waarom');
process.exitCode = over === 0 ? 0 : 1;
