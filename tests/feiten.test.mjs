// tests/feiten.test.mjs
// Unit-tests voor api/_feiten.js
// Gebruik: node tests/feiten.test.mjs

import { strict as assert } from 'node:assert';
import { verrijkResolvedFields, bouwFeitenBlok, valideerConsistentie } from '../api/_feiten.js';

let passed = 0;
let failed = 0;

function test(naam, fn) {
  try {
    fn();
    console.log(`  ✓  ${naam}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${naam}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

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
console.log('\n── 1. verrijkResolvedFields ─────────────────────────────────────');

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
console.log('\n── 2. bouwFeitenBlok ────────────────────────────────────────────');

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
console.log('\n── 3. valideerConsistentie ──────────────────────────────────────');

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

// ── Resultaat ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(52)}`);
console.log(`  ${passed} geslaagd  |  ${failed} mislukt`);
if (failed > 0) process.exit(1);
