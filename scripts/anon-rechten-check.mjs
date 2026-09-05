#!/usr/bin/env node
/**
 * scripts/anon-rechten-check.mjs
 *
 * Toetst waaróp een anonieme aanvraag strandt. Niet óf — dát deed hij al — maar waarop.
 *
 * ── HET ONDERSCHEID DAT DIT MEET ────────────────────────────────────────────
 *
 * Op 5 september 2026 gaven de tabellen met cliëntgegevens dit terug op een anonieme
 * aanvraag met de publieke sleutel:
 *
 *     42501  permission denied for function mijn_organisatie_id
 *
 * Dat lijkt geruststellend, maar het zegt precies het tegenovergestelde: het verzoek is
 * **tot aan de policy gekomen**. De anonieme rol heeft dus leesrecht op de tabel, en wat
 * hem tegenhoudt is dat één functie niet uitvoerbaar is. Zou dat wel zo zijn, dan hangt de
 * bescherming er nog aan dat die functie NULL teruggeeft.
 *
 * Na het intrekken van de rechten (`supabase/2026-09-05-anon-rechten-intrekken.sql`) hoort
 * er dit te staan:
 *
 *     42501  permission denied for table screeningen
 *
 * Dan strandt het verzoek vóór de policy, en is de muur een ontbrekend recht dik in plaats
 * van twee toevalligheden.
 *
 * Beide geven HTTP 401 en beide lekken niets. Van buiten zijn ze alleen aan de tékst te
 * onderscheiden — vandaar dit script, want anders is niet vast te stellen of het intrekken
 * werkelijk iets heeft gedaan.
 *
 * Gebruikt alleen de publieke sleutel uit `config.js`. Geen geheimen, veilig in CI.
 * Exitcode 0 = alle tabellen strandden vóór de policy. Exitcode 1 = niet allemaal.
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

/** De tabellen die cliëntgegevens of toegangsgegevens dragen. */
const TABELLEN = [
  'screeningen', 'dossiers', 'gebruikersprofiel', 'analyse_feiten',
  'api_verbruik', 'uitnodigingen', 'organisaties',
  'verdeling_posten', 'verdeling_overzicht_totalen', 'zorgverdeling_dagdelen',
];

const bevindingen = [];

console.log(`Waarop strandt een anonieme aanvraag? — ${url}`);
console.log('(alleen de publieke sleutel uit config.js, niet ingelogd)\n');

for (const tabel of TABELLEN) {
  let melding = '';
  let rijen = null;
  try {
    const res = await fetch(`${url}/rest/v1/${tabel}?select=*&limit=1`, { headers: { apikey: key } });
    const tekst = await res.text();
    if (res.ok) {
      try { rijen = JSON.parse(tekst).length; } catch { rijen = '?'; }
    } else {
      melding = (() => { try { return JSON.parse(tekst).message ?? tekst; } catch { return tekst; } })();
    }
  } catch (e) {
    melding = `netwerkfout: ${e.message}`;
  }

  // Drie uitkomsten, oplopend van goed naar slecht.
  let oordeel, goed;
  if (/permission denied for (table|relation)/i.test(melding)) {
    oordeel = 'gestrand vóór de policy'; goed = true;
  } else if (/permission denied for function/i.test(melding)) {
    oordeel = 'kwam TOT de policy — recht staat nog open'; goed = false;
  } else if (rijen !== null) {
    // Rijen terug is een lek; nul rijen is beschermd, maar wel door de policy en niet
    // door een ontbrekend recht.
    oordeel = rijen > 0 ? `LEK — ${rijen} rij(en) terug` : 'leeg via de policy';
    goed = false;
  } else {
    oordeel = melding.slice(0, 60) || 'onbekend'; goed = false;
  }

  console.log(`  ${goed ? '✓' : '✖'} ${tabel.padEnd(30)} ${oordeel}`);
  if (!goed) bevindingen.push(`${tabel}: ${oordeel}`);
}

console.log('');
if (bevindingen.length) {
  console.error(`UITKOMST: ${bevindingen.length} van ${TABELLEN.length} tabellen strandt niet vóór de policy`);
  for (const b of bevindingen) console.error(`  - ${b}`);
  console.error('\nZie supabase/2026-09-05-anon-rechten-intrekken.sql.');
  console.error('Let op: "leeg via de policy" en "kwam TOT de policy" lekken allebei niets —');
  console.error('ze zijn alleen dunner beschermd dan nodig. Een LEK-regel is wél urgent.');
} else {
  console.log('UITKOMST: elke tabel strandt vóór de policy — anon heeft geen tabelrechten meer');
}

// exitCode en niet exit(): dat laatste kapt de keep-alive-verbindingen van fetch af,
// waarop Node op Windows omvalt met exitcode 127. Zie storage-toegang-check.mjs.
process.exitCode = bevindingen.length ? 1 : 0;
