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
 *
 * > **Die tweede lijst bestond toen al.** Op 12 september 2026 bleek dat
 * > `.claude/hooks/skill-sync-hint.js` een eigen `SKILL_MAP` had met drie van de negen
 * > rijen — inclusief diezelfde twee dode paden, die daar dus gewoon waren blijven staan.
 * > De reparatie van 5 september had vraag 1 uit CLAUDE.md ("wie doet dit nog meer?")
 * > niet gesteld. De parser staat sindsdien in `src/skill-tabel.js` en de hook leest
 * > hem; de laatste describe hieronder bewaakt dat er geen derde lijst bij komt.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesSkillTabel, ontleedSkillTabel, skillsVoorPad } from '../../src/skill-tabel.js';

const wortel = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rijen = leesSkillTabel(wortel);

describe('de bijwerktabel in CLAUDE.md wijst naar bestaande dingen', () => {
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

    const genoemd = new Set(rijen.flatMap((r) => r.skills));
    expect(aanwezig.filter((s) => !genoemd.has(s))).toEqual([]);
  });
});

describe('de ontleding zelf', () => {
  // Fixtures, zodat aantoonbaar is dát hij rood gaat — niet alleen dat hij groen staat.
  const tabel = (...regels) => ['## Skills bijhouden', '', '| Gewijzigd bestand | Betrokken skill(s) |', '|---|---|', ...regels].join('\n');

  it('leest pad en skills uit een rij', () => {
    const uit = ontleedSkillTabel(tabel('| `api/x.js` | `skill-a`, `skill-b` |'));
    expect(uit).toHaveLength(1);
    expect(uit[0].paden).toEqual(['api/x.js']);
    expect(uit[0].skills).toEqual(['skill-a', 'skill-b']);
  });

  it('negeert de kop- en streepjesregel', () => {
    expect(ontleedSkillTabel(tabel())).toEqual([]);
  });

  it('pakt alleen wat tussen backticks staat, niet de toelichting erachter', () => {
    const uit = ontleedSkillTabel(tabel('| `index.html` — analyse-flow | `skill-a` |'));
    expect(uit[0].paden).toEqual(['index.html']);
  });

  it('gaat hard onderuit als de sectie verdwijnt', () => {
    // Liever een harde fout dan een lege lijst: een lege lijst is groen.
    expect(() => ontleedSkillTabel('# CLAUDE.md\n\nGeen tabel hier.')).toThrow();
  });
});

describe('skillsVoorPad', () => {
  const rijtjes = ontleedSkillTabel([
    '## Skills bijhouden', '', '| Gewijzigd bestand | Betrokken skill(s) |', '|---|---|',
    '| `api/analyseer.js` | `screening-categorien` |',
    '| `api/_prompts/` | `analyse-ontwerpbesluiten` |',
    '| `index.html` — analyse-flow | `screening-categorien` |',
    '| `index.html` — concept-flow | `concept-generatie` |',
  ].join('\n'));

  it('matcht een bestand op het einde van het pad', () => {
    expect(skillsVoorPad('C:/p/api/analyseer.js', rijtjes).skills).toEqual(['screening-categorien']);
  });

  it('matcht een map op "zit erin"', () => {
    expect(skillsVoorPad('/p/api/_prompts/gedeeld.js', rijtjes).skills).toEqual(['analyse-ontwerpbesluiten']);
  });

  it('voegt meerdere rijen voor hetzelfde bestand samen tot één antwoord', () => {
    // index.html staat drie keer in de echte tabel. Drie meldingen per edit leer je
    // wegklikken, en dan is de hook erger dan geen hook.
    const uit = skillsVoorPad('/p/index.html', rijtjes);
    expect(uit.skills).toEqual(['screening-categorien', 'concept-generatie']);
    expect(uit.regels).toHaveLength(2);
  });

  it('zwijgt over een bestand dat niet in de tabel staat', () => {
    expect(skillsVoorPad('/p/src/iets-anders.js', rijtjes).skills).toEqual([]);
  });

  it('werkt met backslashes uit Windows-paden', () => {
    expect(skillsVoorPad('C:\\p\\api\\analyseer.js', rijtjes).skills).toEqual(['screening-categorien']);
  });
});

describe('er is maar één bijwerktabel', () => {
  // Bronwachter. De hook hoort de tabel te lezen, niet er een naast te zetten — dat is
  // exact hoe de twee dode regels een week na hun verwijdering nog in werking waren.
  it('de hook heeft geen eigen regellijst', () => {
    const hook = fs.readFileSync(path.join(wortel, '.claude', 'hooks', 'skill-sync-hint.js'), 'utf8');
    expect(hook, 'skill-sync-hint.js heeft weer een eigen SKILL_MAP').not.toMatch(/SKILL_MAP\s*=/);
    expect(hook, 'skill-sync-hint.js leest de tabel niet uit src/skill-tabel.js').toMatch(/skill-tabel\.js/);
  });

  it('de hook noemt geen paden die niet in CLAUDE.md staan', () => {
    // De AANWIJZING-tabel in de hook is cosmetisch, maar een sleutel die nergens meer
    // bestaat is alsnog een dode regel — en dat is waar dit hele bestand over gaat.
    const hook = fs.readFileSync(path.join(wortel, '.claude', 'hooks', 'skill-sync-hint.js'), 'utf8');
    const blok = hook.split('const AANWIJZING = {')[1]?.split('};')[0] ?? '';
    const sleutels = [...blok.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]);
    const bekend = new Set(rijen.flatMap((r) => r.paden));

    const onbekend = sleutels.filter((s) => ![...bekend].some((p) => s === p || s.startsWith(p) || p.startsWith(s)));
    expect(onbekend, `AANWIJZING verwijst naar paden die niet in CLAUDE.md staan: ${onbekend.join(', ')}`).toEqual([]);
  });
});
