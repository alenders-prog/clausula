/**
 * src/auth/mfa-beleid.js — wie moet tweefactorauthenticatie hebben, en wat nu?
 *
 * De AVG schrijft 2FA nergens voor. Artikel 32 vraagt "passende maatregelen" naar
 * risico, en dat risico is hier hoog: BSN, IBANs, alimentatieberekeningen, gegevens
 * van minderjarigen en soms gezondheidsgegevens uit een ouderschapsplan. Bovendien is
 * de opzet multi-tenant — één gecompromitteerd account is niet één dossier maar een
 * heel kantoor, en bij een beheerder met de knop "heel het kantoor" is dat letterlijk
 * alles. Daar komt de geheimhoudingsplicht uit het MfN-reglement nog los bovenop.
 *
 * Vandaar: verplicht voor beheerders, aangeraden voor de rest.
 *
 * Waarom deze afweging in een module en niet in de inlogpagina: hij wordt op drie
 * plekken gesteld (inloggen, opstarten van de app, instellingenscherm) en moet daar
 * hetzelfde antwoord geven. Drie kopieën van een beveiligingsregel is er twee te veel.
 */

/** Rollen die niet zonder tweede factor mogen. `gebruiker` = mediator. */
export const ROLLEN_MET_VERPLICHTE_MFA = new Set(['admin']);

/**
 * Alleen bevestigde factoren tellen.
 *
 * Supabase geeft een factor terug zodra `enroll()` is aangeroepen — dus óók als de
 * gebruiker het scherm heeft weggeklikt zonder ooit een code in te voeren. Die factor
 * heeft status 'unverified' en kan niets: er valt geen challenge mee te doen. Tellen we
 * hem toch mee, dan denkt de app dat 2FA aanstaat terwijl de gebruiker alleen een
 * wachtwoord heeft — precies de fout die een beveiligingsmaatregel geruisloos uitzet.
 */
export function bevestigdeFactoren(factoren) {
  if (!Array.isArray(factoren)) return [];
  return factoren.filter(f => f && f.status === 'verified');
}

/** Bevestigde TOTP-factoren — voor het instellingenscherm, dat alleen TOTP aanbiedt. */
export function bevestigdeTotp(factoren) {
  return bevestigdeFactoren(factoren).filter(f => f.factor_type === 'totp');
}

export function mfaVerplicht(rol) {
  return ROLLEN_MET_VERPLICHTE_MFA.has(String(rol || '').toLowerCase());
}

/**
 * Wat moet er nu gebeuren?
 *
 * @param {object} opties
 * @param {string} opties.rol        'admin' of 'gebruiker'
 * @param {Array}  opties.factoren   uit `supabase.auth.mfa.listFactors()` — `all`
 * @param {object} opties.aal        uit `getAuthenticatorAssuranceLevel()`
 * @returns {{stap: string, blokkeert: boolean, reden: string}}
 *
 * stap:
 *   'code_invoeren'        — er is een bevestigde factor maar de sessie staat op aal1
 *   'instellen_verplicht'  — geen factor en de rol vereist er een
 *   'instellen_aanbevolen' — geen factor, rol vereist niets; wel aanraden
 *   'ok'                   — niets te doen
 */
export function bepaalMfaStap({ rol, factoren, aal } = {}) {
  const bevestigd = bevestigdeFactoren(factoren);
  const huidig    = aal?.currentLevel ?? 'aal1';

  // Bewust op `currentLevel` en niet op `nextLevel`. Beide komen uit dezelfde bron,
  // maar nextLevel is een afgeleide: hij wordt 'aal2' omdat er een factor bestaat.
  // Lopen ze ooit uiteen — een factor die net is verwijderd, een token uit de cache —
  // dan is "de sessie staat nog niet op aal2 terwijl er een factor is" het veilige
  // oordeel, en "er is geen tweede stap nodig" het onveilige.
  if (bevestigd.length > 0) {
    if (huidig === 'aal2') {
      return { stap: 'ok', blokkeert: false, reden: 'Tweede factor is al bevestigd in deze sessie.' };
    }
    return {
      stap: 'code_invoeren',
      blokkeert: true,
      reden: 'Er staat een authenticator ingesteld; voer de zescijferige code in.',
    };
  }

  if (mfaVerplicht(rol)) {
    return {
      stap: 'instellen_verplicht',
      blokkeert: true,
      reden: 'Beheerders hebben toegang tot alle dossiers van het kantoor. '
           + 'Een tweede factor is voor die rol verplicht.',
    };
  }

  return {
    stap: 'instellen_aanbevolen',
    blokkeert: false,
    reden: 'Deze dossiers bevatten BSN, rekeningnummers en gegevens van kinderen. '
         + 'Een authenticator-app kost twee minuten en voorkomt dat één uitgelekt '
         + 'wachtwoord genoeg is.',
  };
}

/**
 * Leest de foutmelding van Supabase om bij een afgekeurde code.
 *
 * De letterlijke tekst is "Invalid TOTP code entered", en die zegt een mediator niets
 * over de meest voorkomende oorzaak: de code is dertig seconden geldig en de klok van
 * de telefoon loopt uit de pas. Dat hoort in de melding te staan, anders probeert
 * iemand het drie keer met dezelfde verlopen code.
 */
/**
 * Fouten bij het INSCHRIJVEN — een andere klasse dan een afgekeurde code.
 *
 * Aanleiding (26 augustus 2026): het beveiligingstabblad meldde "Verifiëren is niet
 * gelukt. Probeer het opnieuw." Dat is de vangnettekst van `mfaFoutTekst`, die ik ook
 * op inschrijffouten had losgelaten. Gevolg: de werkelijke melding van Supabase werd
 * weggegooid en de gebruiker kon eindeloos opnieuw proberen zonder ooit te horen wat
 * er aan de hand was.
 *
 * Deze functie herkent de twee gevallen die echt voorkomen en geeft in álle andere
 * gevallen de oorspronkelijke melding door. Een foutvertaler die de bron verbergt is
 * erger dan geen foutvertaler.
 */
export function mfaInschrijfFoutTekst(fout) {
  const bericht = String(fout?.message || fout || '').trim();

  if (/friendly.?name.*already exists|already exists/i.test(bericht)) {
    return 'Er stond nog een half afgeronde instelling open. Die is nu opgeruimd — '
         + 'klik nogmaals op "Instellen".';
  }
  if (/mfa.*disabled|not enabled|unsupported/i.test(bericht)) {
    return 'Tweefactorauthenticatie staat uit in de Supabase-projectinstellingen. '
         + 'Zet TOTP aan onder Authentication → Multi-Factor Authentication.';
  }
  // Alles wat we niet kennen: letterlijk doorgeven. Liever een technische zin die
  // iets zegt dan een nette zin die niets zegt.
  return bericht ? `Instellen is niet gelukt: ${bericht}` : 'Instellen is niet gelukt.';
}

export function mfaFoutTekst(fout) {
  const bericht = String(fout?.message || fout || '');
  if (/invalid.*totp|invalid.*code/i.test(bericht)) {
    return 'Die code klopt niet of is verlopen. Een code is dertig seconden geldig — '
         + 'wacht op de volgende en probeer het opnieuw.';
  }
  if (/rate.?limit|too many/i.test(bericht)) {
    return 'Te veel pogingen achter elkaar. Wacht een minuut voordat u het opnieuw probeert.';
  }
  if (/expired|challenge/i.test(bericht)) {
    return 'De inlogpoging is verlopen. Log opnieuw in.';
  }
  return 'Verifiëren is niet gelukt. Probeer het opnieuw.';
}
