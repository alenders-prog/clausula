#!/usr/bin/env node
/**
 * scripts/kennisbank-embed.mjs
 * Leest de chunks uit `legal_chunks` in als embedding, zodat er semantisch gezocht
 * kan worden in plaats van op losse woorden.
 *
 * Draaien:
 *   node scripts/kennisbank-embed.mjs            alleen wat nog ontbreekt of gewijzigd is
 *   node scripts/kennisbank-embed.mjs --alles    alles opnieuw (na een modelwissel)
 *
 * Vereist `supabase/kennisbank-semantisch.sql` — die zet pgvector aan en maakt de
 * kolommen. Vereist verder SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY en
 * VOYAGE_API_KEY in `.env`.
 *
 * ── Wanneer opnieuw draaien ──────────────────────────────────────────────────
 * Na élke wijziging aan `legal_chunks`, ook via het Supabase-dashboard. Een chunk
 * waarvan de tekst is aangepast maar de embedding niet, wordt gevonden op zijn
 * oude inhoud — en dat is nergens aan te zien. Dezelfde regel dus als voor
 * `scripts/kennisbank-check.mjs`.
 */

import { readFileSync } from 'node:fs';
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

for (const nodig of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VOYAGE_API_KEY']) {
  if (!process.env[nodig]) {
    console.error(`✗ ${nodig} ontbreekt. Zie CLAUDE.md → Lokaal draaien.`);
    process.exit(1);
  }
}

const alles = process.argv.includes('--alles');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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

const { data: chunks, error } = await sb
  .from('legal_chunks')
  .select('id, citation, content, embedding_bij')
  .order('id');

if (error) {
  console.error('✗ Kon de kennisbank niet lezen:', error.message);
  if (/embedding_bij/.test(error.message))
    console.error('  Draai eerst supabase/kennisbank-semantisch.sql in de SQL-editor.');
  process.exit(1);
}

const teDoen = alles ? chunks : chunks.filter(c => !c.embedding_bij);
console.log(`kennisbank: ${chunks.length} chunks | in te lezen: ${teDoen.length}`
  + (alles ? ' (--alles)' : ''));

if (!teDoen.length) {
  console.log('✓ Alles staat al in de index.');
  process.exit(0);
}

let gedaan = 0;
for (let i = 0; i < teDoen.length; i += GROEP) {
  const groep = teDoen.slice(i, i + GROEP);
  // De citatie meenemen: die bevat het artikelnummer, en daar wordt op gezocht.
  const teksten = groep.map(c => `${c.citation || ''}\n${c.content || ''}`.slice(0, MAX_TEKENS));
  const vectoren = await embed(teksten, 'document');

  for (let j = 0; j < groep.length; j++) {
    const { error: sErr } = await sb.from('legal_chunks')
      .update({ embedding: vectoren[j], embedding_bij: new Date().toISOString() })
      .eq('id', groep[j].id);
    if (sErr) {
      console.error(`✗ Opslaan mislukt voor chunk ${groep[j].id}:`, sErr.message);
      process.exit(1);
    }
  }
  gedaan += groep.length;
  process.stdout.write(`\r  ${gedaan}/${teDoen.length} ingelezen…`);
}

console.log(`\r✓ ${gedaan} chunks ingelezen met ${MODEL}.            `);

const { count: zonder } = await sb.from('legal_chunks')
  .select('*', { count: 'exact', head: true }).is('embedding', null);
if (zonder) console.warn(`⚠ ${zonder} chunks hebben nog geen embedding.`);
