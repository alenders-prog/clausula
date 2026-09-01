/**
 * tests/unit/vervang-accent.test.js
 *
 * "Aanbeveling geeft aan dat dezelfde zin vervangen moet worden door dezelfde zin."
 * Dat was niet zo — er zaten twee woorden verschil in — maar dat verschil was niet te
 * zien, en een voorstel waarvan je het verschil niet ziet kun je niet beoordelen.
 *
 * Het merendeel van deze tests gaat over de andere kant: wat er NIET gemarkeerd mag
 * worden. Gemeten over 75 aanbevelingen uit de fixtures hebben er vier twee citaten, en
 * daarvan is er precies één een vervang-paar. De andere drie zijn alternatieven, en die
 * naast elkaar leggen geeft een kerstboom van accenten die niets betekent.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { splitsVervanging, woordAccenten, accentueerAanbeveling } from '../../src/rapport/vervang-accent.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Het enige echte vervang-paar uit de fixtures.
const ECHT = "Vervang 'De echtelijke woning' door 'De gezamenlijke woning' in artikel 2.1.";

describe('splitsVervanging', () => {
  it('herkent het vervang-paar', () => {
    const v = splitsVervanging(ECHT);
    expect(v.oud).toBe('De echtelijke woning');
    expect(v.nieuw).toBe('De gezamenlijke woning');
    expect(v.na).toBe(' in artikel 2.1.');
  });

  it('herkent ook "wijzig … in …"', () => {
    expect(splitsVervanging('Wijzig "de man" in "de vrouw" in lid 3.').nieuw).toBe('de vrouw');
  });

  it('laat twee ALTERNATIEVEN met rust', () => {
    // Dit is het geval dat drie van de vier fixture-treffers vormt. Er staat geen
    // vervang-woord vóór het eerste citaat, dus er is geen paar.
    const alt = 'Voeg aan artikel 3 een bepaling toe over het bijzonder partnerpensioen, '
      + "bijvoorbeeld: 'Het bijzonder partnerpensioen blijft in stand ten behoeve van de vrouw.' "
      + "of, als partijen afstand doen: 'De vrouw doet afstand van het bijzonder partnerpensioen.'";
    expect(splitsVervanging(alt)).toBeNull();
  });

  it('laat een aanbeveling met één citaat met rust', () => {
    expect(splitsVervanging("Vervang de huidige tekst door: 'Partijen komen overeen dat…'"))
      .toBeNull();
  });

  it('laat drie citaten met rust — geen eenduidig paar', () => {
    expect(splitsVervanging("Vervang 'a' door 'b' of desnoods 'c' in artikel 1."))
      .toBeNull();
  });

  it('eist een koppelwoord tussen de twee citaten', () => {
    // Zonder "door"/"in" is het geen vervanging maar een opsomming.
    expect(splitsVervanging("Vervang de tekst. Zie 'de eerste variant', en 'de tweede variant'."))
      .toBeNull();
  });

  it('overleeft lege en rare invoer', () => {
    for (const x of ['', null, undefined, 'Voeg de datum toe.']) {
      expect(splitsVervanging(x)).toBeNull();
    }
  });
});

describe('woordAccenten', () => {
  it('markeert alleen het middenstuk dat verschilt', () => {
    const { oud, nieuw } = woordAccenten('De echtelijke woning', 'De gezamenlijke woning');
    expect(oud.filter(d => d.anders).map(d => d.tekst.trim())).toEqual(['echtelijke']);
    expect(nieuw.filter(d => d.anders).map(d => d.tekst.trim())).toEqual(['gezamenlijke']);
  });

  it('geeft de tekst exact terug als je de stukken weer aan elkaar plakt', () => {
    // Zonder deze eigenschap zou het accentueren de aanbeveling stilletjes veranderen.
    const oorspronkelijk = 'Het vermogen van   partijen wordt verdeeld';
    const { oud } = woordAccenten(oorspronkelijk, 'iets anders');
    expect(oud.map(d => d.tekst).join('')).toBe(oorspronkelijk);
  });

  it('markeert niets als de teksten gelijk zijn', () => {
    const { oud, nieuw } = woordAccenten('dezelfde zin', 'dezelfde zin');
    expect(oud.some(d => d.anders)).toBe(false);
    expect(nieuw.some(d => d.anders)).toBe(false);
  });

  it('markeert alles als er geen begin of einde gedeeld wordt', () => {
    const { oud } = woordAccenten('alfa beta', 'gamma delta');
    expect(oud.every(d => d.anders)).toBe(true);
  });

  it('telt hoofdletters en spaties niet als verschil', () => {
    const { oud } = woordAccenten('De  Woning is groen', 'de woning is rood');
    expect(oud.filter(d => d.anders).map(d => d.tekst.trim())).toEqual(['groen']);
  });
});

describe('accentueerAanbeveling', () => {
  it('markeert het weggaande en het nieuwe woord', () => {
    const html = accentueerAanbeveling(ECHT, esc);
    expect(html).toContain('<mark class="vv-weg">echtelijke</mark>');
    expect(html).toContain('<mark class="vv-erbij">gezamenlijke</mark>');
    expect(html).toContain('in artikel 2.1.');
  });

  it('zegt het hardop als oud en nieuw identiek zijn', () => {
    // Dat is een fout van het model, en die hoort zichtbaar te zijn in plaats van als
    // een gewone aanbeveling te worden getoond — dat was de klacht.
    const html = accentueerAanbeveling("Vervang 'dezelfde zin hier' door 'dezelfde zin hier'.", esc);
    expect(html).toContain('oud en nieuw zijn identiek');
    expect(html).not.toContain('<mark');
  });

  it('geeft null als het geen vervangvoorstel is', () => {
    expect(accentueerAanbeveling('Voeg de ondertekeningsdatum toe.', esc)).toBeNull();
  });

  it('ontsnapt HTML in de aanbeveling', () => {
    const html = accentueerAanbeveling("Vervang '<b>oude</b> tekst' door '<b>nieuwe</b> tekst'.", esc);
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;');
  });
});

// ── Bedrading ──────────────────────────────────────────────────────────────

describe('index.html gebruikt de accentuering', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

  it('roept hem aan in de aanbevelingsregel, met escH als terugval', () => {
    // De terugval is essentieel: geeft accentueerAanbeveling null (geen vervangvoorstel),
    // dan hoort er gewoon platte, ontsnapte tekst te staan.
    expect(html).toMatch(/accentueerAanbeveling\?\.\(issue\.aanbeveling, escH\) \?\? escH\(issue\.aanbeveling\)/);
  });

  it('heeft opmaak voor beide kanten van het verschil', () => {
    expect(html).toMatch(/mark\.vv-weg\{/);
    expect(html).toMatch(/mark\.vv-erbij\{/);
  });
});
