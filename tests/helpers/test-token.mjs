/**
 * tests/helpers/test-token.mjs
 * Bezorgt de eval een geldige Supabase-JWT.
 *
 * Waarom dit bestaat. Een Supabase-token verloopt binnen een uur. Zolang de eval
 * afhing van een met de hand geplakte `TEST_JWT_TOKEN`, was hij dus vrijwel altijd
 * stuk — en op een manier die eruitzag als een promptregressie: de endpoint gaf 401,
 * elke fixture faalde met "verwachte issues gevonden", en niemand las dat als "er is
 * niets geanalyseerd". Op 24 augustus 2026 bleek de token al sinds de 19e verlopen;
 * vijf dagen lang leverde de verplichte eval-run na een promptwijziging geen enkel
 * signaal op.
 *
 * Met TEST_EMAIL en TEST_PASSWORD in .env haalt de eval nu bij elke run zelf een
 * verse token op. TEST_JWT_TOKEN blijft werken als terugval — handig in CI, waar je
 * liever geen wachtwoord zet.
 */

import { readFileSync } from 'node:fs';

/** Leest .env in process.env, zoals de scripts in scripts/ dat ook doen. */
export function leesEnv(basis = new URL('../../.env', import.meta.url)) {
  try {
    for (const regel of readFileSync(basis, 'utf8').split('\n')) {
      if (!regel.includes('=') || regel.trim().startsWith('#')) continue;
      const i = regel.indexOf('=');
      const sleutel = regel.slice(0, i).trim();
      if (!process.env[sleutel]) process.env[sleutel] = regel.slice(i + 1).trim();
    }
  } catch { /* geen .env — dan moet de omgeving de variabelen leveren (CI) */ }
}

/**
 * Beoordeelt een JWT zonder hem te verifiëren: alleen vorm en vervaldatum.
 * @returns {{geldig: boolean, reden?: string, verlooptOver?: number}}
 *   `verlooptOver` is in seconden.
 */
export function beoordeelToken(token, nu = Date.now()) {
  const t = (token || '').trim();
  if (!t) return { geldig: false, reden: 'ontbreekt' };
  if (/^["']|["']$/.test(t)) {
    return { geldig: false, reden: 'staat tussen aanhalingstekens — die horen niet in .env' };
  }
  const delen = t.split('.');
  if (delen.length !== 3) return { geldig: false, reden: 'heeft geen JWT-vorm' };

  let claims;
  try {
    claims = JSON.parse(Buffer.from(delen[1], 'base64url').toString());
  } catch {
    return { geldig: false, reden: 'is niet te lezen als JWT' };
  }
  if (!claims.exp) return { geldig: true }; // geen exp-claim — laat de server oordelen

  const over = Math.round((claims.exp * 1000 - nu) / 1000);
  if (over <= 0) {
    return { geldig: false, reden: `is verlopen op ${new Date(claims.exp * 1000).toISOString()}` };
  }
  return { geldig: true, verlooptOver: over };
}

/**
 * Haalt een verse token op met e-mail en wachtwoord.
 * Aparte functie zodat de keuzelogica hieronder met een neptransport te toetsen is.
 */
export async function mintToken({ url, anonKey, email, wachtwoord, doeFetch = fetch }) {
  const res = await doeFetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey },
    body: JSON.stringify({ email, password: wachtwoord }),
  });
  const tekst = await res.text();
  if (!res.ok) {
    // De fouttekst van Supabase is kort en bruikbaar ("Invalid login credentials").
    let melding = tekst.slice(0, 160);
    try { melding = JSON.parse(tekst).error_description || JSON.parse(tekst).msg || melding; } catch { /* platte tekst */ }
    throw new Error(`inloggen mislukt (${res.status}): ${melding}`);
  }
  const token = JSON.parse(tekst).access_token;
  if (!token) throw new Error('inloggen gelukt maar geen access_token in het antwoord');
  return token;
}

/**
 * Levert een bruikbare token, of gooit met een melding die zegt wat er moet gebeuren.
 *
 * Volgorde: eerst inloggen met TEST_EMAIL/TEST_PASSWORD (altijd vers), anders de
 * handmatige TEST_JWT_TOKEN — mits die niet verlopen is.
 */
export async function haalToken(env = process.env, doeFetch = fetch) {
  const email       = (env.TEST_EMAIL || '').trim();
  const wachtwoord  = (env.TEST_PASSWORD || '').trim();
  const url         = (env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anonKey     = (env.SUPABASE_ANON_KEY || '').trim();

  if (email && wachtwoord) {
    if (!url || !anonKey) {
      throw new Error('TEST_EMAIL staat in .env maar SUPABASE_URL of SUPABASE_ANON_KEY ontbreekt.');
    }
    return mintToken({ url, anonKey, email, wachtwoord, doeFetch });
  }

  const oordeel = beoordeelToken(env.TEST_JWT_TOKEN);
  if (oordeel.geldig) return env.TEST_JWT_TOKEN.trim();

  throw new Error(
    `TEST_JWT_TOKEN ${oordeel.reden}, en er is geen TEST_EMAIL/TEST_PASSWORD om zelf in te loggen.\n`
    + 'Zet in .env een testaccount:\n'
    + '  TEST_EMAIL=eval@clausula.nl\n'
    + '  TEST_PASSWORD=<wachtwoord>\n'
    + 'Dan haalt de eval bij elke run zelf een verse token op. Zonder dit meet hij niets.',
  );
}
