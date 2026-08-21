// PostToolUse-hook: herinnert aan de eval zodra er aan een screening-prompt is gewerkt.
//
// docs/auto-test-setup.md punt D10 spreekt af dat elke wijziging aan screening-prompts
// de eval opnieuw moet draaien en de baseline niet mag verslechteren. Die afspraak is
// op 19 augustus 2026 aantoonbaar niet nagekomen — en niets merkte het, omdat prompts
// toen nog in api/analyseer.js stonden, waar elke wijziging hetzelfde bestand raakt.
//
// Sinds de prompts in api/prompts/ staan is de afspraak wél aan een pad te koppelen.
// Deze hook blokkeert niets; hij zegt alleen wat er nu hoort te gebeuren.

// package.json heeft "type": "module", dus .js is hier ESM — geen require().
let invoer = '';
process.stdin.on('data', d => { invoer += d; });
process.stdin.on('end', () => {
  let pad = '';
  try {
    const json = JSON.parse(invoer || '{}');
    pad = json.tool_input?.file_path || json.tool_response?.filePath || '';
  } catch { /* geen bruikbare invoer — niets doen */ }

  const isPrompt = /[\\/]api[\\/]_prompts[\\/]/.test(pad)
                || /_consistentie\.js$/.test(pad);
  if (!isPrompt) process.exit(0);

  console.log([
    '[prompt] Screening-prompt gewijzigd — de eval hoort nu te draaien:',
    '',
    '  npm run test:eval   (TEST_BASE_URL + TEST_JWT_TOKEN + vercel dev, ~4 min, ~$1)',
    '',
    'Vergelijk met de baseline en meld het resultaat. De volledige issuelijst per',
    'fixture komt in tests/golden/laatste-run-*.json te staan.',
    'Raak witruimte en spelling niet zonder reden aan: de gedeelde blokken worden',
    'byte-exact gecachet, dus elke wijziging kost eenmalig een volledige cache-miss.',
  ].join('\n'));
  process.exit(0);
});
