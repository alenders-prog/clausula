/**
 * Unit tests — de HTML-ontsnapping, op alle vier de plekken waar ze bestaat
 *
 * ── AANLEIDING (5 september 2026) ───────────────────────────────────────────
 *
 * `escH` in index.html en assistent-core.js ontsnapte alleen `&`, `<` en `>`. Dat is genoeg
 * voor tekst tussen twee tags, maar niet voor een attribuut — en er staan achttien
 * attributen in index.html die er wél op leunen:
 *
 *     title="${escH(item.bestandsnaam)}"       data-naam="${escH(b.naam)}"
 *     href="${escH(b.url)}"                    src="${escH(qr)}"
 *
 * Een waarde met een `"` erin sluit daar het attribuut en de rest van de tekst wordt
 * markup. De varianten in src/dashboard/scherm.js en src/auth/mfa-scherm.js deden het al
 * goed; de twee oudste liepen achter. Deze test houdt ze gelijk.
 *
 * ── WAAROM DE BRON WORDT GELEZEN ────────────────────────────────────────────
 *
 * Twee van de vier staan in een monoliet en zijn niet te importeren. De functie eruit
 * trekken en aanroepen is de enige manier om ze te toetsen zonder ze te verplaatsen —
 * en verplaatsen zou 130 aanroepplekken afhankelijk maken van de ESM-brug, inclusief de
 * plekken die tijdens het eerste renderen al draaien. Zelfde aanpak als omvang.test.js.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Regeleindes gelijktrekken: de bestanden staan met CRLF op schijf en de patronen
// hieronder zoeken op inspringing aan het begin van een regel.
const lees = p => readFileSync(join(WORTEL, p), 'utf8').replace(/\r\n/g, '\n');

/** Haalt de body van een escH-definitie uit de bron en maakt er een aanroepbare functie van. */
function escHUit(bron, patroon) {
  const m = bron.match(patroon);
  if (!m) throw new Error('escH-definitie niet gevonden');
  // eslint-disable-next-line no-new-func
  return new Function('s', `return (${m[1]})(s);`);
}

const VARIANTEN = {
  'index.html': escHUit(lees('index.html'),
    /(function escH\(s\)\s*\{[\s\S]*?\n\})/),
  'assistent-core.js': escHUit(lees('assistent-core.js'),
    /(function escH\(s\)\s*\{[\s\S]*?\n  \})/),
  'src/dashboard/scherm.js': escHUit(lees('src/dashboard/scherm.js'),
    /const escH = (\(s\) =>[\s\S]*?\}\[c\]\)\));/),
  'src/auth/mfa-scherm.js': escHUit(lees('src/auth/mfa-scherm.js'),
    /const escH = (\(s\) =>[\s\S]*?\}\[c\]\)\));/),
};

describe.each(Object.entries(VARIANTEN))('escH in %s', (naam, escH) => {
  it('ontsnapt de dubbele aanhaling — anders breekt een attribuut open', () => {
    // `title="${escH(naam)}"` met deze waarde erin zou anders een img met onerror opleveren.
    const payload = 'a" onerror="alert(1)';
    const uit = escH(payload);
    expect(uit).not.toContain('"');
    expect(uit).toContain('&quot;');
  });

  it('ontsnapt de enkele aanhaling', () => {
    const uit = escH("O'Brien");
    expect(uit).not.toContain("'");
    expect(uit).toContain('&#39;');
  });

  it('ontsnapt de hoekhaken', () => {
    expect(escH('<script>')).toBe('&lt;script&gt;');
  });

  it('ontsnapt de ampersand als eerste, niet dubbel', () => {
    // Zou & ná < worden vervangen, dan werd &lt; tot &amp;lt; en zag de gebruiker de code.
    expect(escH('&')).toBe('&amp;');
    expect(escH('<')).toBe('&lt;');
    expect(escH('&amp;')).toBe('&amp;amp;');
  });

  it('laat gewone tekst met rust', () => {
    expect(escH('Convenant Jansen-de Vries')).toBe('Convenant Jansen-de Vries');
    expect(escH('€ 1.250,00 — 50%')).toBe('€ 1.250,00 — 50%');
  });

  it('valt niet om op ontbrekende invoer', () => {
    expect(escH(null)).toBe('');
    expect(escH(undefined)).toBe('');
    expect(escH(0)).toBe('0');
  });
});

describe('de gebruikerslijst — het scherm waar rollen worden gewisseld', () => {
  const bron = lees('index.html');

  it('zet de naam van een gebruiker niet in een inline JS-string', () => {
    // Een attribuut wordt eerst HTML-ontsnapt en pas daarna als JavaScript gelezen, dus
    // escH() beschermt binnen `onclick="f('…')"` niet. De naam gaat via data-naam.
    expect(bron).not.toMatch(/verwijderGebruiker\('\$\{u\.id\}','\$\{u\.naam/);
    expect(bron).toMatch(/verwijderGebruiker\('\$\{u\.id\}', this\.dataset\.naam\)/);
  });

  it('ontsnapt naam en e-mail in de tabel zelf', () => {
    expect(bron).toContain('${escH(u.naam || \'—\')}');
    expect(bron).toContain('${escH(u.email)}');
  });
});
