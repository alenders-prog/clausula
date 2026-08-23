/**
 * src/assistent/api-antwoord.js
 * Leest het antwoord van /api/ai-assistent uit — ook als dat geen JSON is.
 *
 * Aanleiding (23 augustus 2026): de assistent toonde regelmatig
 *
 *     Er is een fout opgetreden: Unexpected token 'A', "An error o"... is not valid JSON
 *
 * Dat is geen fout van de assistent maar van de JSON-parser. Alle acht aanroepen
 * deden `await resp.json()` zonder te kijken of er wel JSON tegenover stond. Loopt
 * de serverless functie over zijn tijdslimiet of crasht hij, dan stuurt Vercel een
 * platte foutpagina terug — die begint met "An error occurred with your deployment"
 * en de parser struikelt over de eerste letter.
 *
 * De gebruiker kreeg zo de binnenkant van de parser te zien in plaats van wat er
 * aan de hand was: de vraag duurde te lang. Dit bestand vertaalt het antwoord naar
 * één begrijpelijke zin, en houdt de technische code apart voor de console.
 */

/** Vercel zet zijn reden als losse hoofdletter-code in de body, bijv. FUNCTION_INVOCATION_TIMEOUT. */
export function platformCode(body) {
  return (String(body ?? '').match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,4}\b/) || [])[0] || '';
}

/**
 * Vertaalt een mislukt of onleesbaar antwoord naar een zin voor de gebruiker.
 *
 * @param {number} status  HTTP-status
 * @param {string} body    de ruwe body (niet-JSON, of JSON zonder bruikbare foutmelding)
 */
export function duidFout(status, body = '') {
  const code = platformCode(body);

  if (code === 'FUNCTION_INVOCATION_TIMEOUT' || status === 504)
    return 'De assistent deed er te lang over en is afgebroken. Stel de vraag korter, '
         + 'of splits hem op in twee vragen.';

  if (code === 'FUNCTION_PAYLOAD_TOO_LARGE' || status === 413)
    return 'De vraag is samen met de dossiercontext te groot om te versturen. '
         + 'Begin een nieuw gesprek of stel de vraag zonder dossier.';

  if (status === 401 || status === 403)
    return 'Je sessie is verlopen. Log opnieuw in en probeer het nog een keer.';

  if (status === 429)
    return 'Te veel vragen kort achter elkaar. Wacht even en probeer het opnieuw.';

  if (status === 502 || status === 503)
    return 'De assistent is even niet bereikbaar. Probeer het over een minuut opnieuw.';

  if (code === 'FUNCTION_INVOCATION_FAILED' || status >= 500)
    return 'De assistent liep vast bij het beantwoorden. Probeer het opnieuw.';

  if (status >= 400)
    return `De assistent kon de vraag niet verwerken (HTTP ${status}).`;

  // Status 200, maar geen bruikbare JSON — het antwoord is onderweg afgekapt.
  return 'Het antwoord kwam onvolledig binnen. Probeer het opnieuw.';
}

/**
 * Leest het antwoord uit en geeft het geparseerde object terug.
 * Gooit een Error met een begrijpelijke melding als dat niet lukt.
 *
 * Het gaat bewust via `resp.text()`: `resp.json()` gooit bij een platte foutpagina
 * een parser-melding die niets zegt, en de body is dan al verbruikt.
 */
export async function leesAntwoord(resp) {
  const ruw = await resp.text();

  let data = null;
  try { data = JSON.parse(ruw); } catch { /* geen JSON — zie hieronder */ }

  if (data && typeof data === 'object') {
    if (resp.ok) return data;
    throw new Error(data.error || duidFout(resp.status, ruw));
  }

  // Geen JSON: de melding komt van het platform, niet van de applicatie.
  console.error('[assistent] geen JSON van /api/ai-assistent',
    { status: resp.status, code: platformCode(ruw), body: ruw.slice(0, 300) });
  throw new Error(duidFout(resp.status, ruw));
}
