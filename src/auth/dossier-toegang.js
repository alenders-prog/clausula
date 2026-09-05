/**
 * src/auth/dossier-toegang.js — mag deze beller dit dossier lezen?
 *
 * ── AANLEIDING ──────────────────────────────────────────────────────────────
 *
 * Gevonden op 5 september 2026 bij het tegendraads doorlezen van de vier endpoints die op
 * de SERVICE_ROLE-sleutel draaien. `api/ai-assistent.js` deed dit:
 *
 *     const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
 *     …
 *     .from('screeningen').select('classificatie, rapport')
 *     .eq('dossier_id', dossierId)          // dossierId kwam uit req.body
 *
 * De service-role omzeilt RLS, en er stond geen organisatiefilter. Een ingelogde
 * gebruiker van kantoor A kon dus het `dossier_id` van kantoor B meesturen en het profiel
 * van dat dossier terugkrijgen: relatievorm, kinderen, eigen woning, huwelijksdatum als
 * maand-jaar, de leeftijd van beide partijen, en beide nationaliteiten exact. Geen namen —
 * die belanden nooit in `serverFields` — maar wel een aardig herleidbaar profiel.
 *
 * `_ctx.organisatieId` was op dat moment al opgehaald. Hij werd alleen gebruikt om
 * verbruik te tellen.
 *
 * ── WAAROM DIT EEN EIGEN MODULE IS ──────────────────────────────────────────
 *
 * De bescherming van de opgeslagen gegevens rust volgens de skill `avg-beleid` op
 * "eigen database, RLS per organisatie" — dat is de reden dat ruwe waarden bij opslag
 * mogen blijven staan. Elk endpoint dat de service-role pakt, haalt die reden weg en moet
 * de afscherming dus zélf doen. Zoiets hoort niet als losse regel in een handler van
 * 1114 regels te staan waar niemand er een test op kan zetten.
 *
 * ── FAIL-CLOSED, EN WAAROM DAT HIER GEEN DETAIL IS ──────────────────────────
 *
 * `gebruikerContext()` levert `organisatieId: null` op wanneer het opzoeken van het
 * profiel mislukt — die `catch` in `api/_auth.js` schrijft een waarschuwing en gaat door.
 * Een filter dat bij `null` "geen filter" betekent, geeft dan juist iedereen toegang tot
 * alles, precies op het moment dat er iets stuk is.
 *
 * Daarom: **geen organisatie bekend is geen toegang.** Dat is de tak die in de tests
 * apart staat, want het is de tak die in productie het zwaarst weegt en die je nooit
 * met de hand tegenkomt.
 */

/**
 * Haalt de meest recente screening van een dossier op, maar alleen als dat dossier
 * bij de organisatie van de beller hoort.
 *
 * @param {object} db             Supabase-client (mag de service-role zijn; deze functie
 *                                doet de afscherming die RLS dan niet meer doet)
 * @param {object} p
 * @param {string|null} p.dossierId       uit het verzoek — nooit vertrouwd
 * @param {string|null} p.organisatieId   uit gebruikerContext(), serverkant afgeleid
 * @param {string} [p.velden]     kolommen; standaard alleen `classificatie`.
 *                                Bewust niet `rapport`: dat werd wel opgehaald en nooit
 *                                gebruikt, en het is het veld van ~130 KB met de
 *                                documenttekst erin.
 * @returns {Promise<object|null>} de screening, of null als er geen toegang of geen rij is
 */
export async function screeningVoorDossier(db, { dossierId, organisatieId, velden = 'classificatie' }) {
  if (!dossierId || !organisatieId) return null;

  // Eerst de eigendomsvraag, dan pas de gegevens. Andersom zou de screening al in het
  // geheugen staan voordat vaststaat of hij gelezen mag worden.
  const { data: dossiers, error: dosFout } = await db
    .from('dossiers')
    .select('id')
    .eq('id', dossierId)
    .eq('organisatie_id', organisatieId)
    .limit(1);

  // Een fout bij de eigendomscontrole is geen toestemming.
  if (dosFout || !dossiers?.[0]) return null;

  const { data: rijen, error: scrFout } = await db
    .from('screeningen')
    .select(velden)
    .eq('dossier_id', dossierId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (scrFout) return null;
  return rijen?.[0] ?? null;
}
