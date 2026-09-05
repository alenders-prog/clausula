/**
 * src/avg/bewaartermijn.js — hoe lang een brondocument in de opslag blijft
 *
 * ── WAAROM ──────────────────────────────────────────────────────────────────
 *
 * De AVG kent de opslagbeperking: persoonsgegevens niet langer bewaren dan nodig. Er was
 * geen enkel mechanisme dat een dossier, een screening of een geüpload bestand ooit
 * verwijderde (B3 in `docs/architectuurbeoordeling.md`).
 *
 * Voor de bestanden weegt dat zwaarder dan voor de rest. Alles in dit systeem is afgeleid —
 * rapport, classificatie, feiten — behálve de geüploade documenten: beide uploadpaden
 * sturen het bestand zoals de mediator het koos. Dat is de bron, en daarmee het waardevolste
 * doelwit. Een bewaartermijn verkleint wat er bij een volgende misconfiguratie op straat
 * ligt van "alles wat er ooit is geüpload" naar "wat er nu loopt" — en hij laat het
 * voordeel intact, want het rapport blijft.
 *
 * ── DE TERMIJN STOND ER AL ──────────────────────────────────────────────────
 *
 * `organisaties.retention_maanden` bestaat sinds `001_multitenancy.sql`, staat op 12, en
 * werd door niets gelezen. Gebouwd en nooit aangesloten — dezelfde vorm als `screening_id`
 * in `api_verbruik`. Deze module sluit hem aan; de waarde zelf is een besluit van het
 * kantoor en staat per organisatie in die kolom.
 *
 * ── WAT ER WEGGAAT EN WAT BLIJFT ────────────────────────────────────────────
 *
 * Alleen het bestand in de opslag. De screening, het rapport en de bevindingen blijven —
 * die zijn gepseudonimiseerd en dragen de waarde van het werk. Wat daarna niet meer kan is
 * het originele stuk inzien, downloaden en heranalyseren zonder opnieuw te uploaden.
 */

/** Maanden optellen bij een datum, met behoud van de dag waar dat kan. */
function plusMaanden(datum, maanden) {
  const d = new Date(datum.getTime());
  const doeldag = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + maanden);
  // 31 januari + 1 maand is in JavaScript 2 of 3 maart. Terugzetten naar de laatste dag van
  // de bedoelde maand, zodat een termijn nooit stiekem korter wordt dan hij zegt.
  if (d.getUTCDate() < doeldag) d.setUTCDate(0);
  return d;
}

/**
 * Wanneer een bestand dat op `geuploadOp` is geplaatst mag verdwijnen.
 * Geeft `null` als er geen bruikbare termijn of datum is — dan verwijdert er niets.
 */
export function vervalMoment(geuploadOp, retentionMaanden) {
  // Eerst op ontbreken toetsen, en pas daarna op een geldige datum. `new Date(null)` is
  // 1 januari 1970 — een geldige datum, en eentje waarvan élke termijn verstreken is. Zonder
  // deze regel zou een bestand waarvan de uploaddatum ontbreekt dus als eerste verdwijnen.
  if (geuploadOp === null || geuploadOp === undefined || geuploadOp === '') return null;
  const start = geuploadOp instanceof Date ? geuploadOp : new Date(geuploadOp);
  if (Number.isNaN(start.getTime())) return null;
  if (!Number.isFinite(retentionMaanden) || retentionMaanden < 1) return null;
  return plusMaanden(start, Math.floor(retentionMaanden));
}

/**
 * Is de termijn verstreken?
 *
 * Onbruikbare invoer geeft `false` en niet `true`. Een ontbrekende datum of een termijn van
 * nul hoort niets te laten verwijderen: bij een opruimactie is "weet ik niet" een reden om
 * te laten staan, niet om weg te gooien.
 */
export function isVerlopen(geuploadOp, retentionMaanden, nu = new Date()) {
  const verval = vervalMoment(geuploadOp, retentionMaanden);
  if (verval === null) return false;
  return nu.getTime() >= verval.getTime();
}

/**
 * Wat de mediator te zien krijgt als een brondocument niet meer op te halen is.
 *
 * Zonder dit staat er "Download mislukt: Object not found" — een melding waaruit niemand
 * kan opmaken of er iets stuk is of dat het systeem deed wat het hoort te doen. Die twee
 * horen niet hetzelfde te klinken.
 *
 * @param {{message?: string, statusCode?: string|number}} fout  de fout van Supabase Storage
 * @param {string|null} verwijderdOp  ISO-datum uit `rapport._bronbestanden_verwijderd_op`
 */
export function bronbestandMelding(fout, verwijderdOp = null) {
  const tekst = String(fout?.message ?? '');
  const weg = /not.?found|does not exist|niet gevonden/i.test(tekst)
    || String(fout?.statusCode ?? '') === '404';

  if (!weg) return `Download mislukt: ${tekst || 'onbekende fout'}`;

  if (verwijderdOp) {
    const d = new Date(verwijderdOp);
    const datum = Number.isNaN(d.getTime())
      ? String(verwijderdOp)
      : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
    return `Het originele document is op ${datum} verwijderd omdat de bewaartermijn was `
      + 'verstreken. Het rapport en de bevindingen blijven beschikbaar.';
  }

  return 'Het originele document staat niet meer in de opslag. Dat kan komen doordat de '
    + 'bewaartermijn is verstreken. Het rapport en de bevindingen blijven beschikbaar.';
}
