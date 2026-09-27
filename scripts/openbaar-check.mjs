/**
 * scripts/openbaar-check.mjs — wat serveert een deploy werkelijk?
 *
 *   node scripts/openbaar-check.mjs [basis-url]      (standaard https://app.clausula.nl)
 *
 * Vraagt voor elk bestand in `git ls-files` de status op en legt die naast .vercelignore:
 *   - LEK:   geeft 200, maar staat niet op de whitelist;
 *   - BREUK: een pagina of functie laadt het, maar het geeft geen 200.
 * api/ slaat hij over: Vercel draait die als functie en serveert ze niet als bestand.
 *
 * Het geval (27 september 2026): zonder .vercelignore serveerde Vercel de hele repository.
 * tests/unit/vercelignore.test.js toetst de regels; dit script toetst wat Vercel ermee
 * doet — de enige toets die zegt of het lek dicht is.
 *
 * Exitcode 1 bij bevindingen; de laatste regel begint met UITKOMST:.
 * Een beschermde preview-URL geeft overal 401 — draai hem dan tegen productie.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ontleedVercelignore, isGepubliceerd, volgVerwijzingen } from '../src/deploy/whitelist.js';

const WORTEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASIS = (process.argv[2] || 'https://app.clausula.nl').replace(/\/$/, '');
const TIJDSLIMIET_MS = 15_000;
const GELIJKTIJDIG = 12;

const regels = ontleedVercelignore(fs.readFileSync(path.join(WORTEL, '.vercelignore'), 'utf8'));
const bestanden = execFileSync('git', ['ls-files'], { cwd: WORTEL, encoding: 'utf8' })
  .split('\n').filter(Boolean).filter(f => !f.startsWith('api/'));

const paginas = regels.filter(r => !r.uitsluiten && r.patroon.endsWith('.html')).map(r => r.patroon);
const functies = fs.readdirSync(path.join(WORTEL, 'api')).filter(f => f.endsWith('.js')).map(f => `api/${f}`);
const nodig = new Set(volgVerwijzingen(WORTEL, [...paginas, ...functies])
  .map(v => v.pad).filter(p => !p.startsWith('api/')));

async function status(pad) {
  const url = `${BASIS}/${pad.split('/').map(encodeURIComponent).join('/')}`;
  try {
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIJDSLIMIET_MS) });
    await r.body?.cancel();
    return r.status;
  } catch (e) {
    return `fout: ${e.name}`;
  }
}

const uitkomst = new Map();
const rij = [...bestanden];
await Promise.all(Array.from({ length: GELIJKTIJDIG }, async () => {
  while (rij.length) {
    const pad = rij.shift();
    uitkomst.set(pad, await status(pad));
  }
}));

const openbaar = bestanden.filter(f => uitkomst.get(f) === 200);
const lek = openbaar.filter(f => !isGepubliceerd(f, regels));
const breuk = [...nodig].filter(f => bestanden.includes(f) && uitkomst.get(f) !== 200);
const onbeantwoord = bestanden.filter(f => typeof uitkomst.get(f) === 'string');

console.log(`${BASIS}: ${openbaar.length} van ${bestanden.length} bestanden buiten api/ geven 200.`);
for (const f of lek) console.log(`  LEK    ${f}`);
for (const f of breuk) console.log(`  BREUK  ${f}  (${uitkomst.get(f)})`);
for (const f of onbeantwoord) console.log(`  ?      ${f}  (${uitkomst.get(f)})`);

const n = lek.length + breuk.length + onbeantwoord.length;
console.log(n
  ? `UITKOMST: ${lek.length} lek, ${breuk.length} breuk, ${onbeantwoord.length} onbeantwoord`
  : 'UITKOMST: alleen de whitelist is openbaar, en alles wat de app nodig heeft antwoordt');
process.exitCode = n ? 1 : 0;
