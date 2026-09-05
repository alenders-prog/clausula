#!/usr/bin/env node
/**
 * scripts/anon-rechten-check.mjs
 *
 * Doet wat een willekeurige bezoeker doet — de publieke sleutel, niet ingelogd — en kijkt
 * wat er terugkomt.
 *
 * ── WAT DIT WEL EN NIET KAN VASTSTELLEN ─────────────────────────────────────
 *
 * Dit script ziet een lek. Het kan van buiten **niet** vaststellen of `anon` nog
 * tabelrechten heeft. Dat was op 5 september 2026 wél de hele opzet van dit script, en die
 * opzet was fout.
 *
 * De redenering was: "permission denied for function mijn_organisatie_id" betekent dat het
 * verzoek tót de policy is gekomen, en dus dat de rol leesrecht op de tabel heeft.
 *
 * Gemeten, diezelfde dag, en het klopt niet. Ná het intrekken van alle rechten gaf
 * `has_table_privilege('anon', 'public.screeningen', 'select')` **false**, terwijl dezelfde
 * melding bleef komen — ook rechtstreeks in de database met `set local role anon`.
 *
 * De reden: de policies op die tabellen zijn aangemaakt zónder `TO`-clausule en gelden
 * daarmee voor élke rol, ook voor anon. Hun USING-expressie is dus onderdeel van de query,
 * en het EXECUTE-recht op een functie in die expressie wordt eerder getoetst dan het
 * SELECT-recht op de tabel. De melding zegt daarom niets over het tabelrecht.
 *
 * Waar een policy wél `TO authenticated` staat (de verdeling-tabellen, `007_verdeling_rls.sql`)
 * geldt er voor anon geen enkele policy, valt die functie weg, en komt het tabelrecht als
 * eerste aan de beurt: "permission denied for table". Dát is het verschil tussen de zeven en
 * de drie — een verschil in policies, niet in rechten.
 *
 * De rechtenvraag hoort daarom in de database thuis: `supabase/anon-rechten-controle.sql`.
 *
 * ── WAT HIER DAN WEL UIT KOMT ───────────────────────────────────────────────
 *
 *   rijen terug            LEK — urgent, en dit is de enige uitkomst die dat is
 *   200 met nul rijen      anon mág de tabel lezen; alleen de policy houdt tegen
 *   denied for table       gestrand vóór de policy — zo hoort het
 *   denied for function    onbeslist van buiten; zie het SQL-bestand hierboven
 *
 * Gebruikt alleen de publieke sleutel uit `config.js`. Geen geheimen, veilig in CI.
 * Exitcode 1 bij een lek of bij een tabel die anon aantoonbaar mag lezen. "Onbeslist"
 * geeft geen foutcode: een poort die permanent rood staat om iets wat hij niet kán meten,
 * is een poort die je leert negeren.
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

const bevindingen = [];   // hard fout: lek, of aantoonbaar leesrecht
const onbeslist = [];     // van buiten niet te beoordelen

console.log(`Wat krijgt een anonieme bezoeker terug? — ${url}`);
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

  let oordeel, teken;
  if (rijen !== null && rijen !== 0) {
    // Het enige wat hier écht urgent is.
    oordeel = `LEK — ${rijen} rij(en) terug`;
    teken = '✖'; bevindingen.push(`${tabel}: ${oordeel}`);
  } else if (rijen !== null) {
    // Een antwoord zónder foutcode betekent dat het tabelrecht er wél was: het verzoek is
    // uitgevoerd en de policy gaf niets terug. Dat is beschermd, maar één policy-fout dik.
    oordeel = 'leeg via de policy — anon mág de tabel lezen';
    teken = '✖'; bevindingen.push(`${tabel}: ${oordeel}`);
  } else if (/permission denied for (table|relation)/i.test(melding)) {
    oordeel = 'gestrand vóór de policy';
    teken = '✓';
  } else if (/permission denied for function/i.test(melding)) {
    oordeel = 'policy-functie geweigerd — zegt niets over het tabelrecht';
    teken = '?'; onbeslist.push(tabel);
  } else {
    oordeel = melding.slice(0, 60) || 'onbekend';
    teken = '?'; onbeslist.push(`${tabel}: ${oordeel}`);
  }

  console.log(`  ${teken} ${tabel.padEnd(30)} ${oordeel}`);
}

console.log('');
if (bevindingen.length) {
  console.error(`UITKOMST: ${bevindingen.length} van ${TABELLEN.length} tabellen staat open voor anon`);
  for (const b of bevindingen) console.error(`  - ${b}`);
  console.error('\nZie supabase/2026-09-05-anon-rechten-intrekken.sql.');
} else {
  console.log(`UITKOMST: geen enkele tabel geeft een anonieme bezoeker iets terug`);
}

if (onbeslist.length) {
  console.log(`\n${onbeslist.length} tabel(len) zijn van buiten niet te beoordelen: er geldt een policy`);
  console.log('voor alle rollen, en de functie daarin wordt geweigerd vóórdat het tabelrecht');
  console.log('aan de beurt komt. Dat lekt niets, maar het zegt ook niets.');
  console.log('Draai supabase/anon-rechten-controle.sql om de rechten zelf te zien.');
}

// exitCode en niet exit(): dat laatste kapt de keep-alive-verbindingen van fetch af,
// waarop Node op Windows omvalt met exitcode 127. Zie storage-toegang-check.mjs.
process.exitCode = bevindingen.length ? 1 : 0;
