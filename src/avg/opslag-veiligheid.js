/**
 * src/avg/opslag-veiligheid.js — mag deze opslag de bestaande rij overschrijven?
 *
 * ── AANLEIDING (6 september 2026) ───────────────────────────────────────────
 *
 * Een screening stond gepseudonimiseerd in de database — de eerste ooit. Twintig minuten
 * later stond de volledige documenttekst er weer in, met echte namen, zonder dat er iets
 * was misgegaan waar iemand op klikte.
 *
 * De keten: `laadScreening` ontsleutelt de namenkaart en herbouwt daarmee `huidigeNaarAnon`,
 * maar alléén als `/api/naam-decrypt` slaagt. Faalt die aanroep — en dat gebeurde die dag
 * herhaaldelijk door een instabiele verbinding — dan blijft die kaart leeg terwijl het
 * rapport in het geheugen wél de echte namen draagt. De eerstvolgende opslag schrijft dan
 * de onbewerkte versie over de beveiligde rij heen.
 *
 * ── DE REGEL ────────────────────────────────────────────────────────────────
 *
 * Stond er een namenkaart op de rij, dan is die rij gepseudonimiseerd opgeslagen. Kunnen
 * we op dit moment niet pseudonimiseren, dan is élke schrijfactie op rapport,
 * classificatie of bestandsnaam een verslechtering. Dan liever niet opslaan.
 *
 * Dat kost hooguit een afvinkje dat opnieuw gezet moet worden. Het alternatief kost de
 * pseudonimisering van een heel dossier, en dat is niet terug te draaien zonder de
 * namenkaart — die er dan juist niet is.
 *
 * ── WAT DIT NIET IS ─────────────────────────────────────────────────────────
 *
 * Geen slot op nieuwe analyses. Een verse analyse heeft nog geen rij en dus geen
 * namenkaart om te beschermen; die slaat gewoon op. En een oude screening van vóór de
 * pseudonimisering (geen namenkaart op de rij) mag ook gewoon bijgewerkt worden — daar
 * valt niets te verslechteren.
 */

/**
 * @param {object} toestand
 * @param {boolean} toestand.rijHadNamenkaart  had de geladen screening een `namen_map`?
 * @param {boolean} toestand.kanPseudonimiseren  is er nu een namenkaart in het geheugen?
 * @param {boolean} [toestand.isNieuweAnalyse]  nog geen rij in de database
 * @returns {{toegestaan: boolean, reden: string, melding: string}}
 */
export function beoordeelOpslag({
  rijHadNamenkaart = false,
  kanPseudonimiseren = false,
  isNieuweAnalyse = false,
} = {}) {
  if (isNieuweAnalyse || !rijHadNamenkaart || kanPseudonimiseren) {
    return { toegestaan: true, reden: 'ok', melding: '' };
  }
  return {
    toegestaan: false,
    reden: 'zou_pseudonimisering_verliezen',
    melding: 'Opslaan is tegengehouden. De namen van dit dossier konden niet worden '
           + 'ontsleuteld, waardoor opslaan de beveiligde versie zou overschrijven met '
           + 'onbeschermde tekst. Herlaad de pagina en probeer het opnieuw; je '
           + 'wijzigingen sinds het openen gaan dan verloren.',
  };
}
