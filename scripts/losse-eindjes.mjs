/**
 * scripts/losse-eindjes.mjs — welke code bestaat wel, maar wordt nergens aangeroepen?
 *
 * Aanleiding (1 september 2026). Drie keer op één dag dezelfde soort fout, en alle drie
 * gevonden doordat een mediator iets raars zag:
 *
 *   sorteerOpType        bestond, getest, aan window gehangen — nul aanroepen. In plaats
 *                        daarvan stonden er drie eigen volgordetabellen in index.html,
 *                        die twee documenttypes misten. Gevolg: het waardeoverzicht
 *                        stond vóór het convenant.
 *   clausule.tekst       de prompt verwees naar een tool-veld dat een maand eerder was
 *                        verwijderd. Gevolg: een beloofde clausule die nooit kwam.
 *   beoordeelVolgorde    (29-08) kloppende logica die nergens werd aangeroepen.
 *
 * Ze hebben één ding gemeen: niets is stuk. Er is geen foutmelding, geen rode test, geen
 * afwijkend gedrag dat opvalt zonder dat je er precies naar kijkt. De code is er, ziet er
 * goed uit, en doet niets.
 *
 * Dit script zoekt dat patroon op drie manieren:
 *
 *   1. BRUG-DODE-HOEK   een naam die via de ESM-brug aan `window` hangt maar in de rest
 *                       van index.html nooit wordt gebruikt.
 *   2. ONGEBRUIKTE EXPORT  een export in src/ die door geen enkel bestand wordt ingeladen.
 *   3. SCHADUWTABEL     een letterlijke `{ ouderschapsplan: …, convenant: … }`-achtige
 *                       tabel in index.html naast de gedeelde variant in src/.
 *
 * Uitvoer: een lijst, en exitcode 1 als er iets gevonden is, zodat hij als poort kan
 * dienen. Bekende en bewuste uitzonderingen staan onderaan in TOEGESTAAN, met reden.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORTEL = join(fileURLToPath(new URL('.', import.meta.url)), '..');

/**
 * Namen die hier bewust staan, met de reden erbij. Elke regel is een besluit; groeit
 * deze lijst, dan staat dat in de diff.
 *
 * Wat hier NIET in hoort: iets dat gewoon aangesloten of weggehaald moet worden. Deze
 * lijst is voor echte uitzonderingen, niet om de teller op nul te praten.
 */
const TOEGESTAAN = new Map([
  ['KOLOM_POSITIE', 'Geen rangorde maar een tweekolomslayout: OP links, convenant rechts. '
    + 'Dat er twee documenttypes ontbreken is juist correct — de tak is afgeschermd met '
    + 'DOC_TYPEN.includes(). Een derde type zou hier een kolom moeten krijgen, geen rang.'],
  ['DIM_PRIO', 'Prioriteit voor het kiezen van één dimensie per kaart, geen gewicht in de '
    + 'score. cross_doc ontbreekt bewust: dat is geen dimensie van één document.'],
  ['bevestigdeTotp', 'Wacht op de 2FA-uitrol. De migratie supabase/2026-08-26-mfa-aal2.sql '
    + 'staat klaar maar is nog niet gedraaid (mijn_rol_vereist_mfa bestaat niet in de '
    + 'database), omdat er nog een beheerder zonder factor is. Weghalen en straks '
    + 'terugbouwen is churn. Schrappen zodra die uitrol niet meer doorgaat.'],
]);

// ── Bestanden inlezen ───────────────────────────────────────────────────────

function allePaden(map, uit = []) {
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) allePaden(pad, uit);
    else if (/\.(js|mjs|html)$/.test(naam)) uit.push(pad);
  }
  return uit;
}

const indexHtml = readFileSync(join(WORTEL, 'index.html'), 'utf8');
const testPaden = allePaden(join(WORTEL, 'tests'));
const srcPaden  = allePaden(join(WORTEL, 'src'));
const codePaden = [
  ...srcPaden,
  ...allePaden(join(WORTEL, 'api')),
  join(WORTEL, 'index.html'),
  ...['assistent-mobiel.html', 'login.html'].map(f => join(WORTEL, f))
    .filter(p => { try { statSync(p); return true; } catch { return false; } }),
];

// ── 1. Namen die aan window hangen maar nergens worden gebruikt ─────────────

/**
 * Het moduleblok onderaan index.html is de brug. Alles daarbuiten is de gewone code
 * die de brug hoort te gebruiken; binnen de brug tellen import- en window-regels niet
 * als gebruik.
 */
function brugDodeHoek() {
  const start = indexHtml.lastIndexOf('<script type="module">');
  const brug  = start >= 0 ? indexHtml.slice(start) : '';
  const rest  = start >= 0 ? indexHtml.slice(0, start) : indexHtml;

  const namen = [...brug.matchAll(/^\s*window\.(\w+)\s*=\s*(\w+);/gm)].map(m => ({
    window: m[1], lokaal: m[2],
  }));

  const uit = [];
  for (const { window: wnaam, lokaal } of namen) {
    if (TOEGESTAAN.has(wnaam)) continue;
    // Gebruik telt als: `window.naam(`, `naam(`, of doorgegeven als waarde (`naam,`/`naam)`).
    const re = new RegExp(`\\b(?:window\\.)?${wnaam}\\b`, 'g');
    const buitenBrug = (rest.match(re) || []).length;
    // En binnen de brug, maar dan als échte aanroep — niet de toewijzingsregel zelf.
    const inBrugGebruik = (brug.match(new RegExp(`\\b${lokaal}\\s*\\(`, 'g')) || []).length;
    if (buitenBrug === 0 && inBrugGebruik === 0) {
      uit.push({ naam: wnaam, waar: 'index.html', wat: 'aan window gehangen, nooit gebruikt' });
    }
  }
  return uit;
}

// ── 2. Exports in src/ die niemand inlaadt ─────────────────────────────────

function ongebruikteExports() {
  const uit = [];
  for (const pad of srcPaden) {
    const bron = readFileSync(pad, 'utf8');
    const rel  = relative(WORTEL, pad).replace(/\\/g, '/');
    const namen = [
      ...[...bron.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)].map(m => m[1]),
      ...[...bron.matchAll(/^export\s+const\s+(\w+)/gm)].map(m => m[1]),
    ];
    for (const naam of namen) {
      if (TOEGESTAAN.has(naam)) continue;
      const re = new RegExp(`\\b${naam}\\b`, 'g');
      // Binnen het eigen bestand telt gebruik óók: een helper die alleen intern wordt
      // aangeroepen is geen los eindje, hooguit een export die niet nodig is.
      const intern = (bron.match(re) || []).length - 1;   // −1 voor de declaratie zelf
      let extern = 0;
      for (const q of codePaden) {
        if (q === pad) continue;
        extern += (readFileSync(q, 'utf8').match(re) || []).length;
      }
      let inTests = 0;
      for (const q of testPaden) inTests += (readFileSync(q, 'utf8').match(re) || []).length;

      // "Alleen in tests" is het ergste geval: dan staat er een groene test onder code
      // die de app niet gebruikt — precies de valse zekerheid van sorteerOpType.
      if (extern === 0 && intern <= 0) {
        uit.push({ naam, waar: rel,
          wat: inTests > 0 ? 'ALLEEN in tests gebruikt, niet in de app'
                           : 'geëxporteerd, nergens gebruikt' });
      }
    }
  }
  return uit;
}

// ── 3. Schaduwtabellen naast een gedeelde constante ────────────────────────

/**
 * Een letterlijke tabel in index.html die dezelfde sleutels heeft als een geëxporteerde
 * constante in src/. Dat is hoe de volgordefout ontstond: drie eigen tabellen naast
 * DOC_VOLGORDE, alle drie met minder types erin.
 */
function schaduwTabellen() {
  const uit = [];
  const gedeeld = [];
  for (const pad of srcPaden) {
    const bron = readFileSync(pad, 'utf8');
    for (const m of bron.matchAll(/^export const (\w+)\s*=\s*\{([^}]{10,400})\}/gm)) {
      const sleutels = [...m[2].matchAll(/(\w+)\s*:/g)].map(x => x[1]);
      if (sleutels.length >= 3) {
        gedeeld.push({ naam: m[1], sleutels, waar: relative(WORTEL, pad).replace(/\\/g, '/') });
      }
    }
  }
  for (const m of indexHtml.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*\{([^}]{10,400})\}/g)) {
    if (TOEGESTAAN.has(m[1])) continue;
    const sleutels = [...m[2].matchAll(/(\w+)\s*:/g)].map(x => x[1]);
    // Alleen tabellen die op een rangorde lijken: numerieke waarden. Labeltabellen
    // (doc_type → 'Convenant') mogen best minder sleutels hebben dan de volgorde —
    // dat zijn geen concurrenten maar iets anders.
    const numeriek = /:\s*-?\d+\s*[,}]/.test(m[2]);
    if (sleutels.length < 2 || !numeriek) continue;
    for (const g of gedeeld) {
      const overlap = sleutels.filter(s => g.sleutels.includes(s));
      // Minstens twee gedeelde sleutels én minder compleet dan het origineel.
      if (overlap.length >= 2 && sleutels.length < g.sleutels.length) {
        uit.push({
          naam: m[1], waar: 'index.html',
          wat: `schaduwt ${g.naam} uit ${g.waar} (${overlap.join(', ')}) maar mist `
             + g.sleutels.filter(s => !sleutels.includes(s)).join(', '),
        });
      }
    }
  }
  return uit;
}

// ── Uitvoer ─────────────────────────────────────────────────────────────────

const bevindingen = [
  ['Aan window gehangen, nooit gebruikt', brugDodeHoek()],
  ['Geëxporteerd, nergens ingeladen',     ongebruikteExports()],
  ['Schaduwtabel naast een gedeelde',     schaduwTabellen()],
];

let totaal = 0;
for (const [kop, lijst] of bevindingen) {
  if (!lijst.length) continue;
  totaal += lijst.length;
  console.warn(`\n⚠ ${kop} (${lijst.length}):`);
  for (const b of lijst) console.warn(`   ${b.naam.padEnd(28)} ${b.waar.padEnd(34)} ${b.wat}`);
}

console.log(totaal === 0
  ? 'UITKOMST: geen losse eindjes'
  : `UITKOMST: ${totaal} los(se) eindje(s) — zie hierboven`);
process.exit(totaal === 0 ? 0 : 1);
