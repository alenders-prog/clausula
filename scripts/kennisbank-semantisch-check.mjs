#!/usr/bin/env node
/**
 * scripts/kennisbank-semantisch-check.mjs
 * Controleert of `supabase/kennisbank-semantisch.sql` volledig is doorgekomen.
 *
 * Aanleiding (23 augustus 2026): bij de eerste poging faalde stap 4 op een
 * type-mismatch (`id` is uuid, niet bigint) — maar de SQL-editor stopte niet netjes
 * bij het begin. De kolom `embedding` was aangemaakt, `embedding_bij` niet, en de
 * zoekfunctie ontbrak. Van buitenaf zag dat er hetzelfde uit als een geslaagde
 * migratie: de app draaide gewoon door op de terugval.
 *
 * Draaien:  node scripts/kennisbank-semantisch-check.mjs
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

try {
  for (const regel of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    if (!regel.includes('=') || regel.trim().startsWith('#')) continue;
    const i = regel.indexOf('=');
    const sleutel = regel.slice(0, i).trim();
    if (!process.env[sleutel]) process.env[sleutel] = regel.slice(i + 1).trim();
  }
} catch { /* geen .env */ }

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const uit = [];
let alles = true;

const meld = (naam, ok, hint) => {
  uit.push(`  ${ok ? '✓' : '✗'} ${naam}${ok ? '' : `  → ${hint}`}`);
  if (!ok) alles = false;
};

// ── Kolommen ────────────────────────────────────────────────────────────────
for (const kolom of ['embedding', 'embedding_bij']) {
  const { error } = await sb.from('legal_chunks').select(kolom).limit(1);
  meld(`kolom ${kolom}`, !error, 'draai supabase/kennisbank-semantisch.sql opnieuw (stap 2)');
}

// ── Zoekfunctie ─────────────────────────────────────────────────────────────
const { error: rpcErr } = await sb.rpc('zoek_legal_chunks', {
  query_embedding: Array(1024).fill(0),
  aantal: 1,
});
meld('functie zoek_legal_chunks', !rpcErr,
  rpcErr?.message?.includes('schema cache')
    ? 'draai stap 4, en daarna: notify pgrst, \'reload schema\';'
    : `stap 4 mislukt: ${rpcErr?.message?.slice(0, 90)}`);

// ── Dekking ─────────────────────────────────────────────────────────────────
const { count: totaal } = await sb.from('legal_chunks')
  .select('*', { count: 'exact', head: true });
const { count: zonder, error: telErr } = await sb.from('legal_chunks')
  .select('*', { count: 'exact', head: true }).is('embedding', null);

if (!telErr) {
  meld(`embeddings: ${totaal - zonder}/${totaal} chunks`, zonder === 0,
    'draai node scripts/kennisbank-embed.mjs');
}

// ── Omgeving ────────────────────────────────────────────────────────────────
meld('VOYAGE_API_KEY lokaal', !!process.env.VOYAGE_API_KEY, 'zet hem in .env');

console.log('\nSemantisch zoeken — controle\n');
console.log(uit.join('\n'));
console.log(alles
  ? '\n✓ Alles staat klaar. Vergeet VOYAGE_API_KEY niet in de Vercel-omgeving.\n'
  : '\n✗ Nog niet compleet — zie de hints hierboven.\n');
process.exit(alles ? 0 : 1);
