#!/usr/bin/env node
/**
 * scripts/kennisbank-embed.mjs
 * Leest de chunks uit `legal_chunks` in als embedding, zodat er semantisch gezocht
 * kan worden in plaats van op losse woorden.
 *
 * Draaien:
 *   node scripts/kennisbank-embed.mjs            alleen wat ontbreekt of gewijzigd is
 *   node scripts/kennisbank-embed.mjs --alles    alles opnieuw (na een modelwissel)
 *
 * Vereist `supabase/kennisbank-semantisch.sql` (pgvector + kolommen) en
 * `supabase/2026-08-24-embedding-hash.sql` (de kolom `embedding_hash`). Verder
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY en VOYAGE_API_KEY in `.env`.
 *
 * ── Wanneer opnieuw draaien ──────────────────────────────────────────────────
 * Na élke wijziging aan `legal_chunks`, ook via het Supabase-dashboard. Een chunk
 * waarvan de tekst is aangepast maar de embedding niet, wordt gevonden op zijn
 * oude inhoud — en dat is nergens aan te zien.
 *
 * ── Hoe "gewijzigd" wordt herkend ────────────────────────────────────────────
 * Tot 24 augustus 2026 koos dit script zijn werk zo:
 *
 *     chunks.filter(c => !c.embedding_bij)
 *
 * Dat vindt alleen chunks die nog NOOIT zijn ingelezen. Een chunk waarvan de
 * tekst verandert houdt zijn stempel en werd dus nooit bijgewerkt — precies het
 * gevaar dat hierboven staat beschreven. Na het herschrijven van drie
 * alimentatie-chunks meldde het script vrolijk "in te lezen: 0".
 *
 * De tabel heeft geen `updated_at`, dus er viel niets te vergelijken. Nu staat
 * bij elke chunk de hash van de tekst zoals die is ingelezen. Wijkt die af van
 * de huidige tekst, dan is de embedding verouderd.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const MODEL      = 'voyage-law-2';   // voor juridische tekst getraind; 1024 dimensies
const GROEP      = 32;               // chunks per Voyage-aanroep
const MAX_TEKENS = 8000;             // ruim onder de tokenlimiet van het model

// ── .env inlezen (geen extra afhankelijkheid nodig) ──────────────────────────
try {
  for (const regel of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    if (!regel.includes('=') || regel.trim().startsWith('#')) continue;
    const i = regel.indexOf('=');
    const sleutel = regel.slice(0, i).trim();
    if (!process.env[sleutel]) process.env[sleutel] = regel.slice(i + 1).trim();
  }
} catch { /* geen .env — dan moeten de variabelen al in de omgeving staan */ }

const alles = process.argv.includes('--alles');

/** Precies de tekst die aan Voyage wordt aangeboden — hash en invoer horen gelijk te zijn. */
function invoerTekst(chunk) {
  // De citatie meenemen: die bevat het artikelnummer, en daar wordt op gezocht.
  return `${chunk.citation || ''}\n${chunk.content || ''}`.slice(0, MAX_TEKENS);
}

const hashVan = chunk => createHash('sha256').update(invoerTekst(chunk)).digest('hex');

async function embed(teksten, type) {
  for (let poging = 1; poging <= 3; poging++) {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({ model: MODEL, input: teksten, input_type: type }),
    });
    if (res.ok) return (await res.json()).data.map(d => d.embedding);
    if (res.status === 429 && poging < 3) {
      await new Promise(r => setTimeout(r, 2000 * poging));
      continue;
    }
    throw new Error(`Voyage ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

async function main() {
  for (const nodig of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VOYAGE_API_KEY']) {
    if (!process.env[nodig]) {
      console.error(`✗ ${nodig} ontbreekt. Zie CLAUDE.md → Lokaal draaien.`);
      return 1;
    }
  }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: chunks, error } = await sb
    .from('legal_chunks')
    .select('id, citation, content, embedding_bij, embedding_hash')
    .order('id');

  if (error) {
    console.error('✗ Kon de kennisbank niet lezen:', error.message);
    if (/embedding_hash/.test(error.message))
      console.error('  Draai eerst supabase/2026-08-24-embedding-hash.sql in de SQL-editor.');
    else if (/embedding_bij/.test(error.message))
      console.error('  Draai eerst supabase/kennisbank-semantisch.sql in de SQL-editor.');
    return 1;
  }

  // Drie soorten werk, apart geteld. "Onbekend" is de chunk die al een embedding
  // heeft maar nog geen hash — die kan alleen bestaan vlak na de migratie die de
  // kolom toevoegde. Hem "gewijzigd" noemen zou onwaar zijn: we wéten het niet, en
  // op de eerste run zou de melding "90 gewijzigd" onnodig laten schrikken.
  const nieuw     = chunks.filter(c => !c.embedding_bij);
  const onbekend  = chunks.filter(c => c.embedding_bij && !c.embedding_hash);
  const gewijzigd = chunks.filter(c => c.embedding_bij && c.embedding_hash
                                       && c.embedding_hash !== hashVan(c));
  const teDoen    = alles ? chunks : [...nieuw, ...onbekend, ...gewijzigd];

  const delen = [];
  if (nieuw.length)     delen.push(`${nieuw.length} nieuw`);
  if (onbekend.length)  delen.push(`${onbekend.length} zonder hash`);
  if (gewijzigd.length) delen.push(`${gewijzigd.length} gewijzigd`);
  const telling = alles ? ' (--alles)' : delen.length ? ` (${delen.join(', ')})` : '';
  console.log(`kennisbank: ${chunks.length} chunks | in te lezen: ${teDoen.length}${telling}`);

  if (gewijzigd.length) {
    // Benoemen wélke: bij een stille herinlezing is achteraf niet na te gaan wat er speelde.
    for (const c of gewijzigd.slice(0, 10)) console.log(`  ~ ${c.citation}`);
    if (gewijzigd.length > 10) console.log(`  ~ … en nog ${gewijzigd.length - 10}`);
  }

  if (!teDoen.length) {
    console.log('✓ Alles staat al in de index, en op de huidige tekst.');
    return 0;
  }

  let gedaan = 0;
  for (let i = 0; i < teDoen.length; i += GROEP) {
    const groep    = teDoen.slice(i, i + GROEP);
    const teksten  = groep.map(invoerTekst);
    const vectoren = await embed(teksten, 'document');

    for (let j = 0; j < groep.length; j++) {
      const { error: sErr } = await sb.from('legal_chunks')
        .update({
          embedding:      vectoren[j],
          embedding_bij:  new Date().toISOString(),
          embedding_hash: hashVan(groep[j]),
        })
        .eq('id', groep[j].id);
      if (sErr) {
        console.error(`\n✗ Opslaan mislukt voor chunk ${groep[j].id}:`, sErr.message);
        return 1;
      }
    }
    gedaan += groep.length;
    process.stdout.write(`\r  ${gedaan}/${teDoen.length} ingelezen…`);
  }

  console.log(`\r✓ ${gedaan} chunks ingelezen met ${MODEL}.            `);

  const { count: zonder } = await sb.from('legal_chunks')
    .select('*', { count: 'exact', head: true }).is('embedding', null);
  if (zonder) console.warn(`⚠ ${zonder} chunks hebben nog geen embedding.`);
  return 0;
}

// Géén process.exit(): dat brak op Windows af met
// "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\\win\\async.c" —
// het proces werd afgekapt terwijl de HTTP-handles nog aan het sluiten waren.
// De event loop loopt vanzelf leeg; een exitcode volstaat.
process.exitCode = await main();
