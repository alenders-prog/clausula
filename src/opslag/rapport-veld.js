/**
 * src/opslag/rapport-veld.js — één veld in `screeningen.rapport` bijwerken zonder de rest
 * te verliezen
 *
 * ── AANLEIDING (8 september 2026) ───────────────────────────────────────────
 *
 * Een mediator heropende een dossier en de PDF was weg. Wat er was gebeurd: de vier
 * documenten waren om 08:42 keurig geüpload en in `rapport._document_bestanden` vastgelegd;
 * om 08:52 schreef een andere codepad het rapport opnieuw weg, zonder dat veld. Ook
 * `_teksten_per_pad` en `_analyse_run_id` waren verdwenen — álles met een liggend streepje.
 *
 * De acht PDF's stonden daarna verweesd in Storage: niets verwees er nog naar, en juist dat
 * veld is wat `storagePadenVanScreening()` gebruikt om ze bij het verwijderen van een
 * dossier op te ruimen. Documenten met persoonsgegevens die niet meer te vinden zijn om
 * weg te gooien.
 *
 * Er bleken VIJF plekken die naar diezelfde kolom schreven. Eén ervan — `opslaan()` —
 * bouwde zorgvuldig een compleet, gepseudonimiseerd rapport op. De andere vier schreven
 * simpelweg `app.rapport` weg, en verloren wat daar op dat moment niet in zat.
 *
 * ── WAT DEZE MODULE AFDWINGT ────────────────────────────────────────────────
 *
 * Wie één onderdeel van het rapport wil bijwerken — een concept, een issue erbij — schrijft
 * niet het hele object. Hij begint bij wat er in de database stáát en vervangt daar precies
 * één sleutel in. Wat hij niet aanraakt, kan hij ook niet kwijtraken.
 *
 * Drie weigeringen, en alle drie zijn er om een stille ramp te voorkomen:
 *
 *   1. **Geen bewaard rapport gelezen** → niets schrijven. Zou je bij een mislukte
 *      leesactie toch doorgaan, dan schrijf je `{ veld: waarde }` over een compleet
 *      rapport heen en is álles weg in plaats van één veld.
 *   2. **Een veld dat niet op de lijst staat** → weigeren. De lijst is kort met opzet: dit
 *      is een achterdeur voor deelupdates, geen tweede opslagroute.
 *   3. **Een ongedefinieerde waarde** → weigeren. Dat is bijna altijd een fout aan de
 *      aanroepkant, en het resultaat zou een veld zijn dat er wel is maar niets betekent.
 *
 * ── WAT DEZE MODULE NIET DOET ───────────────────────────────────────────────
 *
 * Pseudonimiseren. Dat gebeurt bij de aanroeper, want daar zit de namenkaart. Wat hier
 * binnenkomt hoort al pseudoniem te zijn — het bewaarde rapport is dat namelijk óók, en
 * een half-gepseudonimiseerd rapport is erger dan geen: dan staan er echte namen in een
 * kolom waarvan iedereen aanneemt dat ze er niet staan.
 *
 * `tests/unit/rapport-veld.test.js` bewaakt dat elke schrijfactie naar deze kolom door deze
 * deur gaat, met een expliciete lijst van uitzonderingen.
 */

/**
 * Welke sleutels via een deelupdate mogen worden bijgewerkt.
 *
 * `_concepts` — de gegenereerde conceptteksten per documenttype.
 * `issues`    — de bevindingenlijst, waar de assistent een clausule aan toevoegt.
 *
 * Kort houden. Alles wat de analyse zelf oplevert hoort via `opslaan()` te gaan, dat de
 * uploads, de namenkaart en de feitregels meeneemt.
 */
export const DEELBARE_VELDEN = Object.freeze(['_concepts', 'issues']);

/**
 * Bouwt het rapport zoals het weggeschreven moet worden.
 *
 * @param {object} opgeslagen  het rapport zoals het NU in de database staat
 * @param {string} veld        de sleutel die verandert
 * @param {*}      waarde      de nieuwe waarde, al gepseudonimiseerd
 * @returns {object}           het volledige rapport met alleen dat veld vervangen
 * @throws als er niets veiligs te schrijven valt — zie de kop van dit bestand
 */
export function bouwRapportUpdate(opgeslagen, veld, waarde) {
  if (!opgeslagen || typeof opgeslagen !== 'object' || Array.isArray(opgeslagen)) {
    throw new Error('rapport-veld: geen bewaard rapport gelezen — niet schrijven, '
      + 'anders vervangt deze deelupdate het hele rapport');
  }
  if (!DEELBARE_VELDEN.includes(veld)) {
    throw new Error(`rapport-veld: '${veld}' mag niet via een deelupdate — `
      + `toegestaan zijn ${DEELBARE_VELDEN.join(', ')}`);
  }
  if (waarde === undefined) {
    throw new Error(`rapport-veld: geen waarde voor '${veld}'`);
  }
  return { ...opgeslagen, [veld]: waarde };
}
