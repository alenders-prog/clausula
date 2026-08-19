/**
 * Golden-file schema-validatie — deterministisch, geen API-calls.
 *
 * Valideert dat elke Claude-screeningoutput die wordt opgeslagen voldoet
 * aan het verwachte JSON-schema:
 *   - issues[] met verplichte velden (ernst, dimensies, passage)
 *   - geldige enum-waarden voor ernst en dimensies
 *   - mfn_score met elementen[] als aanwezig
 *
 * Gebruik: maak een sample-output JSON in tests/golden/fixtures/sample-output-*.json
 * en deze test valideert het schema automatisch.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dir, 'fixtures');

// ── Schema-definities ─────────────────────────────────────────────────────────

const GELDIGE_ERNST = ['hoog', 'midden', 'laag'];
const GELDIGE_DIMS  = ['juridisch', 'volledigheid', 'balans', 'grammatica', 'conflicten'];

function valideertIssue(issue, idx) {
  const prefix = `issues[${idx}]`;
  // Velden heten 'onderwerp' (kop) en 'bevinding' (onderbouwing) — zie issueItem in
  // api/analyseer.js. Deze test controleerde tot 19-08-2026 op 'beschrijving', een
  // veldnaam die niet meer bestaat; omdat er nooit een sample-output-fixture was,
  // sloeg de test altijd over en viel dat niet op.
  expect(typeof issue.onderwerp, `${prefix}.onderwerp moet string zijn`).toBe('string');
  expect(issue.onderwerp.length, `${prefix}.onderwerp mag niet leeg zijn`).toBeGreaterThan(0);
  expect(typeof issue.bevinding, `${prefix}.bevinding moet string zijn`).toBe('string');
  expect(issue.bevinding.length, `${prefix}.bevinding mag niet leeg zijn`).toBeGreaterThan(0);

  expect(GELDIGE_ERNST, `${prefix}.ernst "${issue.ernst}" is ongeldig`).toContain(issue.ernst);

  expect(Array.isArray(issue.dimensies), `${prefix}.dimensies moet array zijn`).toBe(true);
  expect(issue.dimensies.length, `${prefix}.dimensies mag niet leeg zijn`).toBeGreaterThan(0);
  for (const dim of issue.dimensies) {
    expect(GELDIGE_DIMS, `${prefix}.dimensies bevat onbekende waarde "${dim}"`).toContain(dim);
  }

  // passage mag leeg zijn maar moet wel een string zijn
  expect(typeof issue.passage, `${prefix}.passage moet string zijn`).toBe('string');

  // aanbeveling is verplicht
  expect(typeof issue.aanbeveling, `${prefix}.aanbeveling moet string zijn`).toBe('string');
  expect(issue.aanbeveling.length, `${prefix}.aanbeveling mag niet leeg zijn`).toBeGreaterThan(0);
}

function valideertMfnScore(mfn) {
  expect(Array.isArray(mfn.elementen), 'mfn_score.elementen moet array zijn').toBe(true);
  for (const [i, el] of mfn.elementen.entries()) {
    const p = `mfn_score.elementen[${i}]`;
    expect(typeof el.element, `${p}.element moet string zijn`).toBe('string');
    expect(['aanwezig', 'onvolledig', 'ontbreekt'], `${p}.status "${el.status}" is ongeldig`)
      .toContain(el.status);
  }
}

// Heuristische passage-kwaliteitscheck — zelfde logica als checkIssueKwaliteit() in index.html
function passageKwaliteit(issues, label) {
  const PERSOONSNAAM   = /^[A-Z][a-z]+(?: [A-Z][a-z]+){1,3}(?: geboren| geb\.| te )/;
  const DATUM_IN_TITEL = /\d{2}-\d{2}-\d{4}/;
  const STOP = new Set(['niet','geen','zijn','heeft','wordt','voor','van','het','een','maar','ook','dit','dat','door','over','naar','bij','aan','met','als','dan','nog','wel']);

  const naampassages = issues.filter(iss => {
    const p = (iss.passage || '').trim();
    return p && PERSOONSNAAM.test(p) && DATUM_IN_TITEL.test(iss.onderwerp || '');
  });

  const duplicaten = [];
  for (let i = 0; i < issues.length; i++) {
    for (let j = i + 1; j < issues.length; j++) {
      const wA = new Set((issues[i].onderwerp || '').toLowerCase().replace(/[^\w\s]/g,' ').split(/\s+/).filter(w => w.length > 3 && !STOP.has(w)));
      const wB = new Set((issues[j].onderwerp || '').toLowerCase().replace(/[^\w\s]/g,' ').split(/\s+/).filter(w => w.length > 3 && !STOP.has(w)));
      const inter = [...wA].filter(w => wB.has(w)).length;
      const union = new Set([...wA, ...wB]).size;
      if (union > 0 && inter / union >= 0.4) duplicaten.push([i, j]);
    }
  }

  return { naampassages, duplicaten };
}

function valideertRapport(rapport, label) {
  // issues[] op root of in documenten[]
  const alleIssues = [
    ...(rapport.issues || []),
    ...(rapport.juridisch || []),
    ...(rapport.volledigheid || []),
    ...(rapport.balans || []),
    ...(rapport.grammatica || []),
    ...(rapport.conflicten || []),
  ];

  for (const [i, issue] of alleIssues.entries()) {
    valideertIssue(issue, i);
  }

  if (rapport.mfn_score?.elementen) {
    valideertMfnScore(rapport.mfn_score);
  }

  // sub-documenten recursief
  for (const doc of (rapport.documenten || [])) {
    valideertRapport(doc, `${label} > documenten[${doc.doc_type}]`);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Issue JSON-schema validatie', () => {
  it('fixture-directory is aanwezig en leesbaar', () => {
    const files = readdirSync(FIXTURES_DIR);
    expect(files.length).toBeGreaterThan(0);
  });

  // Laad alle sample-output-*.json bestanden en valideer elk
  const sampleFiles = (() => {
    try {
      return readdirSync(FIXTURES_DIR).filter(f => f.startsWith('sample-output-') && f.endsWith('.json'));
    } catch { return []; }
  })();

  if (sampleFiles.length === 0) {
    it.skip('geen sample-output-*.json bestanden gevonden (voeg toe na eerste screening)', () => {});
  } else {
    for (const bestand of sampleFiles) {
      it(`schema van ${bestand} is geldig`, () => {
        const pad  = join(FIXTURES_DIR, bestand);
        const json = JSON.parse(readFileSync(pad, 'utf8'));
        valideertRapport(json, bestand);
      });

      it(`passage-kwaliteit van ${bestand}: geen naamregels als passage bij datum-issues`, () => {
        const pad    = join(FIXTURES_DIR, bestand);
        const json   = JSON.parse(readFileSync(pad, 'utf8'));
        const issues = [
          ...(json.issues || []),
          ...((json.documenten || []).flatMap(d => d.issues || [])),
        ];
        const { naampassages } = passageKwaliteit(issues, bestand);
        expect(
          naampassages.map(i => `"${(i.onderwerp||'').slice(0,60)}" → passage="${(i.passage||'').slice(0,80)}"`),
          'Passage(s) zien eruit als naamregel terwijl het issue over een datum gaat'
        ).toHaveLength(0);
      });

      it(`dedup-kwaliteit van ${bestand}: geen near-duplicate issues (Jaccard ≥ 0.4)`, () => {
        const pad    = join(FIXTURES_DIR, bestand);
        const json   = JSON.parse(readFileSync(pad, 'utf8'));
        const issues = [
          ...(json.issues || []),
          ...((json.documenten || []).flatMap(d => d.issues || [])),
        ];
        const { duplicaten } = passageKwaliteit(issues, bestand);
        expect(
          duplicaten.map(([i,j]) => `[${i}] "${(issues[i].onderwerp||'').slice(0,50)}" ≈ [${j}] "${(issues[j].onderwerp||'').slice(0,50)}"`),
          'Near-duplicate issues gevonden (zouden samengevoegd moeten zijn)'
        ).toHaveLength(0);
      });
    }
  }
});

describe('Fixture-bestanden zijn geldige JSON met verwachte structuur', () => {
  const fixtureFiles = (() => {
    try {
      return readdirSync(FIXTURES_DIR)
        .filter(f => !f.startsWith('sample-output-') && f.endsWith('.json'));
    } catch { return []; }
  })();

  for (const bestand of fixtureFiles) {
    it(`${bestand} heeft geldige structuur`, () => {
      const pad     = join(FIXTURES_DIR, bestand);
      const fixture = JSON.parse(readFileSync(pad, 'utf8'));

      expect(typeof fixture.tekst).toBe('string');
      expect(fixture.tekst.length).toBeGreaterThan(50);
      expect(Array.isArray(fixture.verwachte_issues?.moeten_gevonden_worden)).toBe(true);
      expect(Array.isArray(fixture.verwachte_issues?.mogen_NIET_gevonden_worden)).toBe(true);
    });
  }
});
