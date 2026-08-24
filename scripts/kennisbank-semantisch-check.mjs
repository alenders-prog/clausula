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
import { createHash } from 'node:crypto';
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
for (const kolom of ['embedding', 'embedding_bij', 'embedding_hash']) {
  const { error } = await sb.from('legal_chunks').select(kolom).limit(1);
  meld(`kolom ${kolom}`, !error, kolom === 'embedding_hash'
    ? 'draai supabase/2026-08-24-embedding-hash.sql'
    : 'draai supabase/kennisbank-semantisch.sql opnieuw (stap 2)');
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

// ── Embeddings op verouderde tekst ──────────────────────────────────────────
// Een chunk waarvan de tekst is aangepast maar de embedding niet, wordt gevonden
// op zijn OUDE inhoud. Van buiten is daar niets aan te zien: de tekst klopt, het
// aantal embeddings klopt, en de app draait door. Op 24 augustus 2026 stonden er
// zo drie herschreven alimentatie-chunks met de embedding van hun vorige versie,
// terwijl deze controle "Alles staat klaar" meldde.
//
// De hash moet dezelfde tekst dekken als scripts/kennisbank-embed.mjs inleest —
// citatie, newline, inhoud, afgekapt op 8000 tekens. Wijken die twee uiteen, dan
// meldt deze controle alles als verouderd en valt dat meteen op.
const { data: rijen, error: hashErr } = await sb
  .from('legal_chunks').select('citation, content, embedding_hash, embedding_bij');

if (!hashErr) {
  const hashVan = c => createHash('sha256')
    .update(`${c.citation || ''}\n${c.content || ''}`.slice(0, 8000))
    .digest('hex');
  const oudbakken = rijen.filter(c => c.embedding_bij && c.embedding_hash !== hashVan(c));
  meld(`embeddings op de huidige tekst: ${rijen.length - oudbakken.length}/${rijen.length}`,
    oudbakken.length === 0, 'draai node scripts/kennisbank-embed.mjs');
  for (const c of oudbakken.slice(0, 8)) uit.push(`      ~ verouderd: ${c.citation}`);
  if (oudbakken.length > 8) uit.push(`      ~ … en nog ${oudbakken.length - 8}`);
}

// ── Omgeving ────────────────────────────────────────────────────────────────
meld('VOYAGE_API_KEY lokaal', !!process.env.VOYAGE_API_KEY, 'zet hem in .env');

console.log('\nSemantisch zoeken — controle\n');
console.log(uit.join('\n'));
console.log(alles
  ? '\n✓ Alles staat klaar. Vergeet VOYAGE_API_KEY niet in de Vercel-omgeving.\n'
  : '\n✗ Nog niet compleet — zie de hints hierboven.\n');
// Géén process.exit(): dat kapte het proces op Windows af terwijl de HTTP-handles
// nog sloten — "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)".
process.exitCode = alles ? 0 : 1;
