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

// ── Bekend openstaand punt (25-08-2026) ─────────────────────────────────────
//
// In sample-output-convenant.json staan twee kaarten over dezelfde verwijzing naar
// 'artikel 3.1.1', bijna woordelijk gelijk, uit twee verschillende analyse-calls.
// De regel hieronder ("Twee issues die zeggen dat HETZELFDE ONDERWERP niet geregeld
// is, zijn ÉÉN issue") had dat moeten vangen en vuurde niet.
//
// Niet gerepareerd, en dat is een besluit. Het is één dubbeling op 119 bevindingen
// uit zes rapporten; alles wat er verder dubbel uitzag bleek dat niet te zijn. De
// drie kaarten over een ontbrekende ',-' wijzen naar drie verschillende bedragen op
// drie plekken, elk met een eigen correctie en een eigen aanklikbare passage —
// samenvoegen zou twee vindplaatsen onbereikbaar maken.
//
// De volledige meting (vier kandidaat-signalen, alle vier ondeugdelijk) staat in
// tests/golden/schema.test.js bij de dedup-meting. Begin daar voor je hier iets
// verzint; het scheelt een halve dag signalen toetsen die al getoetst zijn.
//
// ── Waarom hier geen deterministische deduplicatie onder staat ───────────────
//
// De consolidatie merget dubbelingen onbetrouwbaar. Twee kaarten voor één gebrek
// bleven staan, ook na twee herformuleringen van de regels hieronder — gemeten
// op 24 augustus 2026 met twee controleruns: "informatieplicht dubbel" gaf 2 en 2.
//
// Het lag voor de hand dat in code te doen: woordoverlap tussen de titels, zoals
// tests/helpers/eval-baseline.mjs die al berekent. Dat is gemeten en het werkt niet.
//
//     echte dubbeling   "Informatie- en consultatieverplichting"
//                     ≈ "Informatieplicht (art. 1:377b BW)"          0,40
//     VERSCHILLEND      "Ingangsdatum kinderalimentatie"
//                     ≈ "Ingangsdatum partneralimentatie"            0,50
//     VERSCHILLEND      verjaardagen ≈ spaartegoed                   0,33
//
// Het valse paar scoort hóger dan het echte. Er is dus geen drempel die ze
// scheidt: elke instelling die de dubbele informatieplicht samenvoegt, voegt ook
// kinder- en partneralimentatie samen. Dat kost een echte bevinding uit het
// rapport van de mediator — onzichtbaar, terwijl een dubbele kaart hooguit
// hinderlijk is. Bij die afweging is niets doen beter.
//
// Wat er wél toe zou doen is het ONDERWERP vergelijken, en dat vraagt betekenis,
// geen tekenreeksen. Dat is precies de vraag die hieronder aan het model wordt
// gesteld. Probeer je het opnieuw: meet eerst of je kandidaatparen überhaupt te
// vinden zijn, en herhaal elke meting minstens twee keer — de ruisvloer van deze
// eval is 8 tot 10 bevindingen per fixture.

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

NOOIT SAMENVOEGEN — een tegenstrijdigheid is nooit hetzelfde als een gemis:
Een issue dat zegt dat twee plekken elkaar TEGENSPREKEN (twee verschillende bedragen, nummers,
datums of namen voor hetzelfde ding — in de hoofdtekst en een bijlage, of in twee artikelen)
beschrijft iets anders dan een issue dat zegt dat er over dat onderwerp iets ONTBREEKT of
niet geregeld is. Ook al gaan ze over dezelfde hypotheek, dezelfde woning of hetzelfde
pensioen: bewaar ze allebei. De regel hierboven over "hetzelfde onderwerp niet geregeld"
geldt uitsluitend tussen twee gemis-issues.
Een tegenstrijdigheid noemt een concreet gegeven dat de mediator moet nakijken; verdwijnt die
in een algemener issue over hetzelfde onderwerp, dan is dat gegeven weg zonder dat iemand het
kan zien.

Bewaar issues die écht een ander probleem beschrijven of die samen meer informatie geven dan elk apart.
Bij twijfel: bewaar het issue.
Geef ALTIJD minimaal één index terug.`;
