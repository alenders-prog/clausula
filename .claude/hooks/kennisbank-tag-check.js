// PostToolUse-hook: draait de kennisbankcontrole zodra er aan een bestand met
// wetteksten/chunks is gewerkt. Vangt de schrijfwijze-val: een tag met streepje
// (koude-uitsluiting) matcht nooit tegen een kenmerk met underscore
// (koude_uitsluiting), en dat faalt stil — de chunk wordt gewoon nooit opgehaald.
//
// Dekt alleen wijzigingen die een bestand raken. Chunks die rechtstreeks in het
// Supabase-dashboard worden toegevoegd laten geen spoor na; daarvoor staat de
// regel in CLAUDE.md.

// package.json heeft "type": "module", dus .js is hier ESM — geen require().
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { meld } from './_meld.js';   // platte tekst op stdout bereikt niemand — zie _meld.js

const CONTROLE = fileURLToPath(new URL('../../scripts/kennisbank-check.mjs', import.meta.url));

let invoer = '';
process.stdin.on('data', d => { invoer += d; });
process.stdin.on('end', () => {
  let pad = '';
  try {
    const json = JSON.parse(invoer || '{}');
    pad = json.tool_input?.file_path || json.tool_response?.filePath || '';
  } catch { /* geen bruikbare invoer — niets doen */ }

  if (!/legal_chunk|wettekst|kennisbank/i.test(pad)) process.exit(0);

  // spawnSync, niet execFileSync: die laatste geeft alleen stdout terug, en de
  // bevindingen van het controlescript gingen via console.warn naar stderr. De hook
  // zocht dus naar '⚠' in een tekst waar dat teken per definitie niet in kon staan
  // — hij draaide de controle netjes en gooide precies de uitkomst weg. Gemeten op
  // 24 augustus 2026; zie ook de exitcode die het script sindsdien zet.
  const r = spawnSync(process.execPath, [CONTROLE], {
    encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (r.error) {
    // Geen node, of een time-out: niet blokkeren, wel melden.
    meld(`[kennisbank] controle niet gedraaid: ${r.error.message.split('\n')[0]}`);
    process.exit(0);
  }

  const uitvoer = `${r.stdout || ''}\n${r.stderr || ''}`.trim();

  if (r.status === null) {
    meld('[kennisbank] controle afgebroken (time-out).');
  } else if (r.status !== 0) {
    // Exitcode 1 = het script heeft iets gevonden. Exitcode van een crash (geen .env,
    // geen netwerk) valt hier ook onder: in beide gevallen wil je het zien.
    meld([
      uitvoer,
      '',
      '[kennisbank] Let op: tags met streepje matchen niet tegen kenmerken met underscore.',
      '[kennisbank] Na een tekstwijziging óók: node scripts/kennisbank-embed.mjs',
    ].join('\n'));
  }
  // Alles in orde → niets zeggen. Anders is de hook alleen ruis.
  process.exit(0);
});
