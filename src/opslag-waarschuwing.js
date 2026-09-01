/**
 * src/opslag-waarschuwing.js — staat wat er op het scherm staat ook in de database?
 *
 * Aanleiding (1 september 2026). Een mediator draaide een analyse, ging terug naar het
 * dossieroverzicht, en de analyse was weg. Uit de gegevens:
 *
 *   api_verbruik      vier fasen, alle vier geslaagd, 15:45:37 tot 15:47:30, $0,34
 *   screeningen       geen rij — de laatste dateert van 21 augustus
 *   Storage           geen bestand — het laatste dateert van 31 augustus
 *   dossiers          updated_at onveranderd, terwijl `opslaan()` dat als laatste stap
 *                     bijwerkt
 *
 * De analyse is dus gemaakt, betaald en nooit bewaard. Hij bestond alleen in dat tabblad.
 *
 * Twee dingen maakten dat mogelijk, los van wat de directe aanleiding was:
 *
 *  1. **Opslaan begint pas nadat het rapport op het scherm staat**, en duurt seconden
 *     (PDF's uploaden, versleutelen, invoegen). In dat raam is er niets dat een vertrek
 *     tegenhoudt. Het rapport is op dat moment het enige exemplaar.
 *  2. **Een mislukte opslag meldt zich in een grijze span** naast de conceptknoppen, en
 *     verdwijnt uit beeld zodra je wegklikt. Er is geen tweede kans en geen spoor.
 *
 * Deze module beantwoordt één vraag — mag de gebruiker hier weg? — zodat het antwoord
 * op één plek staat en getoetst is. Het tekenen en het daadwerkelijk tegenhouden hoort
 * bij de UI.
 */

/** Toestanden, in volgorde van ernst. */
export const VEILIG      = 'veilig';       // niets te verliezen
export const BEZIG       = 'bezig';        // opslaan loopt nu
export const MISLUKT     = 'mislukt';      // een poging is gestrand
export const ONOPGESLAGEN = 'onopgeslagen'; // een rapport dat nooit is weggeschreven

/**
 * @param {object} p
 * @param {boolean} p.heeftRapport   staat er een analyse op het scherm?
 * @param {string|null} p.screeningId het id waaronder hij is bewaard, of null
 * @param {boolean} p.bezig          loopt er op dit moment een opslagpoging?
 * @param {string} p.laatsteFout     foutmelding van de vorige poging, of ''
 * @returns {{toestand: string, melding: string}}
 */
export function opslagToestand({ heeftRapport, screeningId, bezig, laatsteFout } = {}) {
  if (bezig) {
    return {
      toestand: BEZIG,
      melding: 'De analyse wordt nog opgeslagen. Weggaan nu betekent dat hij verloren gaat.',
    };
  }
  if (!heeftRapport) return { toestand: VEILIG, melding: '' };

  if (laatsteFout) {
    return {
      toestand: MISLUKT,
      melding: `Deze analyse is NIET opgeslagen: ${laatsteFout}. `
             + 'Weggaan betekent dat hij verloren gaat — probeer eerst opnieuw op te slaan.',
    };
  }
  if (!screeningId) {
    return {
      toestand: ONOPGESLAGEN,
      melding: 'Deze analyse staat nog niet in het dossier. Weggaan betekent dat hij verloren gaat.',
    };
  }
  return { toestand: VEILIG, melding: '' };
}

/** Korte hulpvraag voor de aanroeper: mag er zonder vragen weggegaan worden? */
export function magWeg(toestand) {
  return (toestand?.toestand ?? toestand) === VEILIG;
}
