#!/usr/bin/env node
/**
 * scripts/csp-check.mjs — dekt de CSP alles wat de pagina's werkelijk inladen?
 *
 * Draaien:  npm run check:csp
 *
 * ── WAAROM ──────────────────────────────────────────────────────────────────
 *
 * De CSP staat op `Content-Security-Policy-Report-Only` (vercel.json). Omzetten naar
 * afdwingen kan pas als vaststaat dat hij niets breekt, en een CSP die iets blokkeert doet
 * dat stil: er verschijnt geen foutmelding op het scherm, alleen een regel in de console
 * van de bezoeker.
 *
 * Dit script haalt elke pagina op en legt elke externe bron ernaast langs de policy. Dat is
 * de helft van het antwoord.
 *
 * ── WAT DIT NIET ZIET ───────────────────────────────────────────────────────
 *
 * Bronnen die pas tijdens het gebruik worden opgehaald. De OCR-route laadt haar worker,
 * wasm en taaldata op het moment zelf (`Tesseract.createWorker`), en pdf.js zijn worker.
 * Gemeten aan de tesseract-bundel: die verwijst alleen naar cdn.jsdelivr.net, en de
 * pdf.js-worker staat hard in index.html op cdnjs. Beide staan in de policy — maar
 * "staat erin" is geen "werkt".
 *
 * Voordat de header omgaat naar afdwingen: loop met de console open één keer OCR,
 * PDF-export, DOCX-voorbeeld en downloaden door. Elke melding die daar verschijnt is een
 * bron die hier niet uit kwam.
 */

const BASIS = process.argv.find((a) => a.startsWith('--host='))?.split('=')[1]
  ?? 'https://app.clausula.nl';

const PAGINAS = ['/index.html', '/login.html', '/registreer.html', '/assistent-mobiel.html'];

/** De policy uitlezen zoals de server hem stuurt — niet uit vercel.json, maar echt. */
const eerste = await fetch(`${BASIS}/index.html`);
const header = eerste.headers.get('content-security-policy-report-only')
            ?? eerste.headers.get('content-security-policy');
if (!header) {
  console.error('✖ geen CSP-header op', BASIS);
  process.exit(1);
}
const afdwingend = !!eerste.headers.get('content-security-policy');
console.log(`CSP gevonden op ${BASIS} — ${afdwingend ? 'AFDWINGEND' : 'report-only'}\n`);

const policy = new Map();
for (const deel of header.split(';')) {
  const [naam, ...waarden] = deel.trim().split(/\s+/);
  if (naam) policy.set(naam, waarden);
}

/** Mag `url` geladen worden onder `richtlijn`? */
function toegestaan(url, richtlijn) {
  const bronnen = policy.get(richtlijn) ?? policy.get('default-src') ?? [];
  if (bronnen.includes("'none'")) return false;
  if (url.startsWith('data:')) return bronnen.includes('data:');
  if (url.startsWith('blob:')) return bronnen.includes('blob:');
  if (/^https?:\/\//i.test(url)) {
    const oorsprong = new URL(url).origin;
    if (oorsprong === new URL(BASIS).origin) return bronnen.includes("'self'");
    return bronnen.some((b) => b.startsWith('http') && (oorsprong === b || url.startsWith(b)));
  }
  return bronnen.includes("'self'");   // relatief pad
}

const bevindingen = [];

for (const pad of PAGINAS) {
  const res = await fetch(`${BASIS}${pad}`);
  if (!res.ok) { console.log(`  · ${pad} — HTTP ${res.status}, overgeslagen`); continue; }
  const html = await res.text();

  const bronnen = [
    ...[...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => ['script-src', m[1]]),
    ...[...html.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi)]
      .filter((m) => /stylesheet|preconnect|preload/i.test(m[0]))
      .map((m) => ['style-src', m[1]]),
    ...[...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => ['img-src', m[1]]),
    ...[...html.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)].map((m) => ['frame-src', m[1]]),
  ].filter(([, u]) => u && !u.startsWith('#'));

  const extern = bronnen.filter(([, u]) => /^https?:/i.test(u));
  console.log(`  ${pad.padEnd(24)} ${bronnen.length} bron(nen), waarvan ${extern.length} extern`);

  for (const [richtlijn, url] of bronnen) {
    // preconnect naar de fontserver telt onder font-src, niet style-src.
    const r = /fonts\.gstatic/.test(url) ? 'font-src' : richtlijn;
    if (!toegestaan(url, r)) {
      bevindingen.push(`${pad}: ${r} blokkeert ${url}`);
      console.log(`      ✖ ${r.padEnd(11)} ${url}`);
    }
  }
}

console.log('');
if (bevindingen.length) {
  console.log(`UITKOMST: ${bevindingen.length} bron(nen) worden geblokkeerd`);
  for (const b of bevindingen) console.error(`  - ${b}`);
} else {
  console.log('UITKOMST: elke bron in de HTML past binnen de policy');
  if (!afdwingend) {
    console.log('');
    console.log('Nog te doen vóór het omzetten naar afdwingen: één keer met de console open');
    console.log('door OCR, PDF-export, DOCX-voorbeeld en downloaden. Dit script ziet alleen');
    console.log('wat in de HTML staat, niet wat tijdens het gebruik wordt opgehaald.');
  }
}

process.exitCode = bevindingen.length ? 1 : 0;
