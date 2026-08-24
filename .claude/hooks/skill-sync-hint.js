#!/usr/bin/env node
/**
 * skill-sync-hint.js
 * PostToolUse hook: wordt aangeroepen na elke Edit/Write.
 * Als het gewijzigde bestand onder een skill valt, print dit script
 * een korte herinnering die Claude in zijn tool-feedback ziet.
 *
 * Gebruik: automatisch via .claude/settings.json — niet handmatig aanroepen.
 *
 * Meldt via _meld.js: platte tekst op stdout bereikt niemand (zie daar).
 */

import { meld } from './_meld.js';

const SKILL_MAP = [
  {
    pattern: 'api/analyseer.js',
    skills: ['screening-categorien', 'document-model'],
    hint: 'Controleer of analyse-logica, issuevelden, ernst-waarden of kruisreferentie-gedrag veranderd zijn.',
  },
  {
    pattern: 'api/genereer-concept.js',
    skills: ['concept-generatie'],
    hint: 'Controleer of het server-side concept-pad, veldnamen of patch-algoritme veranderd zijn.',
  },
  {
    pattern: 'api/export-docx.js',
    skills: ['concept-generatie'],
    hint: 'Controleer of de DOCX-patcher (track-changes of schoon) veranderd is.',
  },
];

let raw = '';
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(raw);
    // Ondersteun zowel tool_input.file_path (Edit/Write) als andere vormen
    const filePath = (
      data.tool_input?.file_path ||
      data.tool_input?.path ||
      ''
    ).replace(/\\/g, '/');

    if (!filePath) { process.exit(0); }

    for (const { pattern, skills, hint } of SKILL_MAP) {
      if (filePath.endsWith(pattern)) {
        const skillList = skills.map(s => `'.claude/skills/${s}/SKILL.md'`).join(', ');
        meld(
          `[skill-sync] Bestand '${pattern}' valt onder skill(s): ${skillList}.\n` +
          `→ ${hint}\n` +
          `→ Update de skill als deze wijziging non-obvieuze kennis toevoegt of verandert.`
        );
        break;
      }
    }
    process.exit(0);
  } catch (_) {
    // Stil falen — nooit een tool-call blokkeren
    process.exit(0);
  }
});
