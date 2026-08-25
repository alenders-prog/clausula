/**
 * src/ui/traag-melder.js
 * Bepaalt wanneer een wachttoestand "langer dan gebruikelijk" duurt.
 *
 * Aanleiding (24 augustus 2026). Een mediator meldde tijdens een analyse: "er lijkt
 * nu niets meer te gebeuren". Er draaiden op dat moment gewoon animaties. Het
 * probleem was niet de vorm van het rondje maar het uitblijven van informatie: de
 * tekst stond al veertig seconden op hetzelfde, en een spinner die blijft draaien
 * zegt niet of hij nog ergens mee bezig is of vastzit.
 *
 * Vandaar deze meter. Hij kijkt niet naar de kloktijd sinds de start — een analyse
 * mág twee minuten duren — maar naar hoe lang de voortgang STILSTAAT.
 *
 * ── Wat als voortgang telt ──────────────────────────────────────────────────
 * Alleen een ANDERE melding. De SSE-lus stuurt "Bezig met analyseren…" bij elk
 * binnenkomend event opnieuw; vijf keer dezelfde zin is geen voortgang, en dat is
 * juist het geval waarin de mediator niets ziet gebeuren. Een veranderd percentage
 * telt wél: dat beweegt zichtbaar.
 *
 * De klok komt van buiten, zodat de tests hem kunnen vooruitzetten in plaats van
 * te wachten.
 */

export function maakTraagMelder({ drempelMs = 20_000, nu = () => Date.now() } = {}) {
  let laatste = null;     // { tekst, pct }
  let sinds   = nu();     // wanneer de voortgang voor het laatst veranderde
  let gemeld  = false;    // of de traagtoestand al is bereikt

  /** Twee meldingen zijn dezelfde als tekst én percentage gelijk zijn. */
  const zelfde = (a, b) =>
    a !== null && b !== null && a.tekst === b.tekst && a.pct === b.pct;

  return {
    /**
     * Voortgang melden. Geef pct mee als er een percentage is; een veranderd
     * percentage geldt als beweging, ook bij dezelfde tekst.
     * @returns {boolean} true als dit als voortgang telde
     */
    tik(tekst, pct = null) {
      const melding = { tekst: tekst ?? null, pct };
      if (zelfde(melding, laatste)) return false;
      laatste = melding;
      sinds   = nu();
      gemeld  = false;
      return true;
    },

    /**
     * @returns {{traag: boolean, stilMs: number, nieuw: boolean}}
     *   `nieuw` is één keer true, op het moment dat de drempel wordt gepasseerd —
     *   zodat de aanroeper de regel niet bij elke tik opnieuw laat verschijnen.
     */
    status() {
      const stilMs = nu() - sinds;
      const traag  = stilMs >= drempelMs;
      const nieuw  = traag && !gemeld;
      if (nieuw) gemeld = true;
      return { traag, stilMs, nieuw };
    },

    /** De laatste melding, voor wie er een zin omheen wil bouwen. */
    laatsteMelding() {
      return laatste ? { ...laatste } : null;
    },

    /** Opnieuw beginnen, bijvoorbeeld bij een volgende analyse. */
    herstart() {
      laatste = null;
      sinds   = nu();
      gemeld  = false;
    },
  };
}

/**
 * De zin die de mediator te zien krijgt.
 *
 * Bewust zonder geruststelling ("even geduld"): die zegt niets en klinkt alsof je
 * het probleem niet kent. Wél wat er gebeurt en hoelang het al zo staat, want dat
 * is precies de informatie die ontbrak.
 */
export function traagZin(stilMs, laatsteTekst) {
  const sec = Math.round(stilMs / 1000);
  const duur = sec < 90 ? `${sec} seconden` : `${Math.round(sec / 60)} minuten`;
  const wat = (laatsteTekst || '').replace(/^Bezig met /i, '').replace(/…$/, '');
  return wat
    ? `Dit duurt langer dan gebruikelijk — al ${duur} bezig met ${wat}.`
    : `Dit duurt langer dan gebruikelijk — al ${duur} geen voortgang.`;
}
