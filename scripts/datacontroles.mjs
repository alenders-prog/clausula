#!/usr/bin/env node
/**
 * scripts/datacontroles.mjs — controles op gedrag, niet op fouten
 *
 * Draaien:  npm run check:data            de laatste 30 dagen
 *           npm run check:data -- --dagen=90
 *
 * Vereist SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY in `.env`.
 *
 * ── WAAROM DIT BESTAAT ──────────────────────────────────────────────────────
 *
 * De duurste storing tot nu toe duurde elf dagen: er werd geen enkele analyse bewaard. Er
 * kwam geen uitzondering, geen 500, geen rode melding. Het signaal lag uitsluitend in de
 * gegevens — `api_verbruik` had rijen, `screeningen` niet. Foutmonitoring had dat niet
 * gevonden, want er ging niets stuk; er gebeurde iets niet.
 *
 * Vandaar controles op wat er in de tabellen hoort te staan. Ze zeggen niets over of de
 * bevindingen inhoudelijk kloppen — dat is een andere vraag, en de moeilijkste (zie B5 in
 * `docs/architectuurbeoordeling.md`).
 *
 * ── WAT ER NIET IN DE UITVOER KOMT ──────────────────────────────────────────
 *
 * Geen bestandsnamen, geen rapportinhoud, geen namen, geen e-mailadressen. Wel id's, datums
 * en — bij een account zonder profiel — het e-maildomein, omdat juist dáár de bevinding aan
 * te zien is (een vertypt domein). Zie ook `src/avg/logref.js`.
 *
 * ── DE TWEE VALKUILEN DIE DE EERSTE VERSIE HAD ──────────────────────────────
 *
 * 1. `api_verbruik.screening_id` is géén screening-id. Sinds commit 088a53f maakt de
 *    browser die sleutel vooraf aan als **runId**, omdat de analyse begint voordat de
 *    screening bestaat. Bij een héranalyse wordt een bestaande screening bijgewerkt en
 *    verschilt de runId dus van het id; hij staat dan in `rapport._analyse_run_id`. Een
 *    controle die alleen op `screeningen.id` koppelt, meldt daarom elke heranalyse als
 *    verloren. Gemeten: van 12 runIds koppelden er 2 op id, en die twee kwamen beide uit
 *    `_analyse_run_id`.
 *
 * 2. Een analyse die niet wordt bewaard is niet altijd een storing. `npm run test:eval`
 *    draait echte analyses en slaat nooit iets op, en ook in de browser is "kijken en
 *    afsluiten" gewoon gedrag. De gegevens kunnen "wilde niet bewaren" niet onderscheiden
 *    van "bewaren mislukte". Daarom is de telling in controle 1 een notitie en geen
 *    bevinding; het signaal zit in het dagpatroon — de storing die elf dagen duurde was
 *    elf *aaneengesloten* dagen, en dát is wat er wordt getoetst.
 *
 *    Gemeten op 5 september 2026: alle twaalf runs met een runId kwamen van de gebruiker
 *    mét profiel; de 246 evalregels dragen géén runId en vallen dus buiten controle 1. De
 *    scheiding op profiel staat er wel in, omdat een eval die straks wél een runId
 *    meestuurt anders stilletjes als verloren analyse zou meetellen.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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

const dagenArg = process.argv.find(a => a.startsWith('--dagen='));
const DAGEN = dagenArg ? Math.max(1, parseInt(dagenArg.split('=')[1], 10) || 30) : 30;
const VANAF = new Date(Date.now() - DAGEN * 864e5).toISOString();

// Een screening die net is aangemaakt heeft nog geen rapport. Alleen rijen die ouder zijn
// dan dit venster tellen mee, anders meldt de controle een analyse die nog loopt.
const RIJPTIJD_MS = 60 * 60 * 1000;

const db = createClient(url, key, { auth: { persistSession: false } });
const dag = t => String(t).slice(0, 10);

const bevindingen = [];
const meld  = (regel) => { bevindingen.push(regel); console.log(`  ✖ ${regel}`); };
const goed  = (regel) => console.log(`  ✓ ${regel}`);
const notitie = (regel) => console.log(`  · ${regel}`);

console.log(`Datacontroles — laatste ${DAGEN} dagen (vanaf ${dag(VANAF)})\n`);

// ── Gegevens ophalen ─────────────────────────────────────────────────────────

const [{ data: verbruik, error: fV }, { data: screenings, error: fS }, { data: profielen, error: fP }] =
  await Promise.all([
    db.from('api_verbruik')
      .select('id, screening_id, organisatie_id, gebruiker_id, endpoint, fase, gestart_op')
      .gte('gestart_op', VANAF).limit(20000),
    db.from('screeningen').select('id, created_at, rapport').gte('created_at', VANAF).limit(20000),
    db.from('gebruikersprofiel').select('id, organisatie_id').limit(5000),
  ]);

if (fV || fS || fP) {
  console.error('✖ niet te lezen:', (fV ?? fS ?? fP).message);
  process.exit(1);
}

const metProfiel = new Set(profielen.map(p => p.id));

// ── 1. Analyses gemeten maar niet bewaard ────────────────────────────────────

console.log('1. Analyses gemeten maar niet bewaard');

// Elke sleutel waaronder een bewaarde screening te vinden is: haar eigen id én de runId
// waaronder ze is doorgerekend. Zie valkuil 1 bovenaan.
const bewaardeSleutels = new Set(screenings.flatMap(s => [s.id, s.rapport?._analyse_run_id].filter(Boolean)));

const analyses = verbruik.filter(v => v.endpoint === 'analyseer' && v.screening_id);
const runs = new Map();   // runId → gebruiker_id
for (const v of analyses) if (!runs.has(v.screening_id)) runs.set(v.screening_id, v.gebruiker_id);

const wees = [...runs].filter(([runId]) => !bewaardeSleutels.has(runId));
const weesEcht = wees.filter(([, gebruiker]) => metProfiel.has(gebruiker));
const weesEval = wees.length - weesEcht.length;

// Bewust géén bevinding, alleen een telling. Een analyse die niet wordt opgeslagen is
// normaal gedrag: de mediator kijkt en sluit af. De gegevens kunnen "wilde niet bewaren"
// niet onderscheiden van "bewaren mislukte", en een poort die op dat verschil rood staat
// leer je negeren. Het signaal zit in het patroon hieronder, niet in de telling.
if (weesEcht.length) {
  notitie(`${weesEcht.length} van ${runs.size - weesEval} analyse(s) van een gebruiker met profiel is niet bewaard`);
  notitie('  (op zichzelf normaal — kijk naar het dagpatroon hieronder)');
} else {
  goed(`elke analyse van een gebruiker met profiel is bewaard (${runs.size - weesEval} van ${runs.size} runs)`);
}
if (weesEval) notitie(`${weesEval} run(s) van een account zonder profiel — dat is de eval, zie controle 4`);

// De vorm van de storing die elf dagen duurde: dagen achtereen wél verbruik en géén
// bewaarde screening. Eén losse dag telt niet — een analyse die je niet opslaat is normaal.
const echtVerbruik = analyses.filter(v => metProfiel.has(v.gebruiker_id));
const verbruikDagen = new Set(echtVerbruik.map(v => dag(v.gestart_op)));
const screeningDagen = new Set(screenings.map(s => dag(s.created_at)));

const stil = [...verbruikDagen].filter(d => !screeningDagen.has(d)).sort();
let langste = [], huidig = [];
for (const d of stil) {
  const vorige = huidig[huidig.length - 1];
  const opeenvolgend = vorige && (new Date(d) - new Date(vorige)) === 864e5;
  huidig = opeenvolgend ? [...huidig, d] : [d];
  if (huidig.length > langste.length) langste = huidig;
}

if (langste.length >= 2) {
  meld(`${langste.length} dagen achtereen verbruik en nul bewaarde screenings (${langste[0]} t/m ${langste[langste.length - 1]})`);
} else if (langste.length === 1) {
  notitie(`één dag met verbruik en nul screenings (${langste[0]}) — te weinig voor een signaal`);
} else {
  goed('geen dag met verbruik en nul screenings');
}

// ── 2. Screenings zonder rapport ─────────────────────────────────────────────
//
// Een lege huls in de lijst van de mediator: hij ziet hem staan, opent hem, en er is niets.

console.log('\n2. Screenings zonder rapport');

const leeg = screenings.filter(s => s.rapport === null || s.rapport === undefined);
const rijp = leeg.filter(s => Date.now() - new Date(s.created_at).getTime() > RIJPTIJD_MS);

if (rijp.length) {
  meld(`${rijp.length} screening(s) zonder rapport, ouder dan een uur`);
  for (const s of rijp.slice(0, 10)) console.log(`       ${dag(s.created_at)}  id ${s.id}`);
  if (rijp.length > 10) console.log(`       … en nog ${rijp.length - 10}`);
} else {
  goed(`geen screening zonder rapport${leeg.length ? ` (${leeg.length} nog binnen het uur)` : ''}`);
}

// ── 3. Verbruik zonder organisatie ───────────────────────────────────────────
//
// `organisatie_id` is hoe verbruik aan een kantoor wordt toegerekend. Staat hij leeg, dan
// telt die aanroep bij niemand mee — het soort verlies dat pas opvalt als er een rekening
// uit moet.

console.log('\n3. Verbruik zonder organisatie');

// Twee soorten, en ze vragen om verschillende dingen. Een regel van een gebruiker die wél
// een profiel heeft betekent dat de context ergens onderweg is kwijtgeraakt — dat is een
// fout in de meting zelf. Een regel van een account zónder profielrij is niets anders dan
// controle 4, en die twee keer rood melden maakt van één oorzaak twee bevindingen.
const zonderOrg = verbruik.filter(v => !v.organisatie_id);
const perGebruiker = new Map();
for (const r of zonderOrg) {
  const k = r.gebruiker_id ?? '(geen gebruiker_id)';
  perGebruiker.set(k, (perGebruiker.get(k) ?? 0) + 1);
}
const contextKwijt = [...perGebruiker].filter(([g]) => g === '(geen gebruiker_id)' || metProfiel.has(g));
const viaAccount   = [...perGebruiker].filter(([g]) => g !== '(geen gebruiker_id)' && !metProfiel.has(g));

if (contextKwijt.length) {
  const n = contextKwijt.reduce((s, [, k]) => s + k, 0);
  meld(`${n} verbruiksregel(s) zonder organisatie terwijl de gebruiker er nu wél een heeft`);
  for (const [g, k] of contextKwijt.sort((a, b) => b[1] - a[1])) {
    console.log(`       ${String(k).padStart(5)}×  ${g}`);
  }
  // Twee oorzaken, en van buiten niet te onderscheiden: de meetcontext ging onderweg
  // verloren, óf de rij dateert van vóórdat die gebruiker een profiel had. Dat tweede is
  // op 5 september 2026 gebeurd — het evalaccount kreeg zijn profielrij pas achteraf, en
  // toen sloegen 246 rijen om van "geen profiel" naar "context kwijt" zonder dat er iets
  // aan die rijen veranderde. Noem dus beide, en niet één als vaststaand.
  console.log('       → of de meetcontext ging verloren, of de rijen dateren van vóór dat profiel.');
  console.log('         In het tweede geval horen ze aangevuld te worden, niet gerepareerd.');
} else if (zonderOrg.length) {
  goed('geen regel waarbij de context onderweg verloren ging');
} else {
  goed('elke verbruiksregel hoort bij een organisatie');
}

for (const [g, k] of viaAccount.sort((a, b) => b[1] - a[1])) {
  notitie(`${k} regel(s) van ${g} — dat account heeft geen profielrij, zie controle 4`);
}

// ── 4. Accounts zonder profielrij ────────────────────────────────────────────
//
// Dit is de oorzaak onder controle 3, en het reikt verder dan de facturatie. Zonder rij in
// `gebruikersprofiel` geeft `mijn_organisatie_id()` NULL, en dan geeft élke RLS-policy nul
// rijen terug: zo iemand kan inloggen en ziet een lege applicatie. Zijn verbruik is
// bovendien aan niemand toe te rekenen.

console.log('\n4. Accounts zonder profielrij');

const { data: accounts, error: fA } = await db.auth.admin.listUsers({ perPage: 1000 });
if (fA) {
  meld(`accounts niet te lezen: ${fA.message}`);
} else {
  const zonderProfiel = (accounts?.users ?? []).filter(u => !metProfiel.has(u.id));
  if (zonderProfiel.length) {
    meld(`${zonderProfiel.length} van ${accounts.users.length} account(s) heeft geen profielrij`);
    for (const u of zonderProfiel) {
      const domein = (u.email ?? '').split('@')[1] ?? '(geen e-mail)';
      console.log(`       ${u.id}  aangemaakt ${dag(u.created_at)}  @${domein}`);
    }
    console.log('       → zij zien een lege applicatie, en hun verbruik telt bij niemand mee');
  } else {
    goed('elk account heeft een profielrij');
  }

  const zonderOrgProfiel = profielen.filter(p => !p.organisatie_id);
  if (zonderOrgProfiel.length) {
    meld(`${zonderOrgProfiel.length} profiel(en) zonder organisatie`);
    for (const p of zonderOrgProfiel) console.log(`       ${p.id}`);
  } else {
    goed('elk profiel hoort bij een organisatie');
  }
}

// ── Uitkomst ─────────────────────────────────────────────────────────────────
//
// `UITKOMST:` op stdout plus een exitcode, zodat dit ook als poort in CI of in een hook
// bruikbaar is — dezelfde vorm als kennisbank-check.mjs.

console.log('');
if (bevindingen.length) {
  console.log(`UITKOMST: ${bevindingen.length} bevinding(en)`);
  for (const b of bevindingen) console.error(`  - ${b}`);
} else {
  console.log('UITKOMST: geen bevindingen');
}

process.exitCode = bevindingen.length ? 1 : 0;
