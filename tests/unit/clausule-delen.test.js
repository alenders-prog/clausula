/**
 * Unit tests — src/assistent/clausule-delen.js
 *
 * ECHT_ANTWOORD hieronder is overgenomen uit een clausule die de assistent op
 * 23 augustus 2026 opleverde. Let op de spatie in `--- TOELICHTING---` en op de
 * minimale tekst die op dezelfde regel als zijn markering staat: precies de twee
 * afwijkingen waar de oude, letterlijke herkenning op stukliep.
 */

import { describe, it, expect } from 'vitest';
import {
  splitsClausuleAntwoord, splitsToelichting, splitsMinimaleVereisten, isMinimaleVereistenKop,
} from '../../src/assistent/clausule-delen.js';

const ECHT_ANTWOORD = `**Zeggenschap beide partijen over te verkopen woning**

---

**Artikel [X] — Verkoop van de woning en medewerking van beide partijen**
De man en de vrouw zijn samen eigenaar van de woning aan [ADRES].

1. **Beslissingen over de verkoop nemen zij samen.** Dat betekent: de keuze voor een makelaar.
2. **Zij werken allebei mee aan alles wat nodig is.** Zij tekenen tijdig alle documenten.

--- TOELICHTING---

**Minimale vereisten**
De woning is gezamenlijk eigendom; voor verkoop is medewerking van beide partijen sowieso vereist. Een expliciete clausule is in fase 1 strikt genomen niet noodzakelijk.

---MINIMALE TEKST--- Partijen verbinden zich over en weer mee te werken aan al hetgeen notarieel noodzakelijk is voor de verkoop.

De uitgebreide versie hierboven voegt meerwaarde toe omdat zij fase 2 expliciet dekt: art. 1:88 BW vervalt op het moment van inschrijving.

---

**Valkuilen**
- **Vervallen art. 1:88 BW na beschikking.** Zonder contractuele grondslag heeft de vertrekkende partij geen wettelijk middel meer.
- **Ingebruikgeving aan derden.** Een bijdrage in natura kan al als huur kwalificeren.

---

**Toekomstige discussiepunten**
- **Minimale verkoopprijs niet ingevuld.** Als partijen nu geen ondergrens afspreken.
- **Hoogte boetebeding.** Een te laag bedrag heeft geen afschrikkende werking.`;

describe('het geval dat aanleiding was', () => {
  it('herkent de scheiding ondanks de spatie', () => {
    // `--- TOELICHTING---` in plaats van `---TOELICHTING---`.
    const { gevonden, clausule, toelichting } = splitsClausuleAntwoord(ECHT_ANTWOORD);
    expect(gevonden).toBe(true);
    expect(clausule).toMatch(/Artikel \[X\]/);
    expect(clausule).not.toMatch(/Minimale vereisten/);
    expect(toelichting).toMatch(/^\*\*Minimale vereisten\*\*/);
  });

  it('laat de valkuilen niet in de clausuletekst achter', () => {
    // Dit was de ergste van de twee: zonder splitsing gingen valkuilen en
    // discussiepunten mee het dossier in bij "Voeg toe als issue".
    const { clausule } = splitsClausuleAntwoord(ECHT_ANTWOORD);
    expect(clausule).not.toMatch(/Valkuilen|discussiepunten|MINIMALE TEKST/i);
  });

  it('vindt de minimale tekst ook op dezelfde regel als zijn markering', () => {
    const { toelichting } = splitsClausuleAntwoord(ECHT_ANTWOORD);
    const minSectie = splitsToelichting(toelichting).find(s => isMinimaleVereistenKop(s.kop));
    const { minimaleTekst } = splitsMinimaleVereisten(minSectie.body);
    expect(minimaleTekst).toBe(
      'Partijen verbinden zich over en weer mee te werken aan al hetgeen notarieel '
      + 'noodzakelijk is voor de verkoop.',
    );
  });
});

describe('splitsClausuleAntwoord', () => {
  it('accepteert de schrijfwijzen die in de praktijk voorkomen', () => {
    for (const sep of ['---TOELICHTING---', '--- TOELICHTING---', '---TOELICHTING ---',
      '----TOELICHTING----', '--- Toelichting ---', '---toelichting---']) {
      const { gevonden, clausule } = splitsClausuleAntwoord(`De clausule.\n${sep}\nDe uitleg.`);
      expect(gevonden, sep).toBe(true);
      expect(clausule, sep).toBe('De clausule.');
    }
  });

  it('meldt het als de scheiding ontbreekt, en houdt alles als clausule', () => {
    const uit = splitsClausuleAntwoord('Alleen een clausule, geen toelichting.');
    expect(uit).toEqual({
      clausule: 'Alleen een clausule, geen toelichting.', toelichting: '', gevonden: false,
    });
  });

  it('overleeft lege invoer', () => {
    expect(splitsClausuleAntwoord('')).toEqual({ clausule: '', toelichting: '', gevonden: false });
    expect(splitsClausuleAntwoord(null)).toEqual({ clausule: '', toelichting: '', gevonden: false });
  });
});

describe('splitsToelichting', () => {
  it('vindt de drie secties uit het echte antwoord', () => {
    const { toelichting } = splitsClausuleAntwoord(ECHT_ANTWOORD);
    expect(splitsToelichting(toelichting).map(s => s.kop))
      .toEqual(['Minimale vereisten', 'Valkuilen', 'Toekomstige discussiepunten']);
  });

  it('haalt de scheidingslijnen tussen secties weg', () => {
    const { toelichting } = splitsClausuleAntwoord(ECHT_ANTWOORD);
    const valkuilen = splitsToelichting(toelichting).find(s => s.kop === 'Valkuilen');
    expect(valkuilen.body).not.toMatch(/^-{3,}$/m);
    expect(valkuilen.body).toMatch(/Vervallen art\. 1:88 BW/);
  });

  it('geeft een lege lijst bij lege invoer', () => {
    expect(splitsToelichting('')).toEqual([]);
    expect(splitsToelichting(null)).toEqual([]);
  });

  it('noemt een sectie zonder vette kop gewoon Toelichting', () => {
    expect(splitsToelichting('Losse tekst zonder kop.')).toEqual([
      { kop: 'Toelichting', body: 'Losse tekst zonder kop.' },
    ]);
  });
});

describe('splitsMinimaleVereisten', () => {
  const BODY = 'De onderbouwing staat hier.\n\n---MINIMALE TEKST---\nDe korte clausule.\n\n'
    + 'En dit legt de meerwaarde uit.';

  it('splitst in onderbouwing, minimale tekst en meerwaarde', () => {
    expect(splitsMinimaleVereisten(BODY)).toEqual({
      onderbouwing:  'De onderbouwing staat hier.',
      minimaleTekst: 'De korte clausule.',
      meerwaarde:    'En dit legt de meerwaarde uit.',
    });
  });

  it('laat meerwaarde leeg als er niets achter staat', () => {
    const uit = splitsMinimaleVereisten('Onderbouwing.\n---MINIMALE TEKST---\nAlleen de clausule.');
    expect(uit.minimaleTekst).toBe('Alleen de clausule.');
    expect(uit.meerwaarde).toBe('');
  });

  it('geeft alles als onderbouwing als de markering ontbreekt', () => {
    expect(splitsMinimaleVereisten('Alleen onderbouwing.')).toEqual({
      onderbouwing: 'Alleen onderbouwing.', minimaleTekst: '', meerwaarde: '',
    });
  });
});

describe('isMinimaleVereistenKop', () => {
  it('herkent de kop ongeacht schrijfwijze', () => {
    expect(isMinimaleVereistenKop('Minimale vereisten')).toBe(true);
    expect(isMinimaleVereistenKop('MINIMALE VEREISTEN')).toBe(true);
    expect(isMinimaleVereistenKop('Valkuilen')).toBe(false);
    expect(isMinimaleVereistenKop(null)).toBe(false);
  });
});
