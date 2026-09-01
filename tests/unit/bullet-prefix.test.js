/**
 * Unit tests — src/docx/bullet-prefix.js
 *
 * De gevallen komen uit een echt ouderschapsplan (21 augustus 2026), geconverteerd
 * door Adobe PDF→DOCX. Daar staan de bolletjes als letterlijk teken tegen de tekst
 * aan geplakt, zonder spatie — precies wat de oude regex miste.
 */

import { describe, it, expect } from 'vitest';
import { bulletPrefix, metBullet } from '../../src/docx/bullet-prefix.js';

describe('bulletPrefix', () => {
  it('herkent een bolletje zonder spatie erachter — de Adobe-vorm', () => {
    expect(bulletPrefix('●Incidentele afwijking van de opgestelde zorgregeling.')).toBe('●');
    expect(bulletPrefix('•Kerstvakantie: ouders hebben afspraken gemaakt.')).toBe('•');
  });

  it('herkent de gebruikelijke vormen mét witruimte', () => {
    expect(bulletPrefix('● Met spatie')).toBe('● ');
    expect(bulletPrefix('\t●\tMet tab')).toBe('\t●\t');
    expect(bulletPrefix('  ▪  Ingesprongen')).toBe('  ▪  ');
  });

  it('leest streepje, sterretje en pijl alleen als bullet mét witruimte erna', () => {
    expect(bulletPrefix('- Een opsommingsregel')).toBe('- ');
    expect(bulletPrefix('> Citaatregel')).toBe('> ');
    // Anders zou gewone interpunctie een opsomming worden.
    expect(bulletPrefix('-5 graden vorst')).toBe('');
    expect(bulletPrefix('*nadruk* in de zin')).toBe('');
  });

  it('geeft leeg terug voor gewone tekst', () => {
    expect(bulletPrefix('De ouders spreken af dat…')).toBe('');
    expect(bulletPrefix('')).toBe('');
    expect(bulletPrefix(null)).toBe('');
    expect(bulletPrefix(undefined)).toBe('');
  });
});

describe('metBullet', () => {
  const NIEUW = 'De afspraken worden mondeling met elkaar afgestemd en vervolgens '
    + 'schriftelijk vastgelegd per e-mail.';

  it('zet het bolletje terug voor de vervangende tekst', () => {
    expect(metBullet(NIEUW, '●')).toBe('●' + NIEUW);
  });

  it('doet niets als de wijziging middenin de regel zat', () => {
    // Dan staat het bolletje nog in het ongewijzigde deel ervóór.
    expect(metBullet(NIEUW, '●', false)).toBe(NIEUW);
  });

  it('verdubbelt niet als het model zelf al een bullet schreef', () => {
    expect(metBullet('● ' + NIEUW, '●')).toBe('● ' + NIEUW);
  });

  it('doet niets zonder voorvoegsel of zonder tekst', () => {
    expect(metBullet(NIEUW, '')).toBe(NIEUW);
    expect(metBullet('', '●')).toBe('');
    expect(metBullet(null, '●')).toBe('');
  });

  it('behoudt de oorspronkelijke witruimte van het voorvoegsel', () => {
    expect(metBullet(NIEUW, '\t●\t')).toBe('\t●\t' + NIEUW);
  });
});
