/**
 * De bijwerktabel uit CLAUDE.md, als enige bron.
 *
 * Het geval (12 september 2026). De tabel onder "## Skills bijhouden" stond op twee
 * plekken: in CLAUDE.md, bewaakt door tests/unit/skill-tabel.test.js, én als `SKILL_MAP`
 * in .claude/hooks/skill-sync-hint.js. Die tweede lijst dekte 3 van de 9 rijen, en twee
 * daarvan wezen naar `api/genereer-concept.js` en `api/export-docx.js` — bestanden die
 * niet bestaan en nooit hebben bestaan.
 *
 * Op 5 september waren die twee regels uit CLAUDE.md gehaald en afgedekt met een test.
 * In de kop van die test staat letterlijk dat hij de tabel uit CLAUDE.md leest "zodat er
 * geen tweede lijst ontstaat die óók kan verlopen". Die tweede lijst bestond toen al, in
 * de hook ernaast — precies vraag 1 uit CLAUDE.md ("wie doet dit nog meer?") die bij de
 * reparatie zelf niet was gesteld.
 *
 * Daarom staat de parser hier: de test en de hook lezen allebei hieruit, en een rij die
 * in CLAUDE.md wordt toegevoegd werkt vanaf dat moment in beide.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Leest de tabel onder "## Skills bijhouden" uit CLAUDE.md.
 *
 * @param {string} wortel  projectwortel
 * @returns {Array<{paden: string[], skills: string[], regel: string}>}
 */
export function leesSkillTabel(wortel) {
  const md = fs.readFileSync(path.join(wortel, 'CLAUDE.md'), 'utf8');
  return ontleedSkillTabel(md);
}

/**
 * Dezelfde ontleding, maar op een string — zodat er fixtures op te zetten zijn en de
 * parser aantoonbaar rood gaat op een kapotte tabel.
 *
 * @param {string} md  de volledige inhoud van CLAUDE.md
 */
export function ontleedSkillTabel(md) {
  const sectie = String(md).split('## Skills bijhouden')[1];
  if (!sectie) throw new Error('De sectie "## Skills bijhouden" staat niet meer in CLAUDE.md');

  const rijen = [];
  for (const regel of sectie.split('\n')) {
    const m = regel.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/);
    if (!m) continue;
    if (/^\s*-+\s*$/.test(m[1]) || /Gewijzigd bestand/i.test(m[1])) continue;  // kop en streepjesregel

    // "`index.html` — analyse-flow" → alleen het pad tussen backticks telt.
    const paden = [...m[1].matchAll(/`([^`]+)`/g)].map((x) => x[1]);
    const skills = [...m[2].matchAll(/`([^`]+)`/g)].map((x) => x[1]);
    if (paden.length && skills.length) rijen.push({ paden, skills, regel: regel.trim() });
  }
  return rijen;
}

/**
 * Welke skills horen bij een zojuist gewijzigd bestand?
 *
 * Een tabelpad dat op `/` eindigt is een map en matcht op "zit erin"; al het andere
 * matcht op het einde van het pad. `index.html` staat drie keer in de tabel (analyse-,
 * concept- en assistent-flow); die rijen worden samengevoegd tot één antwoord, anders
 * krijgt één edit drie meldingen en leer je ze wegklikken.
 *
 * @param {string} pad    het gewijzigde bestandspad (forward slashes)
 * @param {Array}  rijen  uitkomst van leesSkillTabel()
 * @returns {{skills: string[], regels: string[]}}  leeg als niets matcht
 */
export function skillsVoorPad(pad, rijen) {
  const genormaliseerd = String(pad).replace(/\\/g, '/');
  const skills = new Set();
  const regels = [];

  for (const rij of rijen) {
    const raak = rij.paden.some((p) => (p.endsWith('/')
      ? genormaliseerd.includes(p)
      : genormaliseerd.endsWith(p)));
    if (!raak) continue;
    regels.push(rij.regel);
    for (const s of rij.skills) skills.add(s);
  }
  return { skills: [...skills], regels };
}
