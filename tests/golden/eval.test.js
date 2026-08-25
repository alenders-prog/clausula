/**
 * Semantische eval — draait ALLEEN via `npm run test:eval`
 * (niet in standaard testsuite of hooks — kost echte API-calls).
 *
 * Stuurt elke fixture door de echte screening-pipeline en controleert of
 * de verwachte issue-categorieën aanwezig zijn en geen bekende false positives optreden.
 *
 * Vereist: ANTHROPIC_API_KEY + SUPABASE_* env vars in .env
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { leesEnv, haalToken } from '../helpers/test-token.mjs';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs';
import { vergelijk, verslag } from '../helpers/eval-baseline.mjs';
import { anonimiseerTekst } from '../../src/naam-anonimiseer.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir    = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dir, 'fixtures');

// Vitest laadt .env niet vanzelf, en `npm run test:eval` zet de omgeving ook niet.
// Gevolg: de sleutel stond netjes in .env, de suite sloeg zwijgend over ("3 skipped",
// exitcode 0), en wie hem draaide na een promptwijziging dacht dat hij had gemeten.
leesEnv();

// Guard: skip als ANTHROPIC_API_KEY niet beschikbaar is
const heeftApiKey = !!process.env.ANTHROPIC_API_KEY;

// Alleen draaien als er expliciet om gevraagd is. Vroeger regelde de afwezigheid
// van ANTHROPIC_API_KEY dat vanzelf — maar sinds deze suite zelf .env inleest is
// die sleutel er altijd, en zou hij meedraaien in `npx vitest run`: de Stop-hook,
// CI en elke gewone testronde zouden dan echte, betaalde API-calls doen.
//
// npm zet npm_lifecycle_event op de naam van het script, en die waarde bereikt ook
// de worker waarin dit bestand draait (gemeten). EVAL=1 blijft over als noodweg,
// bijvoorbeeld om het bestand rechtstreeks met vitest aan te roepen.
const expliciet = process.env.npm_lifecycle_event === 'test:eval'
               || process.env.EVAL === '1';

// Wordt in beforeAll gevuld — één token voor alle fixtures in deze run.
let TOKEN = '';

// Per fixture het verslag van de vergelijking met de baseline; wordt aan het eind
// in één blok getoond. Losse regels tussen de testuitvoer door lezen niemand.
const VERGELIJKINGEN = [];

describe.skipIf(!heeftApiKey || !expliciet)('Semantische eval (echte API)', () => {
  beforeAll(async () => {
    // Staan TEST_EMAIL en TEST_PASSWORD in .env, dan logt de eval zelf in en heeft
    // hij altijd een verse token. Anders valt hij terug op TEST_JWT_TOKEN — die
    // binnen een uur verloopt, en waarvan de 401 er precies uitziet als een
    // promptregressie. Zie tests/helpers/test-token.mjs voor die geschiedenis.
    try {
      TOKEN = await haalToken();
    } catch (e) {
      throw new Error(`Eval kan niet meten — ${e.message}`);
    }
  });

  const fixtures = readdirSync(FIXTURES)
    .filter(f => f.endsWith('.json') && !f.startsWith('sample-output-'))
    .map(f => ({ naam: f, data: JSON.parse(readFileSync(join(FIXTURES, f), 'utf8')) }));

  for (const fixture of fixtures) {
    it(`${fixture.naam}: verwachte issues gevonden`, async () => {
      // Aanroep van de lokale analyse-endpoint (vercel dev moet draaien op port 3000)
      const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';

      // Genummerde placeholders per type, zoals _maakPiiTracker in index.html.
      const gezien = new Map(); const teller = {};
      const piiPh = (type, waarde) => {
        const k = `${type}:${waarde}`;
        if (!gezien.has(k)) { teller[type] = teller[type] ?? 0; gezien.set(k, `[${type}_${teller[type]++}]`); }
        return gezien.get(k);
      };
      const res = await fetch(`${baseUrl}/api/analyseer`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${TOKEN}`,
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
          // Een fixture met `documenten` levert er meer dan één, en dán pas draait de
          // cross-document-call: die start bij twee of meer hoofddocumenten. Alle
          // fixtures waren tot 24 augustus 2026 één document, waardoor dat hele pad
          // buiten de eval viel — en juist daar zat een bevinding die niet klopte.
          documenten: Array.isArray(fixture.data.documenten)
            ? fixture.data.documenten.map(d => ({
                bestandsnaam: d.bestandsnaam,
                type:         d.type,
                tekst:        anonimiseerTekst(d.tekst, new Map(), piiPh),
              }))
            : [{
            bestandsnaam: fixture.naam,
            type:         fixture.data._meta.doc_type,
            // Dezelfde PII-bewerking als de browser toepast vóór verzending. Zonder
            // dit kreeg de eval ruwe fixturetekst met echte adressen en postcodes,
            // terwijl productie [ADRES_0] en [POSTCODE_0] stuurt. Dat leverde twee
            // bevindingen op die alleen in de testopstelling konden bestaan — onder
            // meer "adres niet gepseudonimiseerd conform documentprotocol", een
            // verwijt aan het document over ónze bewerking.
            //
            // Namen worden hier bewust NIET vervangen: de fixtures toetsen juist of
            // een roepnaam-door-geboortenaam wordt opgemerkt, en die verwachting
            // hangt aan de echte namen in de tekst.
            tekst:        anonimiseerTekst(fixture.data.tekst, new Map(), piiPh),
          }],
        }),
      });

      // De token is in beforeAll opgehaald en geldig bevonden; een 401 hier betekent
      // dus iets anders (rechten, verkeerde omgeving) — niet "token vergeten".
      expect(res.ok, `analyseer gaf ${res.status} op ${baseUrl} — draait vercel dev?`).toBe(true);

      // Analyseer SSE-stream en verzamel issues.
      // Per document apart: de server stuurt één consolidatie-event per document, en
      // die zijn de definitieve lijst (na deduplicatie, IBAN-filter en
      // consistentiecontrole). `losseIssues` is de terugval als er geen consolidatie
      // komt — bijvoorbeeld bij een onderbroken verbinding.
      const perDoc = new Map();
      const losseIssues = [];
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
            // PER DOCUMENT bewaren, niet in één lijst. De server stuurt één
            // consolidatie-event per document; hier stond `issues.length = 0`, dus bij
            // twee documenten wiste het tweede event het eerste. De eval zag dan alleen
            // het laatste document — en juist bij twee documenten draait de
            // cross-document-call, dus precies wat je wilde toetsen viel weg.
            if (evt.type === 'consolidatie') {
              perDoc.set(evt.bestandsnaam ?? '(enig document)', evt.result?.issues || []);
            } else if (['structuur', 'juridisch', 'balans'].includes(evt.type)) {
              losseIssues.push(...(evt.result?.issues || []));
            }
          } catch { /* skip malformed */ }
        }
      }

      // Alle documenten samen. Bij één document verandert er niets; bij twee staat
      // hier nu ook het convenant in plaats van alleen het laatst binnengekomen plan.
      const issues = perDoc.size ? [...perDoc.values()].flat() : losseIssues;

      // Volledige uitkomst wegschrijven vóór de assertions. Zonder dit is een falende
      // run alleen te onderzoeken door hem opnieuw te draaien — drie echte analyses,
      // enkele minuten en ongeveer een dollar per keer.
      try {
        writeFileSync(
          join(__dir, `laatste-run-${fixture.naam}`),
          JSON.stringify({ fixture: fixture.naam, aantal: issues.length, issues }, null, 2),
        );
      } catch { /* schrijven mag de test niet laten vallen */ }

      // Vergelijken met de vastgelegde baseline. Bewust géén assertie: de titels komen
      // van een taalmodel en variëren, dus falen hierop zou een flakkerende test geven
      // die je leert negeren. De echte assertie staat hieronder — verwachte issues
      // gevonden, bekende valse positieven afwezig. Dit is het verslag daarnaast.
      try {
        const naam = fixture.naam.replace(/\.json$/, '');
        const pad  = join(__dir, 'baseline', `${naam}.json`);
        const oud  = existsSync(pad) ? JSON.parse(readFileSync(pad, 'utf8')) : null;
        VERGELIJKINGEN.push(verslag(naam, vergelijk(oud, issues)));
      } catch (e) { VERGELIJKINGEN.push(`▸ ${fixture.naam}\n    vergelijking mislukt: ${e.message}`); }

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

  afterAll(() => {
    if (!VERGELIJKINGEN.length) return;
    const blok = ['', '─'.repeat(72), 'VERGELIJKING MET DE BASELINE', '─'.repeat(72), '',
      ...VERGELIJKINGEN, '',
      'Klopt wat je ziet? Leg het vast met: npm run eval:baseline', ''].join('\n');
    // process.stdout.write, geen console.log: in een suite-afterAll slikt de
    // standaard reporter van vitest console-uitvoer op. Bij de eerste echte run
    // met dit verslag bleef het scherm daardoor leeg terwijl het diff-bestand wél
    // was geschreven — de melding was er, alleen niet te zien. Gemeten met beide
    // vormen naast elkaar; alleen deze komt door.
    //
    // Wegschrijven blijft daarnáást staan: de console scrollt weg bij drie
    // fixtures van elk drie minuten, en dan is het verslag juist wat je zocht.
    process.stdout.write(`${blok}\n`);
    try { writeFileSync(join(__dir, 'laatste-diff.txt'), blok); } catch { /* niet fataal */ }
  });
});
