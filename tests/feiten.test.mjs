// tests/feiten.test.mjs
// Unit-tests voor api/_feiten.js
// Gebruik: npx vitest run tests/feiten.test.mjs

import { test } from 'vitest';
import { strict as assert } from 'node:assert';
import { verrijkResolvedFields, bouwFeitenBlok, valideerConsistentie,
         jaarUitDatum, maandJaarUitDatum, leeftijdUitDatum } from '../api/_feiten.js';

// ── Testdata uit de praktijk ──────────────────────────────────────────────────

const DOSSIER_LEBBINK = `
Gerjon (man) en Annemieke (vrouw). Huwelijkse voorwaarden van toepassing: koude uitsluiting.
Staat van aanbrengsten vermeldt dat de man de woning heeft aangebracht met geldleningen.
Woning staat op naam van de man. Vrouw is al elders ingeschreven (tijdelijk adres).
Woning wordt verkocht zodra vrouw een definitieve huurwoning heeft.
`;

const VRAAG_DAKLOZE =
  'Man blijft in huis wonen tot huis verkocht wordt (vrouw is al elders ingeschreven). ' +
  'Woning wordt verkocht zodra de vrouw een definitieve huurwoning heeft. ' +
  'Da man wil een dakloze ondertussen bij hem in laten wonen. ' +
  'Geef aan of dit zomaar kan en wat hier de mogelijke gevolgen van zijn';

const DOSSIER_SAMENWONERS = 'Partijen wonen samen zonder huwelijk. Geen samenlevingscontract.';

const DOSSIER_BEPERKTE = `
Partijen gehuwd op 15 maart 2019. Beperkte gemeenschap van goederen van toepassing.
Woning gezamenlijk aangekocht tijdens huwelijk.
`;

// ── 1. verrijkResolvedFields ──────────────────────────────────────────────────

test('Lebbink: hv_stelsel = koude_uitsluiting uit vrije tekst', () => {
  const r = verrijkResolvedFields({}, DOSSIER_LEBBINK);
  assert.equal(r.hv_stelsel, 'koude_uitsluiting');
});

test('Lebbink: woning_eigenaar = man uit staat van aanbrengsten', () => {
  const r = verrijkResolvedFields({}, DOSSIER_LEBBINK);
  assert.equal(r.woning_eigenaar, 'man');
});

test('Structuurveld heeft prioriteit boven tekstextractie', () => {
  const r = verrijkResolvedFields({ hv_stelsel: 'beperkte_gemeenschap' }, DOSSIER_LEBBINK);
  assert.equal(r.hv_stelsel, 'beperkte_gemeenschap', 'structuurveld mag niet overschreven worden');
});

test('Samenwoners herkend uit vrije tekst', () => {
  const r = verrijkResolvedFields({}, DOSSIER_SAMENWONERS);
  assert.equal(r.relatievorm, 'samenwoners');
});

test('Beperkte gemeenschap herkend', () => {
  const r = verrijkResolvedFields({}, DOSSIER_BEPERKTE);
  assert.equal(r.hv_stelsel, 'beperkte_gemeenschap');
});

test('Leeg dossier → ongewijzigde resolvedFields', () => {
  const input = { partneralimentatie: 'ja' };
  const r = verrijkResolvedFields(input, '');
  assert.equal(r.partneralimentatie, 'ja');
  assert.equal(r.hv_stelsel, undefined);
});

// ── 2. bouwFeitenBlok ─────────────────────────────────────────────────────────

test('Lebbink: JURIDISCHE FEITEN bevat koude uitsluiting', () => {
  const rf = verrijkResolvedFields({}, DOSSIER_LEBBINK);
  const blok = bouwFeitenBlok(rf);
  assert.ok(blok.includes('KOUDE UITSLUITING'), blok);
});

test('Lebbink: JURIDISCHE FEITEN bevat woning privébezit man', () => {
  const rf = verrijkResolvedFields({}, DOSSIER_LEBBINK);
  const blok = bouwFeitenBlok(rf);
  assert.ok(blok.includes('privébezit man'), blok);
});

test('Lebbink: BELANG-ANALYSE bevat CONVENANT-CONCLUSIE: hoort NIET in het convenant', () => {
  const rf = verrijkResolvedFields({}, DOSSIER_LEBBINK);
  const blok = bouwFeitenBlok(rf);
  assert.ok(blok.includes('BELANG-ANALYSE'), blok);
  assert.ok(blok.includes('hoort NIET in het convenant'), blok);
});

test('Samenwoners: WVPS-uitsluiting in belang-analyse', () => {
  const rf = verrijkResolvedFields({}, DOSSIER_SAMENWONERS);
  const blok = bouwFeitenBlok(rf);
  assert.ok(blok.includes('SAMENWONERS'), blok);
  assert.ok(blok.includes('WVPS') && blok.includes('NIET'), blok);
});

test('Leeg resolvedFields → leeg blok', () => {
  const blok = bouwFeitenBlok({});
  assert.equal(blok, '');
});

test('Koude uitsluiting zonder woning_eigenaar → vraag naar inbrenger', () => {
  const blok = bouwFeitenBlok({ hv_stelsel: 'koude_uitsluiting' });
  assert.ok(blok.includes('onbekend') || blok.includes('stel eerst vast'), blok);
});

test('Pensioen uitgesloten → uitsluiting vermeld in belang', () => {
  const blok = bouwFeitenBlok({ pensioen_verevening: 'nee' });
  assert.ok(blok.includes('NIET van toepassing'), blok);
});

// ── 3. valideerConsistentie ───────────────────────────────────────────────────

test('Lebbink: balans-signaal over verkoopopbrengst wordt verwijderd', () => {
  const rf = verrijkResolvedFields({}, DOSSIER_LEBBINK);
  const output = {
    aannames: ['woning is privébezit Gerjon (koude uitsluiting)'],
    signalen: [
      { perspectief: 'balans',    ernst: 'midden', tekst: 'Annemieke heeft als toekomstig gerechtigde belang bij de verkoopopbrengst van de woning.' },
      { perspectief: 'juridisch', ernst: 'hoog',   tekst: 'Art. 1:88 BW vereist toestemming van Annemieke zolang het huwelijk voortduurt.' },
    ],
  };
  valideerConsistentie(output, rf);
  assert.equal(output.signalen.length, 1, 'balans-signaal moet verwijderd zijn');
  assert.equal(output.signalen[0].perspectief, 'juridisch');
});

test('Lebbink: financieel-signaal over mede-eigenaar wordt verwijderd', () => {
  const rf = verrijkResolvedFields({}, DOSSIER_LEBBINK);
  const output = {
    aannames: ['koude uitsluiting'],
    signalen: [
      { perspectief: 'financieel', ernst: 'hoog', tekst: 'Vrouw is mede-eigenaar en heeft belang bij de woning.' },
    ],
  };
  valideerConsistentie(output, rf);
  assert.equal(output.signalen.length, 0);
});

test('Lebbink: juridisch-signaal over art. 1:88 blijft bewaard', () => {
  const rf = verrijkResolvedFields({}, DOSSIER_LEBBINK);
  const output = {
    aannames: [],
    signalen: [
      { perspectief: 'juridisch', ernst: 'hoog', tekst: 'Art. 1:88 lid 1 sub a BW vereist schriftelijke toestemming.' },
    ],
  };
  valideerConsistentie(output, rf);
  assert.equal(output.signalen.length, 1);
});

test('Samenwoners: WVPS-signaal wordt verwijderd', () => {
  const rf = { relatievorm: 'samenwoners' };
  const output = {
    aannames: [],
    signalen: [
      { perspectief: 'juridisch', ernst: 'hoog', tekst: 'Pensioenverevening op basis van WVPS is van toepassing.' },
      { perspectief: 'juridisch', ernst: 'hoog', tekst: 'Partijen zijn niet gehuwd.' },
    ],
  };
  valideerConsistentie(output, rf);
  assert.equal(output.signalen.length, 1);
  assert.ok(output.signalen[0].tekst.includes('niet gehuwd'));
});

test('Samenwoners: partneralimentatie-signaal wordt verwijderd', () => {
  const rf = { relatievorm: 'samenwoners' };
  const output = {
    aannames: [],
    signalen: [
      { perspectief: 'juridisch', ernst: 'midden', tekst: 'Partneralimentatie kan worden gevorderd via art. 1:157 BW.' },
    ],
  };
  valideerConsistentie(output, rf);
  assert.equal(output.signalen.length, 0);
});

test('Samenwoners: signaal "geen recht op partneralimentatie" blijft bewaard', () => {
  const rf = { relatievorm: 'samenwoners' };
  const output = {
    aannames: [],
    signalen: [
      { perspectief: 'juridisch', ernst: 'midden', tekst: 'Samenwoners hebben geen recht op partneralimentatie.' },
    ],
  };
  valideerConsistentie(output, rf);
  assert.equal(output.signalen.length, 1);
});

test('Geen feiten → output ongewijzigd', () => {
  const output = {
    aannames: [],
    signalen: [
      { perspectief: 'balans', ernst: 'midden', tekst: 'Willekeurig signaal.' },
    ],
  };
  valideerConsistentie(output, {});
  assert.equal(output.signalen.length, 1, 'zonder feiten niets verwijderen');
});

// ── 4. AVG-generalisatie ──────────────────────────────────────────────────────
// Deze tests bewaken een privacy-garantie: volledige geboorte- en huwelijksdatums
// mogen het feitenblok (en daarmee de Anthropic-prompt) niet bereiken.

test('jaarUitDatum: dd-mm-jjjj → jaartal', () => {
  assert.equal(jaarUitDatum('12-03-1978'), 1978);
  assert.equal(jaarUitDatum('01-01-2018'), 2018);
});

test('jaarUitDatum: kaal jaartal blijft geldig', () => {
  assert.equal(jaarUitDatum('1985'), 1985);
});

test('jaarUitDatum: onzin en randgevallen geven null', () => {
  assert.equal(jaarUitDatum(''), null);
  assert.equal(jaarUitDatum(null), null);
  assert.equal(jaarUitDatum('onbekend'), null);
  assert.equal(jaarUitDatum('12-03-1850'), null, 'vóór 1900 is geen plausibel jaartal');
});

test('leeftijdUitDatum: rekent met een expliciet peiljaar', () => {
  assert.equal(leeftijdUitDatum('12-03-1978', 2026), 48);
  assert.equal(leeftijdUitDatum('onbekend', 2026), null);
});

test('leeftijdUitDatum: toekomstige geboortedatum geeft null', () => {
  assert.equal(leeftijdUitDatum('01-01-2030', 2026), null);
});

test('AVG: volledige geboortedatum komt NIET in het feitenblok', () => {
  const blok = bouwFeitenBlok({
    partij_a_geboortedatum: '12-03-1978',
    partij_b_geboortedatum: '05-11-1981',
  });
  assert.ok(!blok.includes('12-03-1978'), 'geboortedatum A lekt in het feitenblok');
  assert.ok(!blok.includes('05-11-1981'), 'geboortedatum B lekt in het feitenblok');
  assert.ok(/Leeftijd partij A: \d+ jaar/.test(blok), 'leeftijd A ontbreekt: ' + blok);
  assert.ok(/Leeftijd partij B: \d+ jaar/.test(blok), 'leeftijd B ontbreekt: ' + blok);
});

test('maandJaarUitDatum: dd-mm-jjjj → mm-jjjj', () => {
  assert.equal(maandJaarUitDatum('15-06-2019'), '06-2019');
  assert.equal(maandJaarUitDatum('1-1-2018'), '01-2018', 'maand moet met voorloopnul');
});

test('maandJaarUitDatum: zonder maand terugvallen op het jaartal', () => {
  assert.equal(maandJaarUitDatum('2019'), '2019');
  assert.equal(maandJaarUitDatum('onbekend'), null);
});

test('maandJaarUitDatum: onmogelijke maand terugvallen op het jaartal', () => {
  assert.equal(maandJaarUitDatum('15-13-2019'), '2019');
});

test('AVG: volledige huwelijksdatum komt NIET in het feitenblok', () => {
  const blok = bouwFeitenBlok({ huwelijksdatum: '15-06-2019' });
  assert.ok(!blok.includes('15-06-2019'), 'huwelijksdatum lekt in het feitenblok');
  assert.ok(!/\b15[-/]06/.test(blok), 'de dag mag nergens opduiken: ' + blok);
  assert.ok(blok.includes('Verbintenis (maand-jaar): 06-2019'), 'maand-jaar ontbreekt: ' + blok);
});

test('AVG-uitzondering: nationaliteit gaat wél exact mee', () => {
  const blok = bouwFeitenBlok({ nationaliteit_a: 'Marokkaanse', nationaliteit_b: 'Nederlandse' });
  assert.ok(blok.includes('Marokkaanse'), 'nationaliteit moet exact meegaan: ' + blok);
  assert.ok(blok.includes('Brussel IIb'), 'internationaal element niet gesignaleerd: ' + blok);
});

test('AVG: onherkenbare datum levert geen half geparste waarde op', () => {
  const blok = bouwFeitenBlok({ huwelijksdatum: 'ergens in de jaren 90' });
  assert.ok(!/Verbintenis/.test(blok), 'onherkenbare datum mag niets opleveren: ' + blok);
});
