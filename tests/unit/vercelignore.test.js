/**
 * tests/unit/vercelignore.test.js
 *
 * Op 27 september 2026 bleek dat Vercel de hele repository serveerde: zonder build-stap
 * en zonder .vercelignore gaven CLAUDE.md, docs/, supabase/, scripts/ en tests/ op
 * app.clausula.nl gewoon 200. Sindsdien staat er een .vercelignore als whitelist.
 *
 * Een whitelist faalt de andere kant op, en net zo stil: een pagina die een script mist
 * laadt half, een functie die een import uit src/ niet vindt breekt pas bij de eerste
 * aanroep. Deze test bewaakt beide kanten:
 *   1. alles wat een pagina of functie laadt, gaat mee;
 *   2. wat nooit openbaar mag, gaat niet mee — ook niet na een ruimere regel.
 *
 * Wat hij niet kan zien: hoe Vercel de regels werkelijk toepast. Dat toetst het
 * statusscript na de deploy (scripts/openbaar-check.mjs).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ontleedVercelignore, isGepubliceerd, lokaleVerwijzingen, naarRepoPad, volgVerwijzingen,
} from '../../src/deploy/whitelist.js';

const wortel = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('de regels zelf', () => {
  const regels = ontleedVercelignore('# kop\n/*\n!/index.html\n!/src\n!/docs\n/docs/*\n!/docs/a.html\n');

  it('alles is uit tenzij teruggehaald', () => {
    expect(isGepubliceerd('CLAUDE.md', regels)).toBe(false);
    expect(isGepubliceerd('supabase/001.sql', regels)).toBe(false);
    expect(isGepubliceerd('index.html', regels)).toBe(true);
  });

  it('een teruggehaalde map neemt alles eronder mee', () => {
    expect(isGepubliceerd('src/auth/toegang.js', regels)).toBe(true);
  });

  it('één bestand uit een map, de rest niet', () => {
    expect(isGepubliceerd('docs/a.html', regels)).toBe(true);
    expect(isGepubliceerd('docs/incident.md', regels)).toBe(false);
  });

  it('commentaar en lege regels tellen niet', () => {
    expect(ontleedVercelignore('# x\n\n  \n/*\n')).toEqual([{ uitsluiten: true, patroon: '*' }]);
  });
});

describe('verwijzingen vinden', () => {
  it('pakt lokale paden en laat externe en sjablonen liggen', () => {
    const html = `
      <script src="config.js"></script>
      <link href="/favicon.svg">
      <a href="https://example.com/x.js"></a>
      <a href="\${escH(b.url)}"></a>
      <script type="module">import { a } from './src/a.js';</script>
      const x = await import('https://esm.sh/docx@8.5.0');
      fetch('/api/analyseer', {});
      location.replace('login.html');
      import { createClient } from '@supabase/supabase-js';
      import crypto from 'node:crypto';`;
    expect(lokaleVerwijzingen(html).sort()).toEqual(
      ['./src/a.js', '/api/analyseer', '/favicon.svg', 'config.js', 'login.html'].sort());
  });

  it('routeert /api/x naar api/x.js en lost relatieve paden op', () => {
    expect(naarRepoPad('/api/analyseer', 'index.html')).toBe('api/analyseer.js');
    expect(naarRepoPad('../src/auth/toegang.js', 'api/_auth.js')).toBe('src/auth/toegang.js');
    expect(naarRepoPad('./src/a.js', 'index.html')).toBe('src/a.js');
  });
});

describe('.vercelignore in deze repository', () => {
  const tekst = fs.readFileSync(path.join(wortel, '.vercelignore'), 'utf8');
  const regels = ontleedVercelignore(tekst);

  it('is een whitelist: de eerste regel sluit alles uit', () => {
    // Een blacklist laat elk nieuw bestand vanzelf door — precies het oude lek.
    expect(regels[0]).toEqual({ uitsluiten: true, patroon: '*' });
  });

  const paginas = regels
    .filter(r => !r.uitsluiten && r.patroon.endsWith('.html'))
    .map(r => r.patroon);
  const functies = fs.readdirSync(path.join(wortel, 'api'))
    .filter(f => f.endsWith('.js'))
    .map(f => `api/${f}`);

  it('noemt de pagina\'s die een gebruiker opent', () => {
    expect(paginas).toEqual(expect.arrayContaining(
      ['index.html', 'login.html', 'registreer.html', 'wachtwoord-vergeten.html', 'wachtwoord-reset.html']));
  });

  const verwijzingen = volgVerwijzingen(wortel, [...paginas, ...functies]);

  it('vindt genoeg verwijzingen om iets te betekenen', () => {
    // Faalt de herkenning stil, dan is de test hieronder vanzelf groen.
    expect(verwijzingen.length).toBeGreaterThan(80);
  });

  it('alles wat een pagina of functie laadt, bestaat en gaat mee', () => {
    const fout = verwijzingen
      .filter(v => !v.bestaat || !isGepubliceerd(v.pad, regels))
      .map(v => `${v.van} → ${v.pad}${v.bestaat ? ' (uitgesloten door .vercelignore)' : ' (bestaat niet)'}`);
    expect([...new Set(fout)]).toEqual([]);
  });

  it('wat nooit openbaar mag, gaat niet mee', () => {
    const bestanden = execFileSync('git', ['ls-files'], { cwd: wortel, encoding: 'utf8' })
      .split('\n').filter(Boolean);
    const verboden = /^(?:CLAUDE\.md|STAND\.md|\.claude\/|\.github\/|docs\/|supabase\/|scripts\/|tests\/|memory\/|werkwijze-basis\/|\.env)|\.sql$|\.pptx$/;
    // Bewuste uitzonderingen staan hier, zodat een afwijking in de diff staat.
    const uitzonderingen = new Set([]);
    const lek = bestanden.filter(f => verboden.test(f) && !uitzonderingen.has(f) && isGepubliceerd(f, regels));
    expect(lek).toEqual([]);
  });
});
