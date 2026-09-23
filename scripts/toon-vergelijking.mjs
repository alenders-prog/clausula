#!/usr/bin/env node
/**
 * scripts/toon-vergelijking.mjs — de varianten lezen in de echte viewer
 *
 * Draaien (met `vercel dev` ernaast):
 *   node scripts/toon-vergelijking.mjs
 *   node scripts/toon-vergelijking.mjs --bestand tests/golden/vergelijking-openai.json --run 2
 *   node scripts/toon-vergelijking.mjs --adres https://app.clausula.nl
 *
 * ── WAAROM DIT BESTAAT ──────────────────────────────────────────────────────
 *
 * Het harnas schrijft de bevindingen weg als markdown, en dat haalt het oordeel uit
 * zijn context. Een mediator beoordeelt een bevinding niet als opsommingsteken: hij
 * leest hem met de ernstkleur erbij, met de dimensiefilters, in de volgorde waarin de
 * app ze zet, en met de kaarten waar hij aan gewend is. Dat verschil bepaalt mede of
 * iets "bruikbaar" heet.
 *
 * Dit opent per deelnemer een tabblad met diens bevindingen van één ronde, in de echte
 * interface. Zelfde documenten, zelfde moment, alleen het model anders — de
 * gepaardheid van het harnas blijft dus staan, en de context komt erbij.
 *
 * ── HOE HET ERIN KOMT ───────────────────────────────────────────────────────
 *
 * Langs dezelfde weg als smoketest 04: een neppe sessie, de split-overlay open, en dan
 * `toonRapport()` met de bevindingen erin. Er gaat geen analyse doorheen en er wordt
 * niets opgeslagen — de database ziet hier niets van.
 *
 * ── WAT JE NIET ZIET ────────────────────────────────────────────────────────
 *
 * De documenttekst gaat niet mee, dus het markeren en terugvinden van een passage werkt
 * niet. Het citaat staat wel bij elke bevinding. Wil je dat ook, dan is dat een grotere
 * ingreep: dan moet er een echt dossier met bestanden achter zitten.
 */

import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { mockSupabaseSession, mockSupabaseRest } from '../tests/e2e/helpers/mock-supabase.js';
import { DEV_ADRES } from '../src/dev-poort.js';

const arg = (naam, standaard) =>
  process.argv.find((a) => a.startsWith(`--${naam}=`))?.split('=')[1]
  ?? (process.argv.includes(`--${naam}`) ? process.argv[process.argv.indexOf(`--${naam}`) + 1] : standaard);

const BESTAND = arg('bestand', 'tests/golden/vergelijking-openai.json');
const RUN     = parseInt(arg('run', '1'), 10) || 1;
const ADRES   = arg('adres', DEV_ADRES);

const data = JSON.parse(readFileSync(BESTAND, 'utf8'));
const metingen = data.metingen.filter((m) => !m.fout && m.run === RUN);

if (metingen.length === 0) {
  console.error(`Geen geslaagde metingen voor run ${RUN} in ${BESTAND}.`);
  console.error(`Beschikbare runs: ${[...new Set(data.metingen.filter((m) => !m.fout).map((m) => m.run))].join(', ')}`);
  process.exit(1);
}
if (!metingen[0].issues) {
  console.error('Dit meetbestand bevat geen bevindingen, alleen tellingen.');
  console.error('Het dateert van vóór 22 september 2026 — draai het harnas opnieuw.');
  process.exit(1);
}

console.log(`bestand   : ${BESTAND}`);
console.log(`ronde     : ${RUN} van ${data.runs}`);
console.log(`deelnemers: ${metingen.map((m) => `${m.spec} (${m.issues.length})`).join(', ')}`);
console.log(`adres     : ${ADRES}\n`);

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });

for (const m of metingen) {
  const page = await context.newPage();
  await mockSupabaseSession(page);
  await mockSupabaseRest(page);

  // Geen Storage-verkeer: er hangt geen echt dossier achter.
  await page.route('**storage.googleapis.com/**', (r) => r.abort());
  await page.route('**/storage/v1/**', (r) => r.fulfill({ status: 404 }));

  await page.goto(ADRES, { waitUntil: 'commit' });
  await page.waitForSelector('#dossierLijst', { timeout: 45_000 });
  await page.waitForFunction(() => typeof window.maakGrad !== 'undefined', null, { timeout: 20_000 });

  const uitkomst = await page.evaluate(async ([meting, fixtureMeta]) => {
    document.getElementById('splitOverlay').classList.add('active');

    // Een balk met de naam van de deelnemer, want de app kent die niet en zonder dit
    // is na twee tabbladen niet meer te zien wie wat schreef.
    const balk = document.createElement('div');
    balk.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;padding:6px 14px;'
      + 'background:#1f2d3d;color:#fff;font:13px/1.4 system-ui,sans-serif;letter-spacing:.02em';
    balk.textContent = `${meting.spec} — ronde ${meting.run} — ${meting.issues.length} bevindingen`
      + ` — ${meting.usd === null ? 'prijs onbekend' : '$' + meting.usd.toFixed(4)}`
      + ` — ${Math.round(meting.ms / 1000)}s`;
    document.body.appendChild(balk);
    document.title = `${meting.spec} — ronde ${meting.run}`;

    try {
      await window.toonRapport(
        { doc_type: fixtureMeta.docType, situatie_kenmerken: fixtureMeta.kenmerken },
        {
          issues: meting.issues,
          samenvatting: `Vergelijking — ${meting.spec}, ronde ${meting.run}.`,
          mfn_score: null,
          _bestandsnaam: fixtureMeta.bestandsnaam,
          _doc_type: fixtureMeta.docType,
          _document_bestanden: [fixtureMeta.bestandsnaam],
        },
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, fout: e.message };
    }
  }, [m, { docType: 'convenant', kenmerken: [], bestandsnaam: 'Convenant.pdf' }]);

  console.log(`${m.spec.padEnd(30)} ${uitkomst.ok ? 'getoond' : 'FOUT: ' + uitkomst.fout}`);
}

console.log('\nDe tabbladen staan open. Sluit het browservenster als je klaar bent.');

// Wachten tot het venster dicht gaat; anders sluit het script de browser meteen.
await new Promise((klaar) => browser.on('disconnected', klaar));
console.log('Venster gesloten.');
