#!/usr/bin/env node
/**
 * scripts/feiten-sync.mjs — analyse_feiten vullen en narekenen
 *
 * Drie taken in één script, omdat het driemaal dezelfde vergelijking is:
 *
 *   node scripts/feiten-sync.mjs              vult ontbrekende en verouderde regels
 *   node scripts/feiten-sync.mjs --controle   rekent alleen na, schrijft niets
 *   node scripts/feiten-sync.mjs --alles      schrijft élke regel opnieuw
 *
 * WAAROM DIT BESTAAT. De feitregel wordt normaal door de browser weggeschreven bij het
 * opslaan van een analyse. Valt dat weg — netwerk eruit halverwege, tabblad gesloten —
 * dan is de screening bewaard en de feitregel niet. Dit script vult dat gat, en is
 * tegelijk de backfill voor alles wat er vóór de invoering al stond.
 *
 * De controlemodus is de belangrijkste. Loopt het telwerk in de browser ooit uiteen met
 * wat er in de tabel staat, dan is dat aan niets te zien: de cijfers blijven plausibel.
 * Draai `--controle` periodiek, en bij elke wijziging aan src/dashboard/feiten.js.
 *
 * LET OP: dit script kan feitregels bijwerken die horen bij inmiddels VERWIJDERDE
 * screeningen — het laat die met rust. Regels waarvan de screening weg is, zijn precies
 * de historie waar de tabel voor bestaat; die mogen nooit worden opgeruimd.
 */
import { readFileSync } from 'node:fs';
import { bouwFeitRegel, keurFeitRegel } from '../src/dashboard/feiten.js';

const modus = process.argv.includes('--controle') ? 'controle'
            : process.argv.includes('--alles')    ? 'alles' : 'aanvullen';

// ── .env lezen ──────────────────────────────────────────────────────────────
function leesEnv() {
  try {
    return Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/)
      .filter(r => r.includes('=') && !r.trim().startsWith('#'))
      .map(r => [r.slice(0, r.indexOf('=')).trim(),
                 r.slice(r.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
  } catch { return {}; }
}
const env = { ...leesEnv(), ...process.env };
const URL = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error('SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY moeten in .env staan.');
  process.exitCode = 1;
}

const kop = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function haal(pad) {
  const r = await fetch(`${URL}/rest/v1/${pad}`, { headers: kop });
  if (!r.ok) throw new Error(`GET ${pad}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function upsert(rijen) {
  const r = await fetch(`${URL}/rest/v1/analyse_feiten?on_conflict=screening_id`, {
    method: 'POST',
    headers: { ...kop, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rijen),
  });
  if (!r.ok) throw new Error(`upsert: ${r.status} ${await r.text()}`);
}

/** Bewaartermijn voor de gebruikersverwijzing. Zie docs/avg-verwerkersovereenkomst.md. */
const MAANDEN = 18;
const grensDatum = () => new Date(Date.now() - MAANDEN * 30.44 * 864e5);

/** Velden die het script vergelijkt. bijgewerkt_op hoort er niet bij: die verandert altijd. */
const VERGELIJK = [
  'issues_totaal', 'hoog', 'midden', 'laag', 'afgevinkt', 'genegeerd',
  'mfn_totaal', 'mfn_aanwezig', 'mfn_onvolledig', 'mfn_ontbreekt', 'mfn_extra',
  'score', 'doc_type', 'versie_nr',
];

/**
 * Vergelijkt per_categorie op WAARDE, niet op tekst.
 *
 * Postgres bewaart jsonb-sleutels in een eigen volgorde (op lengte, dan alfabetisch),
 * dus wat eruit komt is niet de reeks die erin ging. Een `JSON.stringify`-vergelijking
 * meldde daardoor drift op regels die net waren weggeschreven — een controle die altijd
 * afgaat, en die leer je negeren.
 */
function categorieVerschillen(a = {}, b = {}) {
  const uit = [];
  for (const cat of new Set([...Object.keys(a), ...Object.keys(b)])) {
    for (const e of ['h', 'm', 'l']) {
      const x = a[cat]?.[e] ?? 0, y = b[cat]?.[e] ?? 0;
      if (x !== y) uit.push(`per_categorie.${cat}.${e}: tabel ${y} ≠ berekend ${x}`);
    }
  }
  return uit;
}

function verschillen(berekend, opgeslagen) {
  const uit = [];
  for (const veld of VERGELIJK) {
    const a = berekend[veld] ?? null, b = opgeslagen[veld] ?? null;
    if (a !== b) uit.push(`${veld}: tabel ${b} ≠ berekend ${a}`);
  }
  return uit.concat(categorieVerschillen(berekend.per_categorie, opgeslagen.per_categorie));
}

async function main() {
  if (!URL || !KEY) return;

  console.log(`modus: ${modus}\n`);

  const screeningen = await haal(
    'screeningen?select=id,dossier_id,versie_nr,rapport,classificatie,created_at,gebruiker_id'
    + ',dossiers!dossier_id(organisatie_id)&order=created_at.asc');
  const bestaand = new Map(
    (await haal('analyse_feiten?select='
      + ['screening_id', 'gebruiker_id', ...VERGELIJK, 'per_categorie'].join(',')))
      .map(r => [r.screening_id, r]));

  console.log(`${screeningen.length} screeningen, ${bestaand.size} feitregels\n`);

  const teSchrijven = [];
  let gelijk = 0, nieuw = 0;
  const afwijkend = [];
  const onzuiver = [];

  for (const s of screeningen) {
    const regel = bouwFeitRegel(s, { organisatie_id: s.dossiers?.organisatie_id });
    if (!regel) continue;

    // Vangnet: nooit inhoud in deze tabel. Zie docs/avg-verwerkersovereenkomst.md.
    const bezwaren = keurFeitRegel(regel);
    if (bezwaren.length) { onzuiver.push(`${s.id}: ${bezwaren.join('; ')}`); continue; }

    // ── De bewaartermijn mag nooit door onderhoud worden teruggedraaid ──────
    // `bouwFeitRegel` haalt gebruiker_id uit de screening, en die blijft bestaan als de
    // feitregel al is geanonimiseerd. Zonder deze twee regels zet dit script de
    // gebruikersverwijzing er weer op — de AVG-belofte ongedaan gemaakt door een
    // opruimscript, zonder dat iemand het ziet.
    //
    //   bestaande regel : gebruiker_id nooit aanraken, wat er ook staat
    //   nieuwe regel    : meteen de termijn toepassen
    const oud = bestaand.get(s.id);
    if (oud) {
      regel.gebruiker_id = oud.gebruiker_id ?? null;
    } else if (new Date(regel.geanalyseerd_op) < grensDatum()) {
      regel.gebruiker_id = null;
    }

    if (!oud) { nieuw++; teSchrijven.push(regel); continue; }

    const diff = verschillen(regel, oud);
    if (diff.length) { afwijkend.push({ id: s.id, diff }); teSchrijven.push(regel); }
    else { gelijk++; if (modus === 'alles') teSchrijven.push(regel); }
  }

  console.log(`gelijk      : ${gelijk}`);
  console.log(`ontbrekend  : ${nieuw}`);
  console.log(`afwijkend   : ${afwijkend.length}`);
  if (onzuiver.length) console.log(`GEWEIGERD   : ${onzuiver.length} (inhoud in de feitregel)`);

  for (const a of afwijkend.slice(0, 10)) {
    console.log(`\n  ${a.id}`);
    for (const d of a.diff) console.log(`    ${d}`);
  }
  if (afwijkend.length > 10) console.log(`\n  … en nog ${afwijkend.length - 10}`);
  for (const o of onzuiver) console.log(`\n  ⚠ ${o}`);

  // ── Bewaartermijn ─────────────────────────────────────────────────────────
  // De opruimfunctie `anonimiseer_oude_feiten()` moet periodiek draaien, maar er is
  // nog geen planner. Op de dag dat dit bestand geschreven werd was de oudste regel
  // twee weken oud, dus het speelt pas over anderhalf jaar — en dan weet niemand het
  // meer. Vandaar dat de controle het zélf meldt zodra het gaat tellen, in plaats van
  // dat het van een aantekening afhangt.
  const grens = grensDatum();
  const teOud = (await haal(
    `analyse_feiten?select=id&gebruiker_id=not.is.null&geanalyseerd_op=lt.${grens.toISOString()}`)).length;
  if (teOud) {
    console.log(`\n⚠ ${teOud} regel(s) zijn ouder dan ${MAANDEN} maanden en dragen nog een`);
    console.log('  gebruikersverwijzing. Draai in Supabase:  select anonimiseer_oude_feiten();');
    console.log('  en plan dat periodiek in — zie docs/avg-verwerkersovereenkomst.md.');
  }

  if (modus === 'controle') {
    const stuk = afwijkend.length + onzuiver.length + (teOud ? 1 : 0);
    console.log(stuk
      ? `\nUITKOMST: ${stuk} regel(s) kloppen niet. Draai zonder --controle om bij te werken.`
      : `\nUITKOMST: alles klopt.`);
    // Exitcode zodat dit ook in CI als poort te gebruiken is — dezelfde afspraak als
    // kennisbank-check.mjs, dat hier eerder op stukliep.
    process.exitCode = stuk ? 1 : 0;
    return;
  }

  if (!teSchrijven.length) { console.log('\nNiets te schrijven.'); return; }

  // In blokken: PostgREST slikt geen onbeperkt grote body.
  for (let i = 0; i < teSchrijven.length; i += 200) {
    await upsert(teSchrijven.slice(i, i + 200));
    console.log(`  geschreven ${Math.min(i + 200, teSchrijven.length)}/${teSchrijven.length}`);
  }
  console.log(`\nUITKOMST: ${teSchrijven.length} regel(s) bijgewerkt.`);
}

main().catch(e => { console.error(e.message); process.exitCode = 1; });
