/**
 * De nachtelijke backup naar Dropbox (besloten bij de verhuizing, 19 nov 2026).
 *
 * De projectmap staat sinds 19 nov 2026 buiten Dropbox (C:\Users\alexx\dev\clausula).
 * Dropbox was tot dan stilzwijgend de backup. Nu schrijft een geplande taak in Windows elke
 * nacht `scripts/backup-naar-dropbox.mjs` uit: één git-bundle met de hele geschiedenis (ook
 * branches die nog niet gepusht zijn), `.env` en `.env.local`, en de geheugenmap van Claude Code.
 *
 * Overgenomen uit SamenOuders (`src/backup/backup.ts`, DAL-53). Hier staat de redenering die
 * een test verdient: welke geheugenmap bij dit project hoort, en wanneer een backup als
 * mislukt of te oud geldt. Een backup die stil stopt, merkt niemand tot hij nodig is —
 * daarom meldt de sessiestand het (scripts/sessiestand.mjs).
 *
 * Het verslag dat het script na elke draai in de backupmap zet (`laatste-backup.json`):
 *   { tijd: ISO, ok: boolean, fout?: string, laatsteGeslaagd?: ISO, refs?: number, head?: string }
 * `fout` bevat nooit inhoud van bestanden.
 */

/** Hoe oud een geslaagde backup mag zijn. Eén nacht overslaan (laptop uit) is geen alarm. */
const MAX_LEEFTIJD_UUR = 60;

/**
 * De naam die Claude Code aan de projectmap geeft onder ~/.claude/projects: elk teken dat
 * geen letter, cijfer of '-' is, wordt '-'. Gezien 19 nov 2026:
 * `c:\Users\alexx\dev\clausula` → `c--Users-alexx-dev-clausula`.
 */
function claudeProjectsleutel(projectpad) {
  return projectpad.replace(/[\\/]+$/, '').replace(/[^A-Za-z0-9-]/g, '-');
}

/**
 * Kies de geheugenmap van dit project uit de mappen onder ~/.claude/projects.
 * De schijfletter verschilt per sessie (C: of c:), dus zonder hoofdletters vergelijken.
 * Geeft null als er geen is: dat is een fout voor de backup, geen reden om stil over te slaan.
 *
 * @param {string} projectpad
 * @param {readonly string[]} mappen
 * @returns {string | null}
 */
export function kiesProjectmap(projectpad, mappen) {
  const sleutel = claudeProjectsleutel(projectpad).toLowerCase();
  return mappen.find((m) => m.toLowerCase() === sleutel) ?? null;
}

/**
 * Het oordeel over de backup voor de sessiestand: null als alles goed is, anders één regel.
 * `verslag` is wat er uit `laatste-backup.json` kwam (of undefined als het bestand er niet is).
 *
 * @param {unknown} verslag
 * @param {Date} nu
 * @returns {string | null}
 */
export function beoordeelBackup(verslag, nu) {
  if (verslag === undefined) return 'Backup: nog nooit gedraaid (npm run backup; zie docs/backup.md).';
  if (!isVerslag(verslag)) return 'Backup: laatste-backup.json is onleesbaar — draai npm run backup.';

  if (!verslag.ok) {
    const sinds = verslag.laatsteGeslaagd ? ` Laatste geslaagde: ${datum(verslag.laatsteGeslaagd)}.` : ' Nog nooit geslaagd.';
    return `Backup MISLUKT op ${datum(verslag.tijd)}: ${verslag.fout ?? 'onbekende fout'}.${sinds}`;
  }

  const uur = (nu.getTime() - Date.parse(verslag.tijd)) / 3_600_000;
  if (uur > MAX_LEEFTIJD_UUR) {
    return `Backup is ${Math.floor(uur / 24)} dagen oud (laatste: ${datum(verslag.tijd)}) — draait de geplande taak nog?`;
  }
  return null;
}

function isVerslag(v) {
  if (typeof v !== 'object' || v === null) return false;
  return typeof v.tijd === 'string' && !Number.isNaN(Date.parse(v.tijd)) && typeof v.ok === 'boolean';
}

function datum(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', dateStyle: 'short', timeStyle: 'short' });
}
