/**
 * Nachtelijke backup naar Dropbox (sinds de verhuizing, 19 nov 2026). Draait via een geplande
 * taak in Windows (docs/backup.md) en met de hand: `npm run backup`.
 * Overgenomen uit SamenOuders (scripts/backup-naar-dropbox.mjs, DAL-53).
 *
 * Schrijft naar %USERPROFILE%\Dropbox\Clausula-backup (of CLAUSULA_BACKUP):
 *   clausula.bundle      de hele git-geschiedenis, alle refs (`git bundle create --all`)
 *   env, env.local       kopieën van .env en .env.local (zonder punt: Dropbox en Verkenner
 *                        tonen ze dan)
 *   claude-geheugen\     de geheugenmap van Claude Code voor dit project
 *   laatste-backup.json  het verslag; de sessiestand meldt een mislukte of te oude backup
 *
 * Eén bestand per soort, telkens overschreven: Dropbox bewaart zelf de vorige versies.
 * Daarom wordt de bundle eerst buiten Dropbox gemaakt en gecontroleerd (`git bundle verify`),
 * en pas dan gekopieerd — een kapotte bundle overschrijft nooit de goede van gisteren.
 *
 * Faalt hard (exitcode 1) en schrijft dat in het verslag. Logt geen inhoud van bestanden.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kiesProjectmap } from '../src/backup/backup.js';

const WORTEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DROPBOX = path.join(os.homedir(), 'Dropbox');
const DOEL = process.env.CLAUSULA_BACKUP ?? path.join(DROPBOX, 'Clausula-backup');
const VERSLAG = path.join(DOEL, 'laatste-backup.json');

/** Bestanden buiten git die nodig zijn om de app lokaal te draaien. Beide verplicht. */
const ENV_BESTANDEN = [['.env', 'env'], ['.env.local', 'env.local']];

function git(...args) {
  return execFileSync('git', args, { cwd: WORTEL, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function vorigVerslag() {
  try { return JSON.parse(fs.readFileSync(VERSLAG, 'utf8')); } catch { return {}; }
}

const tijd = new Date().toISOString();
let tmp;
try {
  // Zonder Dropbox-map zou mkdir een gewone map aanmaken die nergens heen synchroniseert.
  if (!process.env.CLAUSULA_BACKUP && !fs.existsSync(DROPBOX)) throw new Error(`Dropbox-map ontbreekt (${DROPBOX})`);
  fs.mkdirSync(DOEL, { recursive: true });

  // 1. Git: bundle buiten Dropbox maken en controleren, dan pas kopiëren.
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clausula-backup-'));
  const bundle = path.join(tmp, 'clausula.bundle');
  git('bundle', 'create', bundle, '--all');
  git('bundle', 'verify', bundle);
  const refs = git('bundle', 'list-heads', bundle).split('\n').filter(Boolean).length;
  const head = git('rev-parse', 'HEAD');
  fs.copyFileSync(bundle, path.join(DOEL, 'clausula.bundle'));

  // 2. .env en .env.local — staan niet in git, en zonder is de app lokaal niet te draaien.
  for (const [bron, doel] of ENV_BESTANDEN) {
    const pad = path.join(WORTEL, bron);
    if (!fs.existsSync(pad)) throw new Error(`${bron} ontbreekt in de projectmap`);
    fs.copyFileSync(pad, path.join(DOEL, doel));
  }

  // 3. Geheugen van Claude Code. Eerst weg, dan opnieuw: een verwijderde herinnering hoort
  //    ook uit de backup te verdwijnen (Dropbox houdt hem 30 dagen in de prullenbak).
  const projecten = path.join(os.homedir(), '.claude', 'projects');
  const map = kiesProjectmap(WORTEL, fs.readdirSync(projecten));
  if (!map) throw new Error(`geen geheugenmap van Claude Code gevonden voor ${WORTEL}`);
  const geheugen = path.join(projecten, map, 'memory');
  if (!fs.existsSync(path.join(geheugen, 'MEMORY.md'))) throw new Error(`geen MEMORY.md in ${geheugen}`);
  const geheugenDoel = path.join(DOEL, 'claude-geheugen');
  fs.rmSync(geheugenDoel, { recursive: true, force: true });
  fs.cpSync(geheugen, geheugenDoel, { recursive: true });

  fs.writeFileSync(VERSLAG, JSON.stringify({ tijd, ok: true, laatsteGeslaagd: tijd, refs, head }, null, 2));
  console.log(`[backup] klaar: ${refs} refs, HEAD ${head.slice(0, 7)} → ${DOEL}`);
} catch (e) {
  const fout = String(e?.stderr || e?.message || e).trim().split('\n')[0];
  console.error(`[backup] MISLUKT: ${fout}`);
  try {
    // Alleen als de bovenliggende map er is: anders zou dit alsnog een losse map buiten Dropbox maken.
    if (!fs.existsSync(path.dirname(DOEL))) throw new Error(`${path.dirname(DOEL)} bestaat niet`);
    fs.mkdirSync(DOEL, { recursive: true });
    fs.writeFileSync(VERSLAG, JSON.stringify({ tijd, ok: false, fout, laatsteGeslaagd: vorigVerslag().laatsteGeslaagd }, null, 2));
  } catch (e2) {
    console.error(`[backup] ook het verslag kon niet geschreven worden: ${e2.message}`);
  }
  process.exitCode = 1;
} finally {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
}
