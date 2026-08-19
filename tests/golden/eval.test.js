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
import { readFileSync, readdirSync, writeFileSync } from 'fs';
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
        // situatie_kenmerken uit de fixture meesturen. Zonder die kenmerken blijft
        // wetsQueryTags beperkt tot het documenttype, waardoor de analyse vrijwel
        // zonder kennisbank draait en geen echte screening reproduceert. Deze test
        // toetst dus de ANALYSE bij een bekende classificatie — de classificatiestap
        // zelf verdient een eigen test.
        body: JSON.stringify({
          classificatie: {
            doc_type: fixture.data._meta.doc_type,
            situatie_kenmerken: fixture.data._meta.situatie_kenmerken ?? [],
          },
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

      // Volledige uitkomst wegschrijven vóór de assertions. Zonder dit is een falende
      // run alleen te onderzoeken door hem opnieuw te draaien — drie echte analyses,
      // enkele minuten en ongeveer een dollar per keer.
      try {
        writeFileSync(
          join(__dir, `laatste-run-${fixture.naam}`),
          JSON.stringify({ fixture: fixture.naam, aantal: issues.length, issues }, null, 2),
        );
      } catch { /* schrijven mag de test niet laten vallen */ }

      const { moeten_gevonden_worden, mogen_NIET_gevonden_worden } = fixture.data.verwachte_issues;

      // Een verwachting draagt meerdere sleutelwoorden waarvan er ÉÉN moet voorkomen.
      // Eén letterlijk woord eisen meet woordtoeval in plaats van vondst: een rapport
      // schrijft net zo goed "informatieplicht" waar de fixture "informatieregeling" zegt.
      // Ook de dimensie mag een lijst zijn. Dezelfde bevinding kan verdedigbaar onder
      // twee categorieën vallen — een volledig ontbrekende kinderalimentatie is zowel
      // een volledigheidsgebrek als een kwestie van art. 1:404 BW. De dimensie hard
      // vastpinnen laat de test falen op de indeling in plaats van op de vondst.
      const raakt = (issue, verwacht) => {
        const woorden = verwacht.sleutelwoorden ?? [verwacht.sleutelwoord];
        const cats = Array.isArray(verwacht.categorie) ? verwacht.categorie : [verwacht.categorie];
        const tekst = `${issue.onderwerp || ''} ${issue.bevinding || ''}`.toLowerCase();
        return cats.some(c => (issue.dimensies || []).includes(c))
            && woorden.some(w => tekst.includes(String(w).toLowerCase()));
      };
      const toon = v => (v.sleutelwoorden ?? [v.sleutelwoord]).join(' / ');

      // Recall: elk verwacht issue moet aanwezig zijn
      for (const verwacht of moeten_gevonden_worden) {
        expect(
          issues.some(i => raakt(i, verwacht)),
          `${fixture.naam}: niets gevonden voor [${toon(verwacht)}] (${verwacht.categorie})`
          + (verwacht.toelichting ? ` — ${verwacht.toelichting}` : ''),
        ).toBe(true);
      }

      // Precision: bekende fout-positieven mogen NIET voorkomen
      for (const fp of mogen_NIET_gevonden_worden) {
        const treffer = issues.find(i => raakt(i, fp));
        expect(
          treffer,
          `${fixture.naam}: fout-positief [${toon(fp)}] (${fp.categorie})`
          + (fp.toelichting ? ` — ${fp.toelichting}` : '')
          + (treffer ? `\n    gevonden issue: "${treffer.onderwerp}"` : ''),
        ).toBeUndefined();
      }
    }, 180_000); // 3 min per fixture — met kennisbank duurt een analyse langer
  }
});
