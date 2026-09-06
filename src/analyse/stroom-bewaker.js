/**
 * src/analyse/stroom-bewaker.js — de wandklokgrens van een lopende analyse
 *
 * ── AANLEIDING (6 september 2026) ───────────────────────────────────────────
 *
 * Een analyse liep vast op `POST /api/analyseer  net::ERR_SSL_PROTOCOL_ERROR`. Dát die
 * verbinding mislukte lag buiten onze code. Dát het scherm daarna oneindig op "Bezig met
 * juridische toets…" bleef staan, was van ons: de fetch had geen `AbortSignal` en de
 * leeslus geen tijdsgrens. Valt een stroom stil zonder te sluiten, dan blijft
 * `await reader.read()` eeuwig staan en komt de gebruiker er nooit achter.
 *
 * Exact dezelfde fout als bij de PDF-conversie op 29 augustus, en dezelfde regel geldt:
 * **een tijdsgrens is een wandklokgrens.** Hij telt alles mee — de opbouw van de
 * verbinding, het wachten op het eerste teken, en elke stilte daarna.
 *
 * ── TWEE GRENZEN, WANT ÉÉN IS NIET GENOEG ───────────────────────────────────
 *
 * Alleen een totaalgrens laat de gebruiker vijf minuten naar een draaiend rondje kijken
 * terwijl er al na tien seconden niets meer kwam. Alleen een stiltegrens laat een stroom
 * die traag maar gestaag druppelt eindeloos doorlopen. Daarom allebei:
 *
 *   TOTAAL_MS   het hele verzoek, ruim boven de 300s maxDuration van de server
 *   STILTE_MS   hoe lang er niets mag binnenkomen
 *
 * De stiltegrens kan zo scherp staan omdat de server elke 5 seconden `: keepalive`
 * stuurt (zie de kop van api/analyseer.js). Blijft dat 45 seconden uit, dan is er niets
 * meer aan de andere kant — dan wachten is zinloos.
 */

/** Ruim boven de maxDuration van 300s in vercel.json, zodat de server als eerste opgeeft. */
export const TOTAAL_MS = 330_000;

/** De server stuurt elke 5s een keepalive. Negen gemiste is genoeg bewijs. */
export const STILTE_MS = 45_000;

/**
 * Bewaakt één analyse-stroom.
 *
 * Gebruik:
 *   const bewaker = maakStroomBewaker();
 *   const res = await fetch(url, { signal: bewaker.signaal });
 *   … per binnengekomen stuk: bewaker.levensteken();
 *   … in een finally: bewaker.stop();
 *
 * @param {object} [opties]
 * @param {number} [opties.totaalMs]
 * @param {number} [opties.stilteMs]
 * @param {() => number} [opties.nu]      injecteerbaar voor tests
 * @param {(fn: Function, ms: number) => any} [opties.zetTimer]
 * @param {(id: any) => void} [opties.wisTimer]
 */
export function maakStroomBewaker({
  totaalMs = TOTAAL_MS,
  stilteMs = STILTE_MS,
  nu = () => Date.now(),
  zetTimer = setTimeout,
  wisTimer = clearTimeout,
} = {}) {
  const ctrl = new AbortController();
  const gestartOp = nu();
  let laatsteTeken = gestartOp;
  let reden = null;
  let stilteTimer = null;
  let totaalTimer = null;

  const afbreken = (waarom) => {
    if (reden) return;              // eerste reden wint; een tweede afbreking zegt niets
    reden = waarom;
    stop();
    ctrl.abort();
  };

  function stop() {
    if (stilteTimer !== null) { wisTimer(stilteTimer); stilteTimer = null; }
    if (totaalTimer !== null) { wisTimer(totaalTimer); totaalTimer = null; }
  }

  const herstartStilte = () => {
    if (stilteTimer !== null) wisTimer(stilteTimer);
    stilteTimer = zetTimer(() => afbreken('stilte'), stilteMs);
  };

  totaalTimer = zetTimer(() => afbreken('totaal'), totaalMs);
  herstartStilte();

  return {
    signaal: ctrl.signal,

    /** Aanroepen bij elk binnengekomen stuk: de stiltegrens begint opnieuw. */
    levensteken() {
      if (reden) return;
      laatsteTeken = nu();
      herstartStilte();
    },

    stop,

    /** `null` zolang er niets mis is, anders 'stilte' of 'totaal'. */
    get reden() { return reden; },

    /**
     * Wat de mediator te zien krijgt. Niet "Failed to fetch" — dat zegt hem niets en
     * verbergt of hij moet wachten of iets moet doen.
     */
    melding() {
      const sec = Math.round((nu() - gestartOp) / 1000);
      if (reden === 'stilte') {
        const stil = Math.round((nu() - laatsteTeken) / 1000);
        return `De verbinding met de server is weggevallen: er kwam ${stil} seconden niets meer `
             + `binnen. De analyse is afgebroken na ${sec} seconden. Probeer het opnieuw — `
             + 'er is niets opgeslagen dat niet klopt.';
      }
      if (reden === 'totaal') {
        return `De analyse duurde langer dan ${Math.round(totaalMs / 1000)} seconden en is `
             + 'afgebroken. Probeer het opnieuw, eventueel met minder documenten tegelijk.';
      }
      return '';
    },
  };
}
