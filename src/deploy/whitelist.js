/**
 * Wat gaat er naar Vercel? Leest .vercelignore en zoekt uit wat pagina's en functies laden.
 *
 * Het geval (27 september 2026). Zonder build-stap en zonder .vercelignore serveerde
 * Vercel de hele repository: CLAUDE.md, docs/, supabase/, scripts/ en tests/ gaven op
 * app.clausula.nl 200 zonder inlog. De oplossing is een whitelist — maar een whitelist
 * die te krap is, breekt de app pas bij gebruik: een pagina mist een script, of een
 * functie vindt een import uit src/ niet bij de eerste aanroep. Daarom leest deze module
 * de whitelist én de verwijzingen, zodat een test ze naast elkaar kan leggen.
 *
 * `isGepubliceerd` volgt de gitignore-regels voor zover .vercelignore die gebruikt:
 * patronen verankerd met /, * binnen één padsegment, laatste passende regel wint, en een
 * patroon dat op een map past, geldt voor alles eronder. Dat laatste wijkt op één punt af
 * van gitignore (daar kan een bestand onder een uitgesloten map niet terugkomen); de kop
 * van .vercelignore schrijft daarom de vorm voor waarin beide hetzelfde uitkomen. De
 * echte toets blijft het statusscript na de deploy.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {string} tekst  inhoud van .vercelignore
 * @returns {Array<{uitsluiten: boolean, patroon: string}>}
 */
export function ontleedVercelignore(tekst) {
  return tekst
    .split(/\r?\n/)
    .map(r => r.trim())
    .filter(r => r && !r.startsWith('#'))
    .map(r => {
      const terug = r.startsWith('!');
      const patroon = (terug ? r.slice(1) : r).replace(/^\//, '').replace(/\/$/, '');
      return { uitsluiten: !terug, patroon };
    });
}

function patroonNaarRegex(patroon) {
  const bron = patroon
    .split('/')
    .map(seg => seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]'))
    .join('/');
  return new RegExp(`^${bron}$`);
}

/**
 * @param {string} pad  relatief aan de projectwortel, met /
 * @param {ReturnType<typeof ontleedVercelignore>} regels
 */
export function isGepubliceerd(pad, regels) {
  const delen = pad.split('/');
  const voorvoegsels = delen.map((_, i) => delen.slice(0, i + 1).join('/'));
  let gepubliceerd = true;
  for (const { uitsluiten, patroon } of regels) {
    const re = patroonNaarRegex(patroon);
    if (voorvoegsels.some(v => re.test(v))) gepubliceerd = !uitsluiten;
  }
  return gepubliceerd;
}

/**
 * Lokale verwijzingen uit een html- of js-bestand: src/href-attributen, import/from,
 * fetch() naar eigen paden en navigatie naar andere pagina's. Externe URL's en
 * sjabloonteksten (`${…}`) vallen af.
 *
 * @param {string} inhoud
 * @returns {string[]}  zoals ze in de bron staan
 */
export function lokaleVerwijzingen(inhoud) {
  const patronen = [
    /\b(?:src|href)\s*=\s*"([^"#?]+)"/g,
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bfetch\s*\(\s*['"`]([^'"`?]+)['"`]/g,
    /location\.(?:replace|assign)\s*\(\s*['"]([^'"#?]+)['"]/g,
    /location\.href\s*=\s*['"]([^'"#?]+)['"]/g,
  ];
  const gevonden = new Set();
  for (const re of patronen) {
    for (const m of inhoud.matchAll(re)) {
      const v = m[1].trim();
      if (!v || v.includes('${') || /^(?:[a-z]+:|\/\/|#)/i.test(v)) continue;
      if (!v.startsWith('.') && !v.startsWith('/') && !/\.(?:html|js|mjs|css|svg|png|ico|json)$/.test(v)) continue;
      gevonden.add(v);
    }
  }
  return [...gevonden];
}

/**
 * Zet een verwijzing om naar een pad in de repository. `/api/x` wordt `api/x.js`, zoals
 * Vercel het routeert.
 *
 * @param {string} verwijzing
 * @param {string} vanBestand  relatief pad van het bestand waarin hij staat
 */
export function naarRepoPad(verwijzing, vanBestand) {
  const pad = verwijzing.startsWith('/')
    ? verwijzing.slice(1)
    : path.posix.normalize(path.posix.join(path.posix.dirname(vanBestand), verwijzing));
  if (pad === '' ) return 'index.html';
  if (/^api\/[^.]+$/.test(pad)) return `${pad}.js`;
  return pad;
}

/**
 * Loopt vanaf de startbestanden alle lokale verwijzingen na, ook die van geladen modules.
 *
 * @param {string} wortel
 * @param {string[]} start  relatieve paden
 * @returns {Array<{pad: string, van: string, bestaat: boolean}>}
 */
export function volgVerwijzingen(wortel, start) {
  const bezocht = new Set();
  const resultaat = [];
  const rij = [...start];
  while (rij.length) {
    const bestand = rij.shift();
    if (bezocht.has(bestand)) continue;
    bezocht.add(bestand);
    const volledig = path.join(wortel, bestand);
    if (!fs.existsSync(volledig)) continue;
    for (const v of lokaleVerwijzingen(fs.readFileSync(volledig, 'utf8'))) {
      const pad = naarRepoPad(v, bestand);
      const bestaat = fs.existsSync(path.join(wortel, pad));
      resultaat.push({ pad, van: bestand, bestaat });
      if (bestaat && /\.(?:js|mjs|html)$/.test(pad)) rij.push(pad);
    }
  }
  return resultaat;
}
