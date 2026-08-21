/**
 * Unit tests — src/docx/zin-samenvoegen.js
 *
 * De gevallen komen uit een ouderschapsplan van 21 augustus 2026, geconverteerd
 * door Adobe. Daar liep een zin over een paginagrens en bleef hij gebroken staan
 * met een half lege pagina ertussen.
 */

import { describe, it, expect } from 'vitest';
import {
  hoortAaneen, eindigtMidZin, begintAlsVervolg, volgendeMetTekst,
} from '../../src/docx/zin-samenvoegen.js';

const HELFT_1 = 'Beide ouders zullen de benodigde financiële gegevens verstrekken, '
  + 'zodra een van hen een verzoek doet voor';
const HELFT_2 = 'het aanpassen van de onderhoudsbijdrage. Er zal dan door een onafhankelijke '
  + 'derde een alimentatieberekening gemaakt worden.';

describe('het geval dat aanleiding was', () => {
  it('herkent de twee helften als één zin', () => {
    expect(hoortAaneen(HELFT_1, HELFT_2)).toBe(true);
  });

  it('vindt de tweede helft ook met lege alineas ertussen', () => {
    // Adobe laat op de paginagrens de voettekst achter; na opruiming blijft leegte.
    const teksten = [HELFT_1, '', '  ', HELFT_2];
    expect(volgendeMetTekst(teksten, 1)).toEqual({ index: 3, lege: [1, 2] });
  });

  it('geeft de lege alineas terug zodat ze weg kunnen', () => {
    const { lege } = volgendeMetTekst([HELFT_1, '', HELFT_2], 1);
    expect(lege).toEqual([1]);
  });
});

describe('eindigtMidZin', () => {
  it('is waar zonder afsluitend leesteken', () => {
    expect(eindigtMidZin('een verzoek doet voor')).toBe(true);
    expect(eindigtMidZin('Moeder (rekening gehouden met een zorgkorting van 39%): €')).toBe(true);
  });

  it('is onwaar bij een afgeronde zin', () => {
    expect(eindigtMidZin('De ouders zijn dit overeengekomen.')).toBe(false);
    expect(eindigtMidZin('Let op het volgende:')).toBe(false);
    expect(eindigtMidZin('Klopt dat?')).toBe(false);
  });

  it('is onwaar bij lege tekst', () => {
    expect(eindigtMidZin('')).toBe(false);
    expect(eindigtMidZin(null)).toBe(false);
  });
});

describe('begintAlsVervolg', () => {
  it('herkent een kleine letter, bedrag, cijfer of haakje', () => {
    expect(begintAlsVervolg('het aanpassen van')).toBe(true);
    expect(begintAlsVervolg('573,- Resterend budget')).toBe(true);
    expect(begintAlsVervolg('€ 455,-')).toBe(true);
    expect(begintAlsVervolg('(A) opgebouwd als volgt')).toBe(true);
  });

  it('herkent een nieuwe zin niet als vervolg', () => {
    expect(begintAlsVervolg('De ouders spreken af dat')).toBe(false);
    expect(begintAlsVervolg('Ouderlijk gezag')).toBe(false);
  });
});

describe('hoortAaneen — terughoudendheid', () => {
  it('plakt niets aan een heel korte alinea', () => {
    // Losse letters en nummertjes die de conversie achterlaat.
    expect(hoortAaneen('a', 'het vervolg')).toBe(false);
    expect(hoortAaneen('12', 'het vervolg')).toBe(false);
  });

  it('plakt niets aan een afgeronde zin', () => {
    expect(hoortAaneen('De ouders zijn dit overeengekomen.', 'het aanpassen van')).toBe(false);
  });

  it('plakt geen nieuwe zin aan een openstaande', () => {
    expect(hoortAaneen(HELFT_1, 'De ouders spreken vervolgens af')).toBe(false);
  });
});

describe('volgendeMetTekst', () => {
  it('geeft de directe buur als die tekst heeft', () => {
    expect(volgendeMetTekst(['a', 'b'], 1)).toEqual({ index: 1, lege: [] });
  });

  it('geeft niets als er te veel lege alineas volgen', () => {
    // Meer dan drie is geen paginaovergang meer maar een bewuste witregel.
    expect(volgendeMetTekst(['a', '', '', '', '', 'b'], 1)).toBe(null);
  });

  it('geeft niets aan het einde van het document', () => {
    expect(volgendeMetTekst(['a', '', ''], 1)).toBe(null);
    expect(volgendeMetTekst(['a'], 1)).toBe(null);
  });
});
