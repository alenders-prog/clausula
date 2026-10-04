/**
 * tests/unit/adobe-ocr-taal.test.js
 *
 * Adobe leest een scan als Engels tenzij je iets anders zegt (de SDK valt terug op
 * `ExportOCRLocale.EN_US`). Tot 4 oktober 2026 zei api/adobe-start.js niets. Gemeten op
 * één gescand ouderschapsplan van 15 pagina's, standaard → nl-NL:
 *
 *   Niqué zonder accent ("Nique")   74 → 0
 *   "warden" voor worden             6 → 0
 *   "bet" / "alien" / "ledere"     2/2/2 → 0
 *
 * Dat is niet alleen de weergave: uit die tekst leest Claude. "Nique" tegenover "Niqué"
 * in het convenant werd een HOOG-bevinding over een afwijkende voornaam.
 *
 * Een ontbrekende parameter geeft geen fout — Adobe levert gewoon slechtere tekst. Vandaar
 * deze wachter op de bron.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const wortel = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('Adobe-conversie leest scans als Nederlands', () => {
  it('elke exportpdf-aanroep geeft ocrLang nl-NL mee', () => {
    const bron = fs.readFileSync(path.join(wortel, 'api', 'adobe-start.js'), 'utf8');
    const aanroepen = bron.match(/targetFormat:\s*'docx'[^}]*/g) || [];
    expect(aanroepen.length).toBeGreaterThan(0);
    for (const a of aanroepen) expect(a).toMatch(/ocrLang:\s*'nl-NL'/);
  });
});
