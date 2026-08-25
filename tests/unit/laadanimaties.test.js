/**
 * Unit test — de wachtvormen blijven met z'n vieren
 *
 * Aanleiding (24 augustus 2026). `index.html` had veertien laadanimaties voor drie
 * betekenissen. Dezelfde cirkelspinner draaide op vier snelheden in vier kleuren;
 * de glansveeg bestond twee keer met een andere kleur; en vier ervan draaiden
 * helemaal nooit — hun CSS stond er, maar geen enkele regel JavaScript zette die
 * klasse ooit op een element.
 *
 * Erger nog: het enige `prefers-reduced-motion`-blok in het bestand dekte precies
 * één van de veertien. De andere dertien bleven doordraaien voor wie in zijn
 * systeem heeft aangegeven daar last van te hebben.
 *
 * Deze test bewaakt twee dingen die anders vanzelf terugsluipen: hoeveel
 * animatievormen er zijn, en dat élke bewegende vorm ook wordt uitgezet.
 *
 * Loopt hij vast op een nieuwe animatie: vraag je eerst af of het er echt een
 * vijfde moet zijn. Meestal heb je een van de vier nodig. Moet het toch, dan
 * hoort de naam hier in de lijst — dan staat het in de diff en is het een besluit.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Alle <style>-inhoud van een bestand, aaneengeplakt. */
function css(pad) {
  const bron = readFileSync(join(WORTEL, pad), 'utf8');
  return [...bron.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
}

/** Namen van alle gedefinieerde keyframes. */
function keyframes(tekst) {
  return [...tekst.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]).sort();
}

/** Selectors van elke regel die een animatie start, met de gebruikte naam. */
function animatieGebruikers(tekst) {
  const uit = [];
  for (const blok of tekst.split('}')) {
    const m = /animation:\s*([\w-]+)/.exec(blok);
    if (!m) continue;
    if (m[1] === 'none') continue;               // dit is juist het uitzetten
    // Commentaar uit de selector halen; die staat vaak vlak boven de regel.
    const sel = blok.split('{')[0].replace(/\/\*[\s\S]*?\*\//g, '').trim()
      .split('\n').map(s => s.trim()).filter(Boolean).join(' ');
    if (!sel || sel.startsWith('@')) continue;   // at-regel, geen selector
    uit.push({ sel, naam: m[1] });
  }
  return uit;
}

// Bewust een korte lijst. Elke toevoeging is een besluit dat in de diff staat.
const TOEGESTAAN = ['laad-draai', 'laad-stuit', 'laad-veeg'];

describe('index.html — de wachtvormen', () => {
  const tekst = css('index.html');

  it('definieert geen andere animaties dan de drie bewegende wachtvormen', () => {
    const teveel = keyframes(tekst).filter(n => !TOEGESTAAN.includes(n));
    expect(
      teveel,
      `Nieuwe animatie(s): ${teveel.join(', ')}. Er zijn vier wachtvormen — spin, balk, `
      + 'skelet en typt — en de balk beweegt niet uit zichzelf. Heb je er echt een vijfde '
      + 'nodig, zet de naam dan in TOEGESTAAN in deze test.',
    ).toEqual([]);
  });

  it('gebruikt geen keyframe die niet bestaat', () => {
    const bestaand = new Set(keyframes(tekst));
    const kapot = animatieGebruikers(tekst).filter(g => !bestaand.has(g.naam));
    expect(
      kapot.map(g => `${g.sel} → ${g.naam}`),
      'Verwijst naar een keyframe die niet (meer) gedefinieerd is. Dat faalt stil: '
      + 'het element staat gewoon stil en niemand ziet een foutmelding.',
    ).toEqual([]);
  });

  it('zet élke bewegende vorm uit bij prefers-reduced-motion', () => {
    // Het blok zelf uitknippen en kijken welke selectors erin staan.
    const blok = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/.exec(tekst);
    expect(blok, 'Geen prefers-reduced-motion-blok gevonden in index.html').not.toBeNull();
    const gedekt = blok[1];

    const ongedekt = animatieGebruikers(tekst)
      .filter(g => !gedekt.includes(g.sel.split(',')[0].trim()))
      .map(g => g.sel);

    expect(
      [...new Set(ongedekt)],
      'Deze selectors animeren maar staan niet in het reduced-motion-blok. '
      + 'Tot 24-08-2026 gold dat voor dertien van de veertien animaties.',
    ).toEqual([]);
  });
});

describe('assistent-mobiel.html — dezelfde vormen als op desktop', () => {
  const tekst = css('assistent-mobiel.html');

  it('heeft geen eigen kopie van een animatie onder een andere naam', () => {
    // Mobiel had `mob-bounce` en `mob-puls`: kopieën van wat op desktop al bestond.
    // Twee namen voor dezelfde beweging lopen na een wijziging uit elkaar.
    const teveel = keyframes(tekst).filter(n => !TOEGESTAAN.includes(n));
    expect(
      teveel,
      `Eigen animatie(s) op mobiel: ${teveel.join(', ')}. Gebruik dezelfde naam en `
      + 'waarden als in index.html — zie de memory-regel over desktop/mobiel-synchroniteit.',
    ).toEqual([]);
  });

  it('zet zijn bewegende vormen ook uit bij prefers-reduced-motion', () => {
    const blok = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\s*\}/.exec(tekst);
    expect(blok, 'Geen prefers-reduced-motion-blok in assistent-mobiel.html').not.toBeNull();
    const ongedekt = animatieGebruikers(tekst)
      .filter(g => !blok[1].includes(g.sel.split(',')[0].trim()))
      .map(g => g.sel);
    expect([...new Set(ongedekt)]).toEqual([]);
  });
});
