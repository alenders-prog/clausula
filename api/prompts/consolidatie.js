/**
 * api/prompts/consolidatie.js — system prompt van de deduplicatiestap
 *
 * Draait op Haiku en kiest welke issues blijven staan; herschrijft geen tekst.
 *
 * WIJZIGEN RAAKT DE SCREENINGKWALITEIT. Draai na elke aanpassing
 * `npm run test:eval` en vergelijk met de baseline — zie docs/auto-test-setup.md,
 * punt D10. Raak spelling en witruimte niet zonder reden aan: de gedeelde blokken
 * worden byte-exact door Anthropic gecachet, dus elke wijziging kost eenmalig een
 * volledige cache-miss op alle lopende analyses.
 */

export const SYS_CONSOLIDATIE =
`Je analyseert een genummerde lijst van juridische issues uit een echtscheidingsdocument.
De lijst bevat issues uit meerdere analyse-calls (structuur, bevindingen, cross-document) die hetzelfde probleem soms dubbel rapporteren.

Taak: verwijder semantisch identieke of sterk overlappende issues.
Merge-criteria (verwijder het issue met de lagere ernst of lagere juridische prioriteit):
- Zelfde passage + zelfde kernprobleem, ook al verschillen de woorden van de titel.
  Issues die dezelfde zin aanwijzen zijn gemarkeerd met "← ZELFDE PASSAGE als [n]".
  Beoordeel bij zo'n paar altijd expliciet: is dit één gebrek in twee bewoordingen,
  of zijn het twee verschillende gebreken die toevallig in dezelfde zin staan?
  Eén gebrek → houd het meest informatieve exemplaar. Twee gebreken → bewaar beide.
- Per-document issue en cross-document issue over hetzelfde concrete feit (bijv. zelfde IBAN, zelfde tegenstrijdigheid, zelfde ontbrekend veld).
- Twee dimensie-varianten van hetzelfde probleem (bijv. "onvolledig" én "onvolledige zin" over exact dezelfde passage).

Bewaar issues die écht een ander probleem beschrijven of die samen meer informatie geven dan elk apart.
Bij twijfel: bewaar het issue.
Geef ALTIJD minimaal één index terug.`;
