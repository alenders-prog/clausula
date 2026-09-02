/**
 * scripts/risicokaart.mjs — waar zit het risico, mechanisch bepaald.
 *
 * Aanleiding (2 september 2026). Twee keer op rij heb ik een structuuradvies gegeven dat
 * op de verkeerde grondslag stond: eerst op de fouten die ik toevallig had gezien, daarna
 * op functielengte. Allebei meetbaar, allebei het verkeerde signaal.
 *
 * Lengte is niet waar fouten zitten — het is waar ze moeilijk te vinden zijn. En "de
 * fouten van gisteren" is een steekproef van één dag, uit één flow, gekozen door wat een
 * mediator toevallig opmerkte.
 *
 * Git weet het beter, en is er nooit naar gevraagd. Een bestand dat vaak wordt gewijzigd
 * én vaak wordt gerepareerd én geen tests heeft én iets doet dat het kantoor verlaat, is
 * een ander soort risico dan een lang bestand dat sinds juli niet is aangeraakt.
 *
 * Dit script combineert vier signalen per bestand:
 *
 *   verandertempo   aantal commits — hoe vaak grijpt iemand hierin?
 *   reparatiedichtheid  aandeel commits dat een fout herstelt, niet iets toevoegt
 *   dekking         heeft dit bestand een unittest?
 *   blootstelling   raakt het cliëntgegevens, of verlaat de uitvoer het kantoor?
 *
 * Geen van de vier is op zichzelf een oordeel. Samen wijzen ze aan wáár doorlichten loont
 * — en dat is een andere vraag dan waar de code het lelijkst is.
 *
 * Draaien:  node scripts/risicokaart.mjs
 * Kosten:   niets. Alleen git en de bestanden.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORTEL = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: WORTEL, encoding: 'utf8', maxBuffer: 64e6 });

/**
 * Woorden waaraan een reparatiecommit te herkennen is. Bewust ruim: het gaat om de
 * verhouding tussen bestanden, niet om een exacte telling. Een bestand met 60% herstel
 * en een bestand met 10% verschillen ook als beide labels wat rafelig zijn.
 */
const HERSTELWOORDEN = /\b(fix|repareer|reparatie|bug|fout|kapot|brak|verdween|verdwenen|klopte niet|ging mis|misging|stil|onzichtbaar|regressie|correctie|gecorrigeerd|hersteld|oorzaak)\b/i;

/** Bestanden waarvan de uitvoer het kantoor verlaat of die cliëntgegevens raken. */
const BLOOTSTELLING = [
  [/naam-anonimiseer|pii-anonimiseer|_crypto|naam-encrypt|naam-decrypt/, 'cliëntnamen'],
  [/docx|pdf|export|nummering|bullet|alinea-actie/i,                     'gaat naar de cliënt'],
  [/uitnodigen|registreer|_auth|mfa/,                                     'toegang'],
  [/analyseer|_prompts|consistentie|dedup/,                               'inhoud van het rapport'],
];

function alleBestanden(map, uit = []) {
  for (const n of readdirSync(join(WORTEL, map))) {
    const rel = `${map}/${n}`;
    if (statSync(join(WORTEL, rel)).isDirectory()) alleBestanden(rel, uit);
    else if (/\.(js|mjs)$/.test(n)) uit.push(rel);
  }
  return uit;
}

// ── Gegevens verzamelen ─────────────────────────────────────────────────────

const bestanden = [...alleBestanden('src'), ...alleBestanden('api'), 'index.html'];

/**
 * Welke bestanden een test daadwerkelijk aanroept — uit de import-regels, niet uit de
 * bestandsnaam.
 *
 * De eerste versie matchte op naam: `scherm.js` zocht een `scherm.test.js`, terwijl de
 * test `dashboard-scherm.test.js` heet. Daardoor stonden bestanden mét dekking als
 * ongetest in de lijst en scoorden ze twee punten te hoog — een meetfout die precies de
 * kant op wees die het verhaal leuker maakte.
 */
const getestePaden = new Set();
for (const f of readdirSync(join(WORTEL, 'tests/unit'))) {
  if (!f.endsWith('.test.js')) continue;
  const inhoud = readFileSync(join(WORTEL, 'tests/unit', f), 'utf8');
  for (const m of inhoud.matchAll(/['"`]\.\.\/\.\.\/((?:src|api)\/[^'"`]+)['"`]/g)) {
    getestePaden.add(m[1]);
  }
  // Ook de bronwachters tellen: een test die de tekst van een bestand nakijkt, dekt hem
  // niet functioneel maar merkt een wijziging wél op.
  for (const m of inhoud.matchAll(/new URL\('\.\.\/\.\.\/([^']+)'/g)) getestePaden.add(m[1]);
}

const rijen = bestanden.map(pad => {
  let logs = '';
  try { logs = git('log', '--follow', '--format=%s', '--', pad); } catch { /* nieuw bestand */ }
  const commits = logs.split('\n').filter(Boolean);
  const herstel = commits.filter(c => HERSTELWOORDEN.test(c)).length;

  const getest = getestePaden.has(pad);

  const bloot = BLOOTSTELLING.find(([re]) => re.test(pad));
  const regels = readFileSync(join(WORTEL, pad), 'utf8').split('\n').length;

  return {
    pad, regels, commits: commits.length, herstel,
    herstelDeel: commits.length ? herstel / commits.length : 0,
    getest, bloot: bloot ? bloot[1] : '',
  };
});

// ── Score ───────────────────────────────────────────────────────────────────
//
// Bewust simpel en zichtbaar, geen gewogen formule met knoppen. Vier vragen, elk een punt
// of twee. Wie het oneens is met een gewicht kan het hier zien staan en aanpassen — dat is
// meer waard dan een getal dat niemand kan navertellen.
for (const r of rijen) {
  r.score = 0;
  if (r.commits >= 10) r.score += 2; else if (r.commits >= 5) r.score += 1;
  if (r.herstel >= 5)  r.score += 2; else if (r.herstel >= 2) r.score += 1;
  if (!r.getest)       r.score += 2;
  if (r.bloot)         r.score += 1;
  if (r.regels > 300)  r.score += 1;
}

rijen.sort((a, b) => b.score - a.score || b.herstel - a.herstel);

// ── Uitvoer ─────────────────────────────────────────────────────────────────

console.log('risico  bestand                                  regels  commits  herstel  test  blootstelling');
console.log('─'.repeat(104));
for (const r of rijen.slice(0, 22)) {
  console.log(
    String(r.score).padStart(4) + '    ' +
    r.pad.padEnd(40) +
    String(r.regels).padStart(6) +
    String(r.commits).padStart(9) +
    (String(r.herstel) + ` (${Math.round(r.herstelDeel * 100)}%)`).padStart(11) +
    (r.getest ? '   ja ' : '  NEE ').padStart(7) +
    '  ' + r.bloot,
  );
}

const zonderTest = rijen.filter(r => !r.getest);
console.log(`\n${rijen.length} bestanden · ${zonderTest.length} zonder unittest`
  + ` · ${rijen.filter(r => r.herstel >= 3).length} met drie of meer reparatiecommits`);
