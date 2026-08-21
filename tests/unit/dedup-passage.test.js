/**
 * Unit tests — api/_dedup-passage.js
 *
 * Het echte geval uit een ouderschapsplan van 21 augustus 2026: twee issues over
 * exact dezelfde clausule, met verschillende titels en vrijwel niet-overlappende
 * bewoordingen (gemeten woordoverlap 0,154).
 */

import { describe, it, expect } from 'vitest';
import { groepeerOpPassage, bouwConsolidatieLijst, normPassage, overlap } from '../../api/_dedup-passage.js';

const PASSAGE = 'Indien vader/moeder gaat samenwonen met een nieuwe partner en het recht van deze '
  + 'ouder op kindgebonden budget wordt hierdoor lager of vervalt, dan zien de ouders dat wel/niet '
  + 'als een wijziging van omstandigheden die aanleiding kan zijn om de afspraken over de '
  + 'kinderalimentatie aan te passen.';

const ISSUE_9 = {
  onderwerp: 'Wel/niet-keuze bij samenwonen nieuwe partner niet ingevuld',
  ernst: 'midden', dimensies: ['volledigheid'], passage: PASSAGE,
  bevinding: "De clausule bevat een niet-ingevulde keuze: 'wel/niet'. Partijen hebben niet "
    + 'vastgelegd of samenwonen met een nieuwe partner al dan niet als wijziging van '
    + 'omstandigheden wordt beschouwd.',
};

const ISSUE_10 = {
  onderwerp: "Vage bewoording 'wel/niet' in herzieningsclausule kinderalimentatie",
  ernst: 'midden', dimensies: ['grammatica'], passage: PASSAGE,
  bevinding: "De clausule bevat de onuitvoerbare aanduiding 'wel/niet': partijen hebben geen keuze "
    + 'gemaakt of samenwoning met verlies van kindgebonden budget al dan niet als wijzigingsgrond geldt.',
};

const ANDERE_ZIN = {
  onderwerp: 'Evaluatiemoment niet vastgelegd', ernst: 'laag', dimensies: ['volledigheid'],
  passage: 'Ouders zullen twee keer per jaar bij elkaar komen om de afspraken te evalueren.',
  bevinding: 'Er is geen concrete maand genoemd.',
};

describe('groepeerOpPassage', () => {
  it('herkent dat de twee wel/niet-issues dezelfde zin aanwijzen', () => {
    expect(groepeerOpPassage([ISSUE_9, ISSUE_10])).toEqual([[0, 1]]);
  });

  it('laat issues met een andere passage buiten de groep', () => {
    expect(groepeerOpPassage([ISSUE_9, ANDERE_ZIN, ISSUE_10])).toEqual([[0, 2]]);
  });

  it('groepeert nooit op een lege passage', () => {
    // Elke "sectie ontbreekt"-bevinding heeft een lege passage; die horen los te blijven.
    const a = { onderwerp: 'Informatieregeling ontbreekt', passage: '', bevinding: 'x' };
    const b = { onderwerp: 'Feestdagenregeling ontbreekt', passage: '', bevinding: 'y' };
    expect(groepeerOpPassage([a, b])).toEqual([]);
  });

  it('negeert verschillen in leestekens en witruimte', () => {
    const b = { ...ISSUE_10, passage: '  ' + PASSAGE.replace(/,/g, '') + '  ' };
    expect(groepeerOpPassage([ISSUE_9, b])).toEqual([[0, 1]]);
  });

  it('overleeft lege en ongeldige invoer', () => {
    expect(groepeerOpPassage([])).toEqual([]);
    expect(groepeerOpPassage(null)).toEqual([]);
    expect(groepeerOpPassage([ISSUE_9])).toEqual([]);
  });
});

describe('bouwConsolidatieLijst', () => {
  const lijst = bouwConsolidatieLijst([ISSUE_9, ANDERE_ZIN, ISSUE_10]);

  it('neemt de passage op — zonder die is het eerste samenvoegcriterium onbruikbaar', () => {
    expect(lijst).toContain('passage: "Indien vader/moeder gaat samenwonen');
  });

  it('markeert welke issues dezelfde zin aanwijzen, met verwijzing over en weer', () => {
    expect(lijst).toContain('← ZELFDE PASSAGE als [2]');
    expect(lijst).toContain('← ZELFDE PASSAGE als [0]');
  });

  it('markeert het issue met een eigen passage niet', () => {
    const regel = lijst.split('\n\n').find(r => r.startsWith('[1]'));
    expect(regel).not.toContain('ZELFDE PASSAGE');
  });

  it('nummert door zoals de tool verwacht', () => {
    expect(lijst).toMatch(/^\[0\]/);
    expect(lijst).toContain('\n[1] ');
    expect(lijst).toContain('\n[2] ');
  });

  it('kapt lange bevindingen af zodat de invoer beheersbaar blijft', () => {
    const lang = { ...ISSUE_9, bevinding: 'a'.repeat(900) };
    expect(bouwConsolidatieLijst([lang])).not.toContain('a'.repeat(400));
  });
});

describe('hulpfuncties', () => {
  it('normaliseert passages', () => {
    expect(normPassage('  De  clausule, zegt: "wel/niet".  ')).toBe('de clausule zegt wel niet');
  });

  it('meet woordoverlap tussen 0 en 1', () => {
    expect(overlap('sjabloonplaatshouder niet ingevuld', 'sjabloonplaatshouder niet ingevuld')).toBe(1);
    expect(overlap('kinderalimentatie berekening', 'pensioenverevening wvps')).toBe(0);
  });

  it('bevestigt waarom er niet op woordoverlap wordt samengevoegd', () => {
    // Twee issues over hetzelfde gebrek, in andere bewoordingen: 0,154.
    // Elke drempel die dit paar vangt, is op twee waarnemingen gekozen.
    expect(overlap(ISSUE_9.bevinding, ISSUE_10.bevinding)).toBeLessThan(0.3);
  });
});
