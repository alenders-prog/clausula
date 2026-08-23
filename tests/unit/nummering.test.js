/**
 * Unit tests — src/docx/nummering.js
 *
 * Aanleiding (21 augustus 2026): een ouderschapsplan met "1. Ouderlijk gezag" werd
 * in Clausula getoond als "(A) Ouderlijk gezag". De omrekening volgde alleen het
 * abstracte niveau en negeerde de lvlOverride uit <w:num>.
 */

import { describe, it, expect } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import {
  formatteerNummer, bouwLabel, pasOverrideToe, volgendeTeller, injecteerNummering,
} from '../../src/docx/nummering.js';

const W   = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML = 'http://www.w3.org/XML/1998/namespace';

const ontleed = xml => new DOMParser().parseFromString(xml, 'application/xml');

/** De nummering-definities uit Test OP.docx, teruggebracht tot wat telt. */
const NUMBERING = ontleed(`<?xml version="1.0"?>
<w:numbering xmlns:w="${W}">
  <w:abstractNum w:abstractNumId="4">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl>
    <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2."/></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="2">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="upperLetter"/><w:lvlText w:val="(%1)"/></w:lvl>
    <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#9679;"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="5"><w:abstractNumId w:val="4"/></w:num>
  <w:num w:numId="1"><w:abstractNumId w:val="2"/></w:num>
  <w:num w:numId="9">
    <w:abstractNumId w:val="4"/>
    <w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"/></w:lvlOverride>
  </w:num>
</w:numbering>`);

const alinea = (tekst, numId, ilvl = 0) => numId == null
  ? `<w:p><w:r><w:t>${tekst}</w:t></w:r></w:p>`
  : `<w:p><w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>`
    + `<w:r><w:t>${tekst}</w:t></w:r></w:p>`;

const document = alineas => ontleed(`<?xml version="1.0"?>
<w:document xmlns:w="${W}"><w:body>${alineas.join('')}</w:body></w:document>`);

/** De tekst zoals mammoth.extractRawText hem zou opleveren: één regel per alinea. */
const alsTekst = doc => Array.from(doc.getElementsByTagNameNS(W, 'p')).map(p =>
  Array.from(p.getElementsByTagNameNS(W, 't')).map(t => t.textContent).join(''));

describe('het geval dat aanleiding was', () => {
  // 23 augustus 2026: een ouderschapsplan dat als DOCX werd geüpload. Word toont
  // "1. Ouderlijk gezag", maar Claude las alleen "Ouderlijk gezag" — de injectie
  // draaide destijds alleen na een Adobe-conversie, dus nooit op een Word-bestand.
  const doc = document([
    alinea('OUDERSCHAPSPLAN', null),
    alinea('Ouderlijk gezag', 5),
    alinea('Het ouderlijk gezag ligt bij beide ouders.', null),
    alinea('Woon- en verblijfplaats', 5),
    alinea('Identiteitsbewijzen', 5),
  ]);

  it('schrijft de kopnummers weg zoals Word ze toont', () => {
    expect(injecteerNummering(doc, NUMBERING, W, XML)).toBe(3);
    expect(alsTekst(doc)).toEqual([
      'OUDERSCHAPSPLAN',
      '1.\tOuderlijk gezag',
      'Het ouderlijk gezag ligt bij beide ouders.',
      '2.\tWoon- en verblijfplaats',
      '3.\tIdentiteitsbewijzen',
    ]);
  });

  it('haalt de numPr weg, anders nummert de viewer er nog eens overheen', () => {
    // Zonder deze stap toonde de concept-viewer "10. 10. Vakanties".
    expect(doc.getElementsByTagNameNS(W, 'numPr').length).toBe(0);
  });
});

describe('injecteerNummering', () => {
  it('slaat bullets over — die horen geen nummer te krijgen', () => {
    const doc = document([alinea('Telefoon', 1, 1), alinea('E-mail', 1, 1)]);
    expect(injecteerNummering(doc, NUMBERING, W, XML)).toBe(0);
    expect(alsTekst(doc)).toEqual(['Telefoon', 'E-mail']);
  });

  it('volgt het formaat van de lijst, ook als dat letters zijn', () => {
    const doc = document([alinea('Totaal budget kinderen', 1), alinea('Verblijfskosten', 1)]);
    injecteerNummering(doc, NUMBERING, W, XML);
    expect(alsTekst(doc)).toEqual(['(A)\tTotaal budget kinderen', '(B)\tVerblijfskosten']);
  });

  it('telt per lijst apart, zodat twee lijsten elkaar niet verschuiven', () => {
    const doc = document([
      alinea('Eerste kop', 5), alinea('Budget', 1),
      alinea('Tweede kop', 5), alinea('Kosten', 1),
    ]);
    injecteerNummering(doc, NUMBERING, W, XML);
    expect(alsTekst(doc)).toEqual(['1.\tEerste kop', '(A)\tBudget', '2.\tTweede kop', '(B)\tKosten']);
  });

  it('nummert subniveaus mee en reset ze bij een nieuwe kop', () => {
    const doc = document([
      alinea('Zorgverdeling', 5),
      alinea('Vakanties', 5, 1), alinea('Feestdagen', 5, 1),
      alinea('Financiën', 5),
      alinea('Kinderrekening', 5, 1),
    ]);
    injecteerNummering(doc, NUMBERING, W, XML);
    expect(alsTekst(doc)).toEqual([
      '1.\tZorgverdeling', '1.1.\tVakanties', '1.2.\tFeestdagen',
      '2.\tFinanciën', '2.1.\tKinderrekening',
    ]);
  });

  it('respecteert een startOverride uit <w:num>', () => {
    const doc = document([alinea('Vijfde punt', 9), alinea('Zesde punt', 9)]);
    injecteerNummering(doc, NUMBERING, W, XML);
    expect(alsTekst(doc)).toEqual(['5.\tVijfde punt', '6.\tZesde punt']);
  });

  it('laat een alinea zonder numPr ongemoeid', () => {
    const doc = document([alinea('Gewone tekst', null)]);
    expect(injecteerNummering(doc, NUMBERING, W, XML)).toBe(0);
    expect(alsTekst(doc)).toEqual(['Gewone tekst']);
  });

  it('slaat een numId over die niet in numbering.xml staat', () => {
    const doc = document([alinea('Weesalinea', 77)]);
    expect(injecteerNummering(doc, NUMBERING, W, XML)).toBe(0);
    expect(alsTekst(doc)).toEqual(['Weesalinea']);
  });

  it('doet niets zonder numbering.xml', () => {
    const doc = document([alinea('Ouderlijk gezag', 5)]);
    expect(injecteerNummering(doc, null, W, XML)).toBe(0);
  });
});

describe('formatteerNummer', () => {
  it('kent de gangbare formaten', () => {
    expect(formatteerNummer('decimal', 3)).toBe('3');
    expect(formatteerNummer('lowerLetter', 1)).toBe('a');
    expect(formatteerNummer('upperLetter', 2)).toBe('B');
    expect(formatteerNummer('lowerRoman', 4)).toBe('iv');
    expect(formatteerNummer('upperRoman', 9)).toBe('IX');
  });

  it('geeft null voor een bullet — die krijgt geen nummer', () => {
    expect(formatteerNummer('bullet', 1)).toBe(null);
  });

  it('geeft leeg voor "none"', () => {
    expect(formatteerNummer('none', 5)).toBe('');
  });

  it('valt terug op decimaal bij een onbekend formaat', () => {
    expect(formatteerNummer('ideographDigital', 7)).toBe('7');
  });

  it('blijft binnen het alfabet na 26', () => {
    expect(formatteerNummer('upperLetter', 27)).toBe('A');
  });
});

describe('bouwLabel', () => {
  it('vult meerdere niveaus in', () => {
    expect(bouwLabel('%1.%2.', {
      0: { formaat: 'decimal', teller: 3 },
      1: { formaat: 'decimal', teller: 8 },
    })).toBe('3.8.');
  });

  it('mengt formaten per niveau', () => {
    expect(bouwLabel('%1.%2)', {
      0: { formaat: 'decimal', teller: 2 },
      1: { formaat: 'lowerLetter', teller: 3 },
    })).toBe('2.c)');
  });

  it('laat een ontbrekend niveau weg in plaats van "undefined"', () => {
    expect(bouwLabel('%1.%2.', { 0: { formaat: 'decimal', teller: 1 } })).toBe('1..');
  });

  it('overleeft lege invoer', () => {
    expect(bouwLabel('')).toBe('');
    expect(bouwLabel(null)).toBe('');
    expect(bouwLabel('%1.')).toBe('.');
  });
});

describe('pasOverrideToe', () => {
  it('laat het abstracte niveau staan zonder override', () => {
    const abstract = { formaat: 'decimal', sjabloon: '%1.', start: 1 };
    expect(pasOverrideToe(abstract, null)).toEqual(abstract);
  });

  it('neemt alleen over wat de override zelf noemt', () => {
    const abstract = { formaat: 'upperLetter', sjabloon: '(%1)', start: 1 };
    expect(pasOverrideToe(abstract, { start: 5 }))
      .toEqual({ formaat: 'upperLetter', sjabloon: '(%1)', start: 5 });
  });
});

describe('volgendeTeller', () => {
  it('begint bij de opgegeven startwaarde', () => {
    const t = {};
    expect(volgendeTeller(t, 0, 1)).toBe(1);
    expect(volgendeTeller(t, 0, 1)).toBe(2);
  });

  it('respecteert een afwijkende start uit een override', () => {
    expect(volgendeTeller({}, 0, 5)).toBe(5);
  });

  it('reset diepere niveaus bij een nieuw bovenliggend nummer', () => {
    const t = {};
    volgendeTeller(t, 0);       // 1
    volgendeTeller(t, 1);       // 1.1
    volgendeTeller(t, 1);       // 1.2
    expect(t[1]).toBe(2);
    volgendeTeller(t, 0);       // 2 → diepere niveaus weg
    expect(t[1]).toBeUndefined();
  });

  it('laat hogere niveaus met rust', () => {
    const t = {};
    volgendeTeller(t, 0);
    volgendeTeller(t, 1);
    volgendeTeller(t, 2);
    expect(t[0]).toBe(1);
    expect(t[1]).toBe(1);
  });
});
