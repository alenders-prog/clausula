// PostToolUse-hook: draait de tests die bij het bewerkte bestand horen.
//
// Stond tot 24 augustus 2026 als bash-regel in .claude/settings.json:
//
//     file="$CLAUDE_TOOL_INPUT_FILE_PATH"; if [[ "$file" == */api/*.js ... ]]
//
// Die omgevingsvariabele bestaat niet — het pad komt via stdin als JSON. `$file`
// was dus altijd leeg, de if-tak werd nooit genomen, en `exit 0` sloot af alsof
// er niets aan de hand was. De hook heeft geen enkele keer gedraaid, en dat was
// van buiten niet te zien: een hook die niets doet ziet er hetzelfde uit als een
// hook die niets te melden heeft.
//
// Deze versie zegt alleen iets wanneer er iets te zeggen valt: falende tests, of
// een bestand in src/ zonder enige test — die tweede is een afspraak uit CLAUDE.md
// ("nieuwe logica in src/, met een unittest") en anders merkt niemand het.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const WORTEL  = fileURLToPath(new URL('../../', import.meta.url));
const VITEST  = fileURLToPath(new URL('../../node_modules/vitest/vitest.mjs', import.meta.url));

let invoer = '';
process.stdin.on('data', d => { invoer += d; });
process.stdin.on('end', () => {
  let pad = '';
  try {
    const json = JSON.parse(invoer || '{}');
    pad = json.tool_input?.file_path || json.tool_response?.filePath || '';
  } catch { /* geen bruikbare invoer — niets doen */ }

  const genormaliseerd = pad.replace(/\\/g, '/');
  const relevant = /\/(api|src|tests)\/.*\.(js|mjs)$/.test(genormaliseerd)
                && !/\/tests\/e2e\//.test(genormaliseerd);   // e2e vraagt een draaiende server
  if (!relevant || !existsSync(VITEST)) process.exit(0);

  // Rechtstreeks via node, niet via npx: dat scheelt een shell en dus gedoe met
  // aanhalingstekens rond paden met spaties.
  const r = spawnSync(process.execPath,
    [VITEST, 'related', genormaliseerd, '--run', '--passWithNoTests', '--reporter=dot'],
    { cwd: WORTEL, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] });

  if (r.error) {
    console.log(`[tests] niet gedraaid: ${r.error.message.split('\n')[0]}`);
    process.exit(0);
  }

  const uitvoer = `${r.stdout || ''}\n${r.stderr || ''}`;

  if (r.status !== 0) {
    console.log(uitvoer.trim().split('\n').slice(-25).join('\n'));
    console.log('\n[tests] Gerelateerde tests falen na deze wijziging.');
    process.exit(0);
  }

  // `--passWithNoTests` geeft exitcode 0 als er niets te draaien valt. Voor src/ is
  // dat juist het signaal: daar hoort elke module een test te hebben.
  const geenTests = /No test files found/i.test(uitvoer);
  if (geenTests && /\/src\//.test(genormaliseerd)) {
    console.log(`[tests] Geen test gevonden voor ${genormaliseerd.split('/').slice(-2).join('/')}.`);
    console.log('[tests] CLAUDE.md: nieuwe logica in src/ hoort een unittest te hebben —');
    console.log('[tests] dat is de enige reden om code daarheen te verplaatsen.');
  }
  process.exit(0);
});
