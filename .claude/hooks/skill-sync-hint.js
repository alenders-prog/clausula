#!/usr/bin/env node
/**
 * skill-sync-hint.js
 * PostToolUse hook: wordt aangeroepen na elke Edit/Write. Valt het gewijzigde bestand
 * onder de bijwerktabel in CLAUDE.md, dan print dit script een korte herinnering die
 * Claude in zijn tool-feedback ziet.
 *
 * Gebruik: automatisch via .claude/settings.json — niet handmatig aanroepen.
 *
 * Meldt via _meld.js: platte tekst op stdout bereikt niemand (zie daar).
 *
 * DE TABEL STAAT NIET HIER. Tot 12 september 2026 had deze hook zijn eigen `SKILL_MAP`
 * met drie van de negen rijen, waarvan er twee naar bestanden wezen die nooit hebben
 * bestaan. De zes rijen die er niet in stonden gingen dus nooit af, en de twee dode
 * rijen ook niet — zonder dat daar iets van te zien was. Sindsdien leest hij
 * src/skill-tabel.js, net als tests/unit/skill-tabel.test.js, zodat er één lijst is.
 */

import { fileURLToPath } from 'node:url';
import { meld } from './_meld.js';
import { leesSkillTabel, skillsVoorPad } from '../../src/skill-tabel.js';

const WORTEL = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Extra aanwijzing per pad — puur cosmetisch.
 *
 * Dit is géén tweede regellijst: ontbreekt er een aanwijzing, dan gaat de melding gewoon
 * af met de algemene tekst. Er kan hier dus niets stil verdwijnen. Wat hier staat maakt
 * de melding concreet, en dat is het verschil tussen een hook die je leest en een hook
 * die je wegklikt.
 */
const AANWIJZING = {
  'api/analyseer.js': 'Controleer of analyse-logica, issuevelden, ernst-waarden of kruisreferentie-gedrag veranderd zijn.',
  'api/claude-edge.js': 'Controleer of de streaming-vorm, de separators of de conceptregels veranderd zijn.',
  'api/adobe-result.js': 'Controleer of de DOCX-nabewerking (fixDocxArtifacts) veranderd is.',
  'api/ai-assistent.js': 'Controleer of het commandomodel, de kennisbank-injectie of de issue-flow veranderd zijn.',
  'src/naam-anonimiseer.js': 'Controleer of de pseudonimisering of de namenpools veranderd zijn.',
  'index.html': 'Controleer welke flow je hebt geraakt — analyse, concept of assistent — en of die kennis nog klopt.',
};

function aanwijzingVoor(pad) {
  const sleutel = Object.keys(AANWIJZING).find((p) => pad.endsWith(p));
  return sleutel ? AANWIJZING[sleutel] : 'Controleer of deze wijziging non-obvieuze kennis raakt die in de skill staat.';
}

let raw = '';
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(raw);
    const pad = (data.tool_input?.file_path || data.tool_input?.path || '').replace(/\\/g, '/');
    if (!pad) { process.exit(0); }

    const { skills } = skillsVoorPad(pad, leesSkillTabel(WORTEL));
    if (skills.length === 0) { process.exit(0); }

    const lijst = skills.map((s) => `'.claude/skills/${s}/SKILL.md'`).join(', ');
    meld(
      `[skill-sync] Dit bestand valt onder skill(s): ${lijst}.\n`
      + `→ ${aanwijzingVoor(pad)}\n`
      + '→ Update de skill als deze wijziging non-obvieuze kennis toevoegt of verandert.\n'
      + '→ Wijkt de code af van de skill, meld dat dan expliciet in plaats van er één stil aan te passen.',
    );
    process.exit(0);
  } catch (_) {
    // Stil falen — nooit een tool-call blokkeren.
    process.exit(0);
  }
});
