/**
 * src/auth/mfa-scherm.js — de vier toestanden van het beveiligingstabblad
 *
 * Losgehouden van index.html omdat de toestanden zelf de redenering zijn: een
 * beheerder zonder factor moet een andere tekst en een andere knopkleur zien dan een
 * mediator zonder factor, en een half afgeronde inschrijving mag er niet uitzien als
 * een afgeronde. Dat is te toetsen zonder browser; de bedrading eromheen niet.
 *
 * Geeft HTML terug als string, zoals de rest van de rendercode in dit project.
 */

const escH = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Secret in blokjes van vier: overtypen zonder je plaats kwijt te raken. */
export function leesbaarSecret(secret) {
  return String(secret || '').replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

/**
 * De rustende toestand: wel of geen tweede factor ingesteld.
 * @param {{stap: string, reden: string}} beleid  uit bepaalMfaStap()
 */
export function mfaStatusHtml(beleid) {
  if (beleid?.stap === 'ok' || beleid?.stap === 'code_invoeren') {
    return `
      <div class="mfa-status mfa-aan">
        <div class="mfa-kop"><span class="mfa-vink">✓</span> Tweefactorauthenticatie staat aan</div>
        <p class="mfa-uitleg">Bij het inloggen vraagt Clausula naast uw wachtwoord om een
        zescijferige code uit uw authenticator-app.</p>
        <button type="button" id="mfaUitBtn" class="mfa-knop-uit">Verwijderen</button>
      </div>`;
  }

  const verplicht = beleid?.stap === 'instellen_verplicht';
  return `
    <div class="mfa-status ${verplicht ? 'mfa-verplicht' : 'mfa-uit'}">
      <div class="mfa-kop">
        ${verplicht ? '<span class="mfa-let">!</span> Verplicht voor uw rol'
                    : 'Tweefactorauthenticatie staat uit'}
      </div>
      <p class="mfa-uitleg">${escH(beleid?.reden || '')}</p>
      <button type="button" id="mfaAanBtn" class="mfa-knop-aan">Instellen met een authenticator-app</button>
    </div>`;
}

/**
 * De inschrijftoestand: QR-code, het secret in tekst, en het codeveld.
 *
 * Het secret staat er bewust uitgeschreven bij. Supabase kent geen herstelcodes voor
 * TOTP; wie zijn telefoon kwijtraakt kán er zonder dit secret niet meer bij, en bij een
 * beheerder betekent dat het hele kantoor. Het secret in een wachtwoordmanager is de
 * herstelweg tot er een echte herstelcode-regeling staat.
 */
export function mfaInschrijfHtml({ qr, secret } = {}) {
  return `
    <div class="mfa-inschrijf">
      <ol class="mfa-stappen">
        <li>Open een authenticator-app — bijvoorbeeld Google Authenticator, Microsoft
            Authenticator, of de ingebouwde wachtwoordmanager van uw telefoon.
            <span class="mfa-fijn">Vraagt Microsoft Authenticator welk soort account?
            Kies <b>Ander account</b>.</span></li>
        <li><b>Staat er al een regel "Clausula" in uw app? Verwijder die eerst.</b>
            <span class="mfa-fijn">Een eerdere poging laat een regel achter die codes
            blijft tonen terwijl de server hem niet meer kent. Die codes worden altijd
            afgekeurd — en aan de code is niet te zien welke van de twee het is.</span></li>
        <li>Scan deze code:</li>
      </ol>

      ${qr ? `<div class="mfa-qr"><img src="${escH(qr)}" alt="QR-code voor uw authenticator-app" width="180" height="180"></div>`
           : `<p class="mfa-uitleg">De QR-code kon niet worden geladen. Voer de sleutel hieronder handmatig in.</p>`}

      <details class="mfa-handmatig">
        <summary>Scannen lukt niet — sleutel handmatig invoeren</summary>
        <code class="mfa-secret">${escH(leesbaarSecret(secret))}</code>
      </details>

      <div class="mfa-bewaar">
        <b>Bewaar deze sleutel in uw wachtwoordmanager.</b>
        Raakt u uw telefoon kwijt, dan is dit de enige manier om weer binnen te komen —
        er zijn nog geen herstelcodes.
      </div>

      <label for="mfaCode" class="mfa-lbl">Voer ter controle de code uit de app in</label>
      <input type="text" id="mfaCode" inputmode="numeric" autocomplete="one-time-code"
             maxlength="6" pattern="[0-9]{6}" placeholder="000000" class="mfa-codeveld">
      <div class="mfa-fout" id="mfaFout" style="display:none"></div>
      <div class="mfa-acties">
        <button type="button" id="mfaAnnuleerBtn" class="mfa-knop-uit">Annuleren</button>
        <button type="button" id="mfaBevestigBtn" class="mfa-knop-aan">Activeren</button>
      </div>
    </div>`;
}
