/**
 * Semantische eval — draait ALLEEN via `npm run test:eval`
 * (niet in standaard testsuite of hooks — kost echte API-calls).
 *
 * Stuurt elke fixture door de echte screening-pipeline en controleert of
 * de verwachte issue-categorieën aanwezig zijn en geen bekende false positives optreden.
 *
 * Vereist: ANTHROPIC_API_KEY + SUPABASE_* env vars in .env
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir    = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dir, 'fixtures');

// Guard: skip als ANTHROPIC_API_KEY niet beschikbaar is
const heeftApiKey = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!heeftApiKey)('Semantische eval (echte API)', () => {
  const fixtures = readdirSync(FIXTURES)
    .filter(f => f.endsWith('.json') && !f.startsWith('sample-output-'))
    .map(f => ({ naam: f, data: JSON.parse(readFileSync(join(FIXTURES, f), 'utf8')) }));

  for (const fixture of fixtures) {
    it(`${fixture.naam}: verwachte issues gevonden`, async () => {
      // Aanroep van de lokale analyse-endpoint (vercel dev moet draaien op port 3000)
      const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
      const res = await fetch(`${baseUrl}/api/analyseer`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${process.env.TEST_JWT_TOKEN || ''}`,
        },
        // Vorm van de payload volgt api/analyseer.js: de server leest d.type en
        // d.bestandsnaam, niet d.doc_type. Stond hier tot 19-08-2026 anders.
        body: JSON.stringify({
          classificatie: { doc_type: fixture.data._meta.doc_type, situatie_kenmerken: [] },
          documenten:    [{
            bestandsnaam: fixture.naam,
            type:         fixture.data._meta.doc_type,
            tekst:        fixture.data.tekst,
          }],
        }),
      });

      expect(res.ok, `analyseer gaf ${res.status} — staat TEST_JWT_TOKEN in .env?`).toBe(true);

      // Analyseer SSE-stream en verzamel issues
      const issues = [];
      let gebruiktConsolidatie = false;
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lijnen = buf.split('\n');
        buf = lijnen.pop();
        for (const lijn of lijnen) {
          if (!lijn.startsWith('data:')) continue;
          try {
            const evt = JSON.parse(lijn.slice(5));
            // De server verpakt de issues in `result`, niet direct op het event.
            // 'consolidatie' is de definitieve lijst (na deduplicatie, IBAN-filter en
            // consistentiecontrole); komt die niet, dan vallen we terug op de losse calls.
            if (evt.type === 'consolidatie') {
              issues.length = 0;
              issues.push(...(evt.result?.issues || []));
              gebruiktConsolidatie = true;
            } else if (!gebruiktConsolidatie && ['structuur', 'juridisch', 'balans'].includes(evt.type)) {
              issues.push(...(evt.result?.issues || []));
            }
          } catch { /* skip malformed */ }
        }
      }

      const { moeten_gevonden_worden, mogen_NIET_gevonden_worden } = fixture.data.verwachte_issues;

      // Recall: elk verwacht issue moet aanwezig zijn
      for (const verwacht of moeten_gevonden_worden) {
        const gevonden = issues.some(i =>
          (i.dimensies || []).includes(verwacht.categorie) &&
          `${i.onderwerp || ''} ${i.bevinding || ''}`.toLowerCase().includes(verwacht.sleutelwoord.toLowerCase())
        );
        expect(gevonden, `"${verwacht.sleutelwoord}" (${verwacht.categorie}) niet gevonden in ${fixture.naam}`).toBe(true);
      }

      // Precision: bekende false positives mogen NIET voorkomen
      for (const fp of mogen_NIET_gevonden_worden) {
        const gevonden = issues.some(i =>
          (i.dimensies || []).includes(fp.categorie) &&
          `${i.onderwerp || ''} ${i.bevinding || ''}`.toLowerCase().includes(fp.sleutelwoord.toLowerCase())
        );
        expect(gevonden, `False positive "${fp.sleutelwoord}" gevonden in ${fixture.naam}`).toBe(false);
      }
    }, 120_000); // 2 min timeout per fixture
  }
});
