// PostToolUse-hook: draait de kennisbankcontrole zodra er aan een bestand met
// wetteksten/chunks is gewerkt. Vangt de schrijfwijze-val: een tag met streepje
// (koude-uitsluiting) matcht nooit tegen een kenmerk met underscore
// (koude_uitsluiting), en dat faalt stil — de chunk wordt gewoon nooit opgehaald.
//
// Dekt alleen wijzigingen die een bestand raken. Chunks die rechtstreeks in het
// Supabase-dashboard worden toegevoegd laten geen spoor na; daarvoor staat de
// regel in CLAUDE.md.

// package.json heeft "type": "module", dus .js is hier ESM — geen require().
import { execFileSync } from 'node:child_process';

let invoer = '';
process.stdin.on('data', d => { invoer += d; });
process.stdin.on('end', () => {
  let pad = '';
  try {
    const json = JSON.parse(invoer || '{}');
    pad = json.tool_input?.file_path || json.tool_response?.filePath || '';
  } catch { /* geen bruikbare invoer — niets doen */ }

  if (!/legal_chunk|wettekst|kennisbank/i.test(pad)) process.exit(0);

  let uitvoer = '';
  try {
    uitvoer = execFileSync('node', ['scripts/kennisbank-check.mjs'], {
      encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    // Geen .env, geen netwerk, of het script faalt: niet blokkeren, wel melden.
    console.log(`[kennisbank] controle niet gedraaid: ${e.message.split('\n')[0]}`);
    process.exit(0);
  }

  // Alleen iets zeggen als er echt iets mis is — anders is de hook alleen ruis.
  if (uitvoer.includes('⚠')) {
    console.log(uitvoer.trim());
    console.log('\n[kennisbank] Let op: tags met streepje matchen niet tegen kenmerken met underscore.');
  }
  process.exit(0);
});
