/**
 * tests/unit/skill-tabel.test.js
 *
 * De bijwerktabel in CLAUDE.md ("Skills bijhouden") koppelt bestanden aan de skills die
 * meeveranderen. Op 5 september 2026 bleek dat twee van de zeven regels naar bestanden
 * wezen die niet bestaan — `api/genereer-concept.js` en `api/export-docx.js`. Die regels
 * konden dus nooit afgaan, en er was niets dat dat liet zien.
 *
 * Dat is de bekende faalvorm van dit project in zijn zuiverste vorm: een regel die keurig
 * op papier staat, nooit in werking treedt, en waarvan het niet-werken geen enkel spoor
 * achterlaat. De tabel die het bijwerken van skills moet afdwingen, was zelf niet
 * bijgewerkt.
 *
 * Documentatie betrapt geen defecten; poorten doen dat. Vandaar deze test: hij leest de
 * tabel uit CLAUDE.md zelf, zodat er geen tweede lijst ontstaat die óók kan verlopen.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const wortel = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Leest de tabel onder "## Skills bijhouden" uit CLAUDE.md.
 * @returns {Array<{paden: string[], skills: string[], regel: string}>}
 */
function leesSkillTabel() {
  const md = fs.readFileSync(path.join(wortel, 'CLAUDE.md'), 'utf8');
  const sectie = md.split('## Skills bijhouden')[1];
  if (!sectie) throw new Error('De sectie "## Skills bijhouden" staat niet meer in CLAUDE.md');

  const rijen = [];
  for (const regel of sectie.split('\n')) {
    const m = regel.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/);
    if (!m) continue;
    if (/^\s*-+\s*$/.test(m[1]) || /Gewijzigd bestand/i.test(m[1])) continue;  // kop en streepjesregel

    // "`index.html` — analyse-flow" → alleen het pad tussen backticks telt.
    const paden  = [...m[1].matchAll(/`([^`]+)`/g)].map((x) => x[1]);
    const skills = [...m[2].matchAll(/`([^`]+)`/g)].map((x) => x[1]);
    if (paden.length && skills.length) rijen.push({ paden, skills, regel });
  }
  return rijen;
}

describe('de bijwerktabel in CLAUDE.md wijst naar bestaande dingen', () => {
  const rijen = leesSkillTabel();

  it('de tabel is gevonden en niet leeggelopen', () => {
    // Zonder deze controle zou een hernoemde kop de hele test stil groen maken —
    // precies de fout die hij moet voorkomen.
    expect(rijen.length).toBeGreaterThanOrEqual(7);
  });

  it.each(rijen)('$regel — elk pad bestaat', ({ paden }) => {
    for (const p of paden) {
      expect(fs.existsSync(path.join(wortel, p)), `${p} bestaat niet`).toBe(true);
    }
  });

  it.each(rijen)('$regel — elke skill heeft een SKILL.md', ({ skills }) => {
    for (const s of skills) {
      const bestand = path.join(wortel, '.claude', 'skills', s, 'SKILL.md');
      expect(fs.existsSync(bestand), `skill "${s}" heeft geen SKILL.md`).toBe(true);
    }
  });
});

describe('elke skill die bestaat, staat ook in de tabel', () => {
  // De andere kant op. Een skill die nergens aan een bestand hangt, wordt nooit door de
  // bijwerkregel geraakt en veroudert stil — hetzelfde gebrek, gespiegeld.
  it('geen skill zonder aanleiding om hem bij te werken', () => {
    const map = path.join(wortel, '.claude', 'skills');
    const aanwezig = fs.readdirSync(map, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(map, e.name, 'SKILL.md')))
      .map((e) => e.name);

    const genoemd = new Set(leesSkillTabel().flatMap((r) => r.skills));
    expect(aanwezig.filter((s) => !genoemd.has(s))).toEqual([]);
  });
});
