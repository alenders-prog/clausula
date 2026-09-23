#!/usr/bin/env node
/**
 * De stand van het project, voor de SessionStart-hook.
 *
 *   node scripts/sessiestand.mjs          # JSON voor de hook
 *   npm run stand                         # leesbaar, om het zelf te bekijken
 *
 * Overgenomen uit de MfN-trainer (`scripts/sessiestand.mjs`) op 23 september 2026, met
 * de projectspecifieke stukken vervangen.
 *
 * Waarom dit bestaat. `CLAUDE.md` en het geheugen komen elke sessie automatisch mee,
 * maar die zeggen niets over wáár het werk staat: wat er als laatste is gedaan, of er
 * nog iets ongecommit is, en wat er openstaat. Zonder dat begint elke nieuwe sessie met
 * een paar beurten rondkijken — en dat is precies wat er verloren gaat als een sessie
 * per ongeluk sluit.
 *
 * Het blijft met opzet kort. Dit gaat in de context van élke sessie.
 *
 * Faalt nooit hard: zonder git of zonder STAND.md komt er minder in de tekst, maar de
 * hook levert altijd geldige JSON. Een hook die de sessie laat struikelen is erger dan
 * geen hook.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORTEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Draait git en geeft '' terug als er iets misgaat. */
function git(...args) {
  try {
    return execFileSync('git', args, { cwd: WORTEL, encoding: 'utf8' }).trimEnd();
  } catch {
    return '';
  }
}

/**
 * STAND.md: waar we gebleven zijn en wat de volgende stap is.
 *
 * De commits zeggen wat er gedaan is. Geen van beide zegt waar het gesprek stond. Dat is
 * precies wat je na een paar dagen kwijt bent: dat een meetuitslag nog gelezen moet
 * worden, of dat er op een antwoord van een leverancier wordt gewacht.
 *
 * Bewust met de hand bijgehouden en bewust kort. Een lijst die alles bijhoudt wordt niet
 * bijgehouden.
 *
 * En met de ouderdom erbij. Een notitie die beweert actueel te zijn terwijl er daarna nog
 * vijf keer gecommit is, is dezelfde valkuil als commentaar dat een meting claimt die
 * niet meer geldt: de code blijft werken, niets gaat rood, en de volgende lezer neemt het
 * aan.
 */
const MAX_STAND = 14;
function standblok() {
  const pad = path.join(WORTEL, 'STAND.md');
  let tekst;
  try {
    tekst = fs.readFileSync(pad, 'utf8');
  } catch {
    return [];
  }

  // Het hele commentaarblok eruit, niet alleen de openingsregel — anders komt de
  // gebruiksaanwijzing in beeld in plaats van de stand.
  const regels = tekst
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((r) => !r.startsWith('#'))
    .map((r) => r.trimEnd());
  while (regels.length && !regels[0].trim()) regels.shift();
  while (regels.length && !regels[regels.length - 1].trim()) regels.pop();
  if (!regels.length) return [];

  // Lege regels tellen niet mee voor het plafond; anders knipt een witregel tussen twee
  // punten er een punt af.
  const uit = ['Waar we gebleven zijn:'];
  let gebruikt = 0;
  let over = 0;
  for (const r of regels) {
    if (gebruikt >= MAX_STAND) { if (r.trim()) over++; continue; }
    uit.push('  ' + r);
    if (r.trim()) gebruikt++;
  }
  if (over) uit.push(`  … (${over} regels meer in STAND.md)`);

  // Ouder dan de code? Dan is het geen stand maar een herinnering.
  const laatsteCommit = Number(git('log', '-1', '--format=%ct') || 0) * 1000;
  let gewijzigd = 0;
  try { gewijzigd = fs.statSync(pad).mtimeMs; } catch { /* dan geen oordeel */ }
  if (laatsteCommit && gewijzigd && gewijzigd < laatsteCommit) {
    const dagen = Math.floor((laatsteCommit - gewijzigd) / 86400000);
    uit.push(
      `  LET OP: STAND.md is ouder dan de laatste commit${dagen >= 1 ? ` (${dagen} dag${dagen === 1 ? '' : 'en'})` : ''}`
      + ' — controleer of dit nog klopt.',
    );
  }
  uit.push('');
  return uit;
}

const regels = [...standblok()];

const commits = git('log', '-5', '--format=%h %ad %s', '--date=short');
if (commits) {
  regels.push('Laatste commits:');
  for (const r of commits.split('\n')) regels.push('  ' + r);
}

const status = git('status', '--short');
const ongepusht = git('rev-list', '--count', '@{u}..HEAD');
regels.push('');
const aantal = status ? status.split('\n').length : 0;
regels.push(`Werkboom: ${aantal === 0 ? 'schoon' : aantal === 1 ? '1 gewijzigd bestand' : aantal + ' gewijzigde bestanden'}`);
if (status) for (const r of status.split('\n').slice(0, 10)) regels.push('  ' + r.trim());
regels.push(`Ongepusht: ${ongepusht === '' ? 'onbekend' : ongepusht} commit(s)`);

regels.push('');
regels.push('De lokale server draait op poort 3200 (`npm run lokaal`) — 3000 is van de');
regels.push('MfN-trainer. Zie CLAUDE.md voor de rest van de werkafspraken.');

const tekst = regels.join('\n');

/**
 * Dezelfde stand, maar dan voor de mens achter de terminal.
 *
 * `additionalContext` gaat uitsluitend naar het model; `suppressOutput` verbergt
 * bovendien de stdout in de transcriptie. Wie de sessie start zag dus niets, en dat was
 * precies de bedoeling niet: de stand hoort óók op het scherm.
 *
 * `systemMessage` is het enige veld dat een hook aan de gebruiker toont. Het is een
 * melding en geen bladzijde, dus de slotalinea blijft eruit — die is een werkafspraak
 * voor het model en geen nieuws voor de lezer.
 */
const laatste = commits ? commits.split('\n')[0] : '';
const stand = standblok();
const melding = [
  'Projectstand',
  // Bovenaan, want dit is het antwoord op "waar waren we gebleven".
  ...stand.filter(Boolean).map((r) => '  ' + r),
  laatste ? '  Laatst: ' + laatste : '  Geen git-geschiedenis gevonden',
  `  Werkboom: ${aantal === 0 ? 'schoon' : aantal + ' gewijzigd'} · ongepusht: ${ongepusht === '' ? 'onbekend' : ongepusht}`,
  '  Volledig: npm run stand',
].join('\n');

if (process.argv.includes('--tekst')) {
  console.log(tekst);
} else {
  process.stdout.write(JSON.stringify({
    systemMessage: melding,
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: tekst },
    suppressOutput: true,
  }));
}
