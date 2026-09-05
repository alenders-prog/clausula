/**
 * Unit tests — src/naam-anonimiseer.js
 *
 * Verifieert bouwAnonMap() en anonimiseerTekst() — de naam-pseudonimisering
 * die gebruikersinvoer anonimiseert vóór verzending naar de Anthropic API.
 *
 * Geen DOM-afhankelijkheden. Draait in Node/Vitest.
 */

import { describe, it, expect } from 'vitest';
import { bouwAnonMap, anonimiseerTekst, NEP_PERSONEN, NEP_KINDEREN } from '../../src/naam-anonimiseer.js';

// ── Hulpfunctie ───────────────────────────────────────────────────────────────
// Retourneert de eerste nep-voornaam die bouwAnonMap koppelt aan partij A.
function nepVoornaamA() {
  return NEP_PERSONEN[0].fn;
}
function nepVoornaamB() {
  return NEP_PERSONEN[1].fn;
}

// ── bouwAnonMap — basisregistratie ────────────────────────────────────────────

describe('bouwAnonMap — basisregistratie', () => {
  it('registreert volledige naam in naarAnon (lowercase)', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Martijn Jasperse' });
    expect(naarAnon.has('martijn jasperse')).toBe(true);
  });

  it('registreert voornaam als nep-voornaam (niet dubbele nep-naam)', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Martijn Jasperse' });
    // Voornaam "martijn" → nep.fn (alleen voornaam), NIET de volledige nepnaam
    expect(naarAnon.get('martijn')).toBe(nepVoornaamA());
  });

  it('registreert achternaam als nep-achternaam', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Martijn Jasperse' });
    expect(naarAnon.get('jasperse')).toBe('Bergman');
  });

  it('registreert bezitsvorm voornaam (naam + s)', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Peter Jansen' });
    expect(naarAnon.has('peters')).toBe(true);
    expect(naarAnon.get('peters')).toBe(nepVoornaamA());
  });

  it('partij_a en partij_b krijgen verschillende nep-namen', () => {
    // Voornamen < 4 tekens worden niet geregistreerd (drempel length > 3).
    // Gebruik namen met voornaam ≥ 4 tekens.
    const { naarAnon } = bouwAnonMap({
      partij_a_naam: 'Peter Smit',
      partij_b_naam: 'Sandra Visser',
    });
    expect(naarAnon.get('peter')).toBe(nepVoornaamA());
    expect(naarAnon.get('sandra')).toBe(nepVoornaamB());
  });
});

// ── bouwAnonMap — gedeelde achternaam ─────────────────────────────────────────

describe('bouwAnonMap — gedeelde achternaam', () => {
  it('achternaam wordt NIET in naarAnon gezet als beide partijen die delen', () => {
    const { naarAnon } = bouwAnonMap({
      partij_a_naam: 'Peter de Vries',
      partij_b_naam: 'Sandra de Vries',
    });
    // Gedeelde achternaam mag niet in de map (verkeerde toewijzing)
    expect(naarAnon.has('de vries')).toBe(false);
    expect(naarAnon.has('vries')).toBe(false);
  });

  it('voornamen worden wél geregistreerd bij gedeelde achternaam', () => {
    const { naarAnon } = bouwAnonMap({
      partij_a_naam: 'Peter de Vries',
      partij_b_naam: 'Sandra de Vries',
    });
    expect(naarAnon.has('peter')).toBe(true);
    expect(naarAnon.has('sandra')).toBe(true);
  });
});

// ── bouwAnonMap — roepnamen ───────────────────────────────────────────────────

describe('bouwAnonMap — roepnamen via classificatie', () => {
  it('partij_a_roepnaam wordt als alias geregistreerd', () => {
    const { naarAnon } = bouwAnonMap({
      partij_a_naam:     'Alexander Lenders',
      partij_a_roepnaam: 'Sander Lenders',
    });
    // Roepnaam "sander" → zelfde nep als "alexander"
    expect(naarAnon.has('sander')).toBe(true);
    expect(naarAnon.get('sander')).toBe(naarAnon.get('alexander'));
  });

  it('naarEcht geeft roepnaam terug voor nep-voornaam', () => {
    const { naarEcht } = bouwAnonMap({
      partij_a_naam:     'Alexander Lenders',
      partij_a_roepnaam: 'Sander Lenders',
    });
    // Na herstel: nep.fn → roepnaam
    expect(naarEcht.get(nepVoornaamA())).toBe('Sander');
  });

  it('sterk afwijkende roepnaam levert een waarschuwing op', () => {
    const { waarschuwingen } = bouwAnonMap({
      partij_a_naam:     'Herma Eugenie ten Brink',
      partij_a_roepnaam: 'Manon ten Brink',
    });
    expect(waarschuwingen.length).toBeGreaterThan(0);
    expect(waarschuwingen[0].roepnaam).toBe('Manon');
  });
});

// ── bouwAnonMap — kinderen ────────────────────────────────────────────────────

describe('bouwAnonMap — kinderen', () => {
  it('kindernamen worden geregistreerd', () => {
    const { naarAnon } = bouwAnonMap({
      partij_a_naam:  'Kees Bakker',
      kinderen_namen: ['Emma Bakker'],
    });
    expect(naarAnon.has('emma')).toBe(true);
  });

  it('kind-legacy-placeholder [KIND_1] staat in naarEcht', () => {
    const { naarEcht } = bouwAnonMap({
      partij_a_naam:  'Kees Bakker',
      kinderen_namen: ['Emma Bakker'],
    });
    // Legacy placeholder verwijst naar roepnaam kind
    expect(naarEcht.get('[KIND_1]')).toBe('Emma');
  });

  it('meerdere kinderen krijgen elk een andere nep-naam', () => {
    const { naarAnon } = bouwAnonMap({
      partij_a_naam:  'Kees Bakker',
      kinderen_namen: ['Emma Bakker', 'Luuk Bakker'],
    });
    const nepEmma = naarAnon.get('emma');
    const nepLuuk = naarAnon.get('luuk');
    expect(nepEmma).toBeDefined();
    expect(nepLuuk).toBeDefined();
    expect(nepEmma).not.toBe(nepLuuk); // verschillende nep-namen
  });
});

// ── bouwAnonMap — bronNamen-parameter ─────────────────────────────────────────

describe('bouwAnonMap — roepnaam detectie via bronNamen', () => {
  it('roepnaam herkend uit bronNaam als die afwijkt van formele naam', () => {
    const { naarAnon } = bouwAnonMap(
      { partij_a_naam: 'Alexander Lenders' },
      ['Sander Lenders - bestandsnaam.pdf'],
    );
    // "Sander" uit de bestandsnaam → alias voor nep-voornaam A
    expect(naarAnon.has('sander')).toBe(true);
    expect(naarAnon.get('sander')).toBe(nepVoornaamA());
  });

  it('zonder bronNamen: geen roepnaam-detectie via bestandsnamen', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Alexander Lenders' });
    // Zonder bronNamen: "sander" staat er niet in (formele naam is "alexander")
    expect(naarAnon.has('sander')).toBe(false);
  });
});

// ── bouwAnonMap — return-structuur ────────────────────────────────────────────

describe('bouwAnonMap — return-structuur', () => {
  it('geeft alle vier maps/arrays terug', () => {
    const result = bouwAnonMap({ partij_a_naam: 'Jan Smit' });
    expect(result.naarAnon).toBeInstanceOf(Map);
    expect(result.naarEcht).toBeInstanceOf(Map);
    expect(result.naarEchtVolledig).toBeInstanceOf(Map);
    expect(Array.isArray(result.roepnamen)).toBe(true);
    expect(Array.isArray(result.waarschuwingen)).toBe(true);
  });

  it('lege classificatie geeft lege maps (geen crash)', () => {
    const result = bouwAnonMap({});
    expect(result.naarAnon.size).toBe(0);
  });

  it('null-classificatie geeft lege maps (geen crash)', () => {
    const result = bouwAnonMap(null);
    expect(result.naarAnon.size).toBe(0);
  });
});

// ── anonimiseerTekst — naam-vervanging ────────────────────────────────────────

describe('anonimiseerTekst — naam-vervanging', () => {
  it('vervangt volledige naam case-insensitief', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Jan Smit' });
    const r = anonimiseerTekst('jan smit betaalt', naarAnon);
    expect(r).not.toContain('jan');
    expect(r).not.toContain('smit');
  });

  it('vervangt hoofdlettervariant', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Jan Smit' });
    expect(anonimiseerTekst('JAN SMIT tekent', naarAnon)).not.toContain('JAN');
  });

  it('langste match gaat voor — geen dubbele nep-naam', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Martijn Jasperse' });
    const r = anonimiseerTekst('Martijn Jasperse tekent het convenant', naarAnon);
    // Volledige naam → één nep. Mag NIET dubbel zijn ("Robin Bergman Robin")
    const { fn, an } = NEP_PERSONEN[0];
    expect(r).not.toMatch(new RegExp(`${fn} ${an} ${fn}|${an} ${an}`));
  });

  it('geen match midden in woord (unicode-woordgrens)', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Jan Smit' });
    // "Janssen" bevat "jan" maar mag niet vervangen worden
    expect(anonimiseerTekst('Janssen is aanwezig', naarAnon)).toContain('Janssen');
  });

  it('BSN gemaskeerd als naarAnon entries bevat', () => {
    // anonimiseerTekst keert vroegtijdig terug als naarAnon leeg is (size === 0).
    // BSN-masking werkt alleen als er ook namen zijn geregistreerd.
    // Primaire BSN-masking is piiAnonimiseer(); dit is de secondary check.
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Peter Smit' });
    expect(anonimiseerTekst('BSN 123456789 van cliënt', naarAnon)).toContain('[BSN]');
  });
});

// ── anonimiseerTekst — edge cases ─────────────────────────────────────────────

describe('anonimiseerTekst — edge cases', () => {
  it('lege string → lege string', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Jan Smit' });
    expect(anonimiseerTekst('', naarAnon)).toBe('');
  });

  it('null → null', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Jan Smit' });
    expect(anonimiseerTekst(null, naarAnon)).toBeNull();
  });

  it('lege naarAnon-map → tekst ongewijzigd terug', () => {
    const result = anonimiseerTekst('Geen namen hier.', new Map());
    expect(result).toBe('Geen namen hier.');
  });

  it('naam met regex-speciale tekens veroorzaakt geen crash', () => {
    // Punt, haak, ster zijn speciale regex-tekens
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Jan (de) Smit' });
    expect(() => anonimiseerTekst('Jan (de) Smit tekent', naarAnon)).not.toThrow();
  });
});

// ── Gecombineerde casus ───────────────────────────────────────────────────────

describe('bouwAnonMap + anonimiseerTekst — gecombineerde casus', () => {
  it('volledige pipeline: namen + BSN verwijderd', () => {
    const { naarAnon } = bouwAnonMap({
      partij_a_naam: 'Peter Dikkeschei',
      partij_b_naam: 'Sandra Ropers',
    });
    const input = 'Peter Dikkeschei (BSN 123456789) en Sandra Ropers (BSN 987654321) tekenen.';
    const result = anonimiseerTekst(input, naarAnon);
    expect(result).not.toContain('Peter');
    expect(result).not.toContain('Dikkeschei');
    expect(result).not.toContain('Sandra');
    expect(result).not.toContain('Ropers');
    expect(result).not.toContain('123456789');
    expect(result).not.toContain('987654321');
    expect(result).toContain('[BSN]');
  });

  it('dezelfde input twee keer geanonimiseerd geeft hetzelfde resultaat', () => {
    const { naarAnon } = bouwAnonMap({ partij_a_naam: 'Jan Smit' });
    const r1 = anonimiseerTekst('Jan Smit betaalt alimentatie.', naarAnon);
    const r2 = anonimiseerTekst('Jan Smit betaalt alimentatie.', naarAnon);
    expect(r1).toBe(r2);
  });
});

// ── Nep-namenpools: geen geslachtssignaal ─────────────────────────────────────
//
// De pools worden op volgorde uitgedeeld, dus een gendered naam belandt vroeg of
// laat bij iemand van het andere geslacht. Claude leest dan een tegenstrijdigheid
// in tekst die wij zelf hebben aangeleverd ("Finn ... over haar"), meldt die, en
// na het terugzetten van de namen staat er een verwijt dat in het document van de
// mediator nergens te vinden is. Bij twee vrouwen of twee mannen is een op-index
// verdeelde gendered pool zelfs gegarandeerd fout.
//
// De lijst hieronder is met de hand samengesteld en dus niet uitputtend — hij
// bevat in elk geval elke naam die hier ooit heeft gestaan. Voegt iemand een
// duidelijk mannelijke of vrouwelijke naam toe, dan valt die op.
describe('nep-namenpools dragen geen geslacht', () => {
  const GENDERED = [
    // stond hier tot 24-08-2026
    'Thomas', 'Lisette', 'Florian', 'Nathalie', 'Bastiaan', 'Eveline',
    'Rutger', 'Simone', 'Jeroen', 'Yvonne',
    'Finn', 'Lotte', 'Stef', 'Mila', 'Bram', 'Sofie', 'Tim', 'Emma',
    // gangbare Nederlandse voornamen met een duidelijk signaal
    'Jan', 'Piet', 'Kees', 'Henk', 'Willem', 'Daan', 'Sven', 'Lucas', 'Ruben',
    'Anna', 'Maria', 'Sanne', 'Femke', 'Marieke', 'Julia', 'Fleur', 'Saskia',
  ].map(n => n.toLowerCase());

  const voornamen = [...NEP_PERSONEN.map(p => p.fn), ...NEP_KINDEREN];

  it('geen enkele voornaam staat op de gendered-lijst', () => {
    const fout = voornamen.filter(n => GENDERED.includes(n.toLowerCase()));
    expect(
      fout,
      `Deze nepvoornamen dragen een geslachtssignaal: ${fout.join(', ')}. `
      + 'Een naam die een geslacht uitdrukt botst vroeg of laat met "hij"/"zij" in '
      + 'het document en levert een bevinding op over onze eigen nepnaam.',
    ).toEqual([]);
  });

  it('elke voornaam is minstens vier letters', () => {
    // Kortere namen lopen kans als deel van een ander woord te worden geraakt.
    expect(voornamen.filter(n => n.length < 4)).toEqual([]);
  });

  it('de pools overlappen niet — een kind en een ouder krijgen nooit dezelfde naam', () => {
    const ouders = new Set(NEP_PERSONEN.map(p => p.fn.toLowerCase()));
    expect(NEP_KINDEREN.filter(k => ouders.has(k.toLowerCase()))).toEqual([]);
  });

  it('een meisje met een "haar"-verwijzing levert geen naam-tegenspraak op', () => {
    // Het concrete geval van 24-08-2026: drie kinderen, eerste een meisje.
    const { naarAnon } = bouwAnonMap({
      partij_a_naam:  'Jan Willem Huzen',
      partij_b_naam:  'Nické Meijerink',
      kinderen_namen: ['Liva Milia Huzen', 'Delon Len Huzen', 'Verel Nicci Huzen'],
    });
    const nep = naarAnon.get('liva');
    expect(nep).toBeTruthy();
    expect(GENDERED).not.toContain(nep.toLowerCase());
  });
});

// ── PII-vervanging mag niet afhangen van de namenmap ─────────────────────────
//
// Tot 24 augustus 2026 begon anonimiseerTekst met
//     if (!tekst || !naarAnon?.size) return tekst;
// Vond de classificatie geen enkele naam, dan kwam de tekst er ONGEWIJZIGD uit —
// dus mét adres, postcode, BSN, telefoonnummer en e-mailadres, en zo ging hij naar
// de Anthropic API. Een lege namenmap is geen reden om de PII-stap over te slaan;
// het zijn twee losse dingen die toevallig in één functie zaten.
describe('anonimiseerTekst — PII los van namen', () => {
  /** Genummerde placeholders, zoals _maakPiiTracker in index.html ze maakt. */
  // Zelfde vorm als _maakPiiTracker in index.html: per TYPE genummerd, en
  // dezelfde waarde krijgt altijd dezelfde placeholder.
  const tracker = () => {
    const m = new Map(); const n = {};
    return (type, waarde) => {
      const k = `${type}:${waarde}`;
      if (!m.has(k)) { n[type] = n[type] ?? 0; m.set(k, `[${type}_${n[type]++}]`); }
      return m.get(k);
    };
  };
  const PII = 'Bergstraat 12 te Utrecht, postcode 3511 AB, BSN 123456789, tel 06-12345678, mail jan@example.com';

  it('vervangt PII ook als er geen enkele naam bekend is', () => {
    const r = anonimiseerTekst(PII, new Map(), tracker());
    for (const lek of ['Bergstraat', 'Utrecht', '3511 AB', '123456789', '06-12345678', 'jan@example.com']) {
      expect(r, `"${lek}" staat nog in de tekst die naar de API gaat`).not.toContain(lek);
    }
  });

  it('crasht niet op een ontbrekende namenmap', () => {
    expect(anonimiseerTekst('BSN 123456789', undefined, tracker())).toBe('BSN [BSN]');
    expect(anonimiseerTekst('BSN 123456789', null)).toBe('BSN [BSN]');
  });

  it('laat lege tekst met rust', () => {
    expect(anonimiseerTekst('', new Map(), tracker())).toBe('');
    expect(anonimiseerTekst(null, new Map(), tracker())).toBe(null);
  });
});

// ── Woonplaats direct na een adres ──────────────────────────────────────────
//
// "de woning aan de Bergstraat 12 te Utrecht" is de gangbaarste vorm in een
// convenant, en werd door geen enkel patroon geraakt: die vroegen om een postcode
// ervóór of om "wonende te". De plaatsnaam ging dus mee naar de API.
describe('anonimiseerTekst — woonplaats na een adres', () => {
  // Zelfde vorm als _maakPiiTracker in index.html: per TYPE genummerd, en
  // dezelfde waarde krijgt altijd dezelfde placeholder.
  const tracker = () => {
    const m = new Map(); const n = {};
    return (type, waarde) => {
      const k = `${type}:${waarde}`;
      if (!m.has(k)) { n[type] = n[type] ?? 0; m.set(k, `[${type}_${n[type]++}]`); }
      return m.get(k);
    };
  };

  it('vervangt de plaats in "<adres> te <Plaats>"', () => {
    const r = anonimiseerTekst('De woning aan de Bergstraat 12 te Utrecht wordt verkocht.', new Map(), tracker());
    expect(r).not.toContain('Utrecht');
    expect(r).toMatch(/\[ADRES_\d+\] te \[WOONPLAATS_\d+\]/);
  });

  it('vervangt de plaats ook zonder "te", en houdt de tekst verder intact', () => {
    const r = anonimiseerTekst('Gelegen aan de Dorpsstraat 5 Almelo, kadastraal bekend.', new Map(), tracker());
    expect(r).not.toContain('Almelo');
    expect(r).toMatch(/\[ADRES_\d+\] \[WOONPLAATS_\d+\], kadastraal bekend\./);
  });

  it('ziet een nieuwe zin niet aan voor een plaatsnaam', () => {
    const r = anonimiseerTekst('De woning aan de Kerkweg 3. De partijen komen overeen.', new Map(), tracker());
    expect(r).toContain('De partijen komen overeen.');
    expect(r).not.toMatch(/WOONPLAATS/);
  });

  it('raakt een plaats die al een placeholder is niet nog een keer aan', () => {
    const r = anonimiseerTekst('Adres: Bergstraat 12 te Utrecht en Bergstraat 12 te Utrecht.', new Map(), tracker());
    // Tweemaal hetzelfde adres en dezelfde plaats → tweemaal dezelfde placeholder.
    // Kregen ze verschillende nummers, dan zou een analyse twee woningen zien
    // waar er één staat.
    const plaatsen = [...r.matchAll(/\[WOONPLAATS_(\d+)\]/g)].map(m => m[1]);
    const adressen = [...r.matchAll(/\[ADRES_(\d+)\]/g)].map(m => m[1]);
    expect(plaatsen).toHaveLength(2);
    expect(new Set(plaatsen).size).toBe(1);
    expect(new Set(adressen).size).toBe(1);
  });
});

// ── Een nepnaam mag niets betekenen ─────────────────────────────────────────
//
// Op 24 augustus 2026 stond `Oud` in de pool met nep-achternamen. Dat is een
// bestaande Nederlandse achternaam, maar ook een doodgewoon woord — en "oud en
// nieuw" staat in élk ouderschapsplan onder de feestdagen. Het terugzetten van de
// namen is hoofdletterongevoelig, dus de zin werd:
//
//     "de wissel op oud en nieuw"  →  "de wissel op Lenders en nieuw"
//
// De mediator las een bevinding over een regeling "Lenders & Nieuw" die nergens
// bestond. Dezelfde klasse fout als de gendered namen hierboven: een nepnaam die
// iets betekent, wordt door de tekst tegengesproken of vernielt hem.
//
// De lijst is met de hand samengesteld en dus niet uitputtend. Twijfel je bij een
// naam, dan is dat zelf het antwoord — kies er een die alleen een naam kan zijn.
describe('nep-namenpools dragen geen woordbetekenis', () => {
  const WOORDEN = new Set([
    // stond hier tot 24-08-2026
    'oud', 'wester', 'kroon',
    // veelvoorkomend in scheidingsdocumenten, dus extra riskant
    'nieuw', 'jong', 'groot', 'klein', 'hoog', 'laag', 'lang', 'kort', 'vast',
    'huis', 'woning', 'kind', 'kinderen', 'ouder', 'ouders', 'man', 'vrouw',
    'jaar', 'maand', 'week', 'dag', 'deel', 'helft', 'rest', 'som', 'bedrag',
    'recht', 'plan', 'akte', 'raad', 'zorg', 'gezag', 'omgang', 'wissel',
    'bank', 'schuld', 'waarde', 'winst', 'werk', 'loon', 'pensioen',
  ]);

  const namen = [...NEP_PERSONEN.map(p => p.fn), ...NEP_PERSONEN.map(p => p.an), ...NEP_KINDEREN];

  it('geen enkele nepnaam is een gewoon Nederlands woord', () => {
    const fout = namen.filter(n => WOORDEN.has(n.toLowerCase()));
    expect(
      fout,
      `Deze nepnamen zijn ook een gewoon woord: ${fout.join(', ')}. Bij het terugzetten `
      + 'van de namen wordt elk voorkomen vervangen, hoofdletterongevoelig — dus ook '
      + 'midden in een gewone zin. Kies een naam die alleen een naam kan zijn.',
    ).toEqual([]);
  });

  it('"oud en nieuw" blijft heel na anonimiseren en terugzetten', () => {
    // Het concrete geval. Loopt langs beide richtingen: eerst anonimiseren met de
    // echte namen erin, dan terugzetten zoals herstelAnonObj dat doet.
    const { naarAnon, naarEcht } = bouwAnonMap({
      partij_a_naam: 'Jan Huzen',
      partij_b_naam: 'Nicky Meijerink',
      mediator_naam: 'Alexander Lenders',
    });
    const zin = 'De wissel op oud en nieuw; het kind blijft tot en met Oud en Nieuw bij de vader.';
    const geanonimiseerd = anonimiseerTekst(zin, naarAnon);

    let hersteld = geanonimiseerd;
    for (const [nep, echt] of [...naarEcht.entries()].sort((a, b) => b[0].length - a[0].length)) {
      hersteld = hersteld.replace(
        new RegExp(`(?<![a-zA-ZÀ-ÿ])${nep}(?![a-zA-ZÀ-ÿ])`, 'gi'), echt);
    }
    expect(hersteld).toContain('oud en nieuw');
    expect(hersteld).toContain('Oud en Nieuw');
    expect(hersteld).not.toContain('Lenders en nieuw');
  });
});

describe('anonimiseerTekst — woonplaats zonder adres of postcode ervoor', () => {
  // Aanleiding: een echte analyse op 5 september 2026. De residu-controle meldde "Holten"
  // en "Deventer" als niet-vervangen. Nagemeten bleek waarom: de patronen dekten
  // "geboren te X" en "wonende te <postcode> X", maar niet de vorm waarin een convenant
  // de echtelijke woning meestal aanduidt — "de woning is gelegen te Holten" — en evenmin
  // "woonachtig ín" in plaats van "te".
  const tracker = () => {
    const m = new Map(); const n = {};
    return (type, waarde) => {
      const k = `${type}:${waarde}`;
      if (!m.has(k)) { n[type] = n[type] ?? 0; m.set(k, `[${type}_${n[type]++}]`); }
      return m.get(k);
    };
  };
  const anon = (t) => anonimiseerTekst(t, new Map(), tracker());

  it('vervangt de plaats bij de woning zelf', () => {
    expect(anon('De echtelijke woning is gelegen te Holten.')).not.toContain('Holten');
    expect(anon('De woning te Holten wordt verkocht.')).not.toContain('Holten');
    expect(anon('Het woonhuis in Almelo blijft bij de man.')).not.toContain('Almelo');
  });

  it('kent ook "in" naast "te"', () => {
    expect(anon('Partijen zijn woonachtig in Holten.')).not.toContain('Holten');
    expect(anon('De vrouw staat ingeschreven te Deventer.')).not.toContain('Deventer');
  });

  it('laat geen woord uit de tekst verdwijnen', () => {
    // Dit was een echte fout, en de ernstigste van de twee: met de /i-vlag werd óók
    // `[A-Z]` hoofdletterongevoelig, waardoor het tweede naamdeel het vólgende woord ving.
    // "wonende te Holten wordt verkocht" leverde dan één placeholder voor "Holten wordt"
    // op — er verdween tekst uit het document dat naar Claude gaat.
    expect(anon('De woning te Holten wordt verkocht.')).toMatch(/wordt verkocht\.$/);
    expect(anon('Het woonhuis in Almelo blijft bij de man.')).toMatch(/blijft bij de man\.$/);
    expect(anon('Wonende te Almelo, verder te noemen de vrouw.')).toMatch(/verder te noemen de vrouw\.$/);
  });

  it('laat een land staan — dat is geen woonplaats maar een rechtsgebied', () => {
    // De IPR-toets leidt uit "partijen wonen in verschillende landen" af welke verordening
    // geldt. Zou "Duitsland" hier verdwijnen, dan valt precies dat gegeven weg.
    expect(anon('De woning is gelegen in Duitsland.')).toContain('Duitsland');
    const beide = anon('De vrouw is woonachtig in België, de man in Nederland.');
    expect(beide).toContain('België');
    expect(beide).toContain('Nederland');
  });

  it('grijpt niet naar een willekeurig woord na "te"', () => {
    // Een los "te <woord>" komt in juridische tekst overal voor. Met de /i-vlag werd
    // "de woning wordt te koop gezet" tot "te [WOONPLAATS_0]".
    expect(anon('De woning wordt te koop gezet.')).toContain('te koop');
    expect(anon('Dit dient te geschieden binnen twee weken.')).toContain('te geschieden');
  });

  it('laat de zittingsplaats van een gerecht staan, maar de woonplaats niet', () => {
    // Besluit van de eigenaar, 5 september 2026: de plaats ná "rechtbank" blijft staan,
    // omwille van de leesbaarheid van het stuk.
    //
    // De afweging die daarbij op tafel lag, vastgelegd zodat ze terug te vinden is:
    // de bevoegde rechtbank is die van de woonplaats van verweerder (art. 262 Rv), dus
    // "rechtbank te Deventer" wijst in de praktijk naar waar een partij woont — terwijl
    // die woonplaats er in dezelfde zin juist uit gaat. En pseudonimiseren zou de
    // juridische toets niets gekost hebben: dezelfde plaats krijgt dezelfde placeholder.
    // Gemeten vóór het besluit:
    //   "woonachtig te Deventer … rechtbank te Deventer"  → [WOONPLAATS_0] … [WOONPLAATS_0]
    //   "woonachtig te Deventer … rechtbank te Amsterdam" → [WOONPLAATS_0] … [WOONPLAATS_1]
    const uit = anonimiseerTekst(
      'Partijen zijn woonachtig te Deventer. De rechtbank te Deventer is bevoegd.',
      new Map(), tracker());
    expect(uit).toMatch(/woonachtig te \[WOONPLAATS_\d+\]/);
    expect(uit).toMatch(/rechtbank te Deventer/);
  });
});
