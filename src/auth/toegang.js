/**
 * src/auth/toegang.js — mag deze gebruiker een betaalde aanroep doen?
 *
 * ── WAAROM ──────────────────────────────────────────────────────────────────
 *
 * Tot 5 september 2026 was een geldige JWT genoeg. Geen enkel endpoint keek of de
 * gebruiker nog bij een kantoor hoorde, en `verwijder_gebruiker` schrapt alleen de rij in
 * `gebruikersprofiel` — het auth-account blijft bestaan.
 *
 * Een mediator die je uit je kantoor zet, houdt dus een werkende login. In de applicatie
 * ziet hij niets (RLS filtert op `mijn_organisatie_id()`, dat NULL geeft), maar de
 * endpoints die Claude aanroepen draaien gewoon door — op jouw rekening, en de meting
 * belandt bij geen enkel kantoor.
 *
 * Dat is geen theorie: het evalaccount deed zonder profielrij 246 analyses voor $16,58.
 *
 * ── HET ONDERSCHEID DAT HIER ALLES BEPAALT ──────────────────────────────────
 *
 * "Deze gebruiker hoort nergens bij" is iets anders dan "ik kon het even niet ophalen".
 * De eerste is een besluit van een beheerder en hoort geweigerd te worden. De tweede is
 * een storing bij Supabase, en daarop weigeren maakt van een hapering een uitval voor
 * iedereen tegelijk — precies op het moment dat er al iets stuk is.
 *
 * Vandaar: weigeren als vaststaat dát er geen profiel is, doorlaten als het onbekend is.
 * Dat laat een gat open, maar alleen tijdens een storing, en niemand kan die storing
 * uitlokken. `gebruikerContext` in api/_auth.js levert dat onderscheid aan.
 */

/** Wat `gebruikerContext` over het profiel kon vaststellen. */
export const PROFIEL = {
  GEVONDEN:       'gevonden',        // profielrij met een organisatie
  GEEN_PROFIEL:   'geen_profiel',    // opgehaald, geen rij — uit het kantoor verwijderd
  GEEN_ORG:       'geen_organisatie',// rij zonder organisatie_id
  ONBEKEND:       'onbekend',        // lookup mislukt, of geen service-sleutel
};

/**
 * @param {{gebruikerId?: string, organisatieId?: string|null, profielStatus?: string}|null} ctx
 * @returns {{toegestaan: boolean, http: number, reden: string, melding: string}}
 */
export function magApiGebruiken(ctx) {
  if (!ctx || !ctx.gebruikerId) {
    return {
      toegestaan: false, http: 401, reden: 'geen_geldige_sessie',
      melding: 'Niet geautoriseerd',
    };
  }

  if (ctx.profielStatus === PROFIEL.GEEN_PROFIEL || ctx.profielStatus === PROFIEL.GEEN_ORG) {
    return {
      toegestaan: false, http: 403, reden: ctx.profielStatus,
      // Wat de gebruiker hier leest hoort te kloppen én niet te verraden wat er intern
      // mis is. "Geen toegang" zonder meer laat iemand vergeefs opnieuw proberen.
      melding: 'Je account hoort niet (meer) bij een kantoor. Vraag de beheerder van je '
             + 'kantoor om je opnieuw uit te nodigen.',
    };
  }

  // ONBEKEND en GEVONDEN gaan allebei door; alleen het label bij de meting verschilt.
  return {
    toegestaan: true, http: 200,
    reden: ctx.profielStatus === PROFIEL.ONBEKEND ? 'profiel_onbekend' : 'ok',
    melding: '',
  };
}
