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
- Twee issues die zeggen dat HETZELFDE ONDERWERP niet geregeld is, zijn ÉÉN issue — ook als de passages
  verschillen of leeg zijn, en ONGEACHT de formulering. Let niet op het woord maar op wat er beweerd wordt:
  "ontbreekt", "is niet uitgewerkt", "niet vastgelegd", "niet geregeld", "onvolledig geregeld" en
  "wordt niet genoemd" zijn allemaal dezelfde bewering. Ook een wettelijke naam naast een omschrijving
  van hetzelfde ("Informatieplicht (art. 1:377b BW)" naast "Informatie- en consultatieverplichting")
  wijst op één gebrek, niet op twee.
  Een gebrek heeft van nature geen eigen zin: de ene call laat 'passage' leeg, de andere wijst een naburige
  zin aan. De passage is hier dus geen bruikbaar onderscheid — het onderwerp wel.
  Vraag je bij elk paar af: zou een mediator hier één regel toevoegen, of twee? Eén regel → één issue.
  Houd het exemplaar met de wetsverwijzing, of anders dat met de hoogste ernst.

Bewaar issues die écht een ander probleem beschrijven of die samen meer informatie geven dan elk apart.
Bij twijfel: bewaar het issue.
Geef ALTIJD minimaal één index terug.`;
