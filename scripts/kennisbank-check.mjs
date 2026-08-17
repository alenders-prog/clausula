// Controleert of de juridische kennisbank daadwerkelijk gevuld is en of de query
// die api/analyseer.js gebruikt ook echt rijen oplevert. Read-only.
//
//   node scripts/kennisbank-check.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter(r => r.includes('=') && !r.trim().startsWith('#'))
    .map(r => { const i = r.indexOf('='); return [r.slice(0, i).trim(), r.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { count, error } = await db.from('legal_chunks').select('*', { count: 'exact', head: true });
if (error) { console.error('Fout:', error.message); process.exit(1); }
console.log(`legal_chunks: ${count} rijen`);

const { data: rijen } = await db.from('legal_chunks').select('citation, topic_tags').limit(1000);
const tags = new Set();
(rijen ?? []).forEach(r => (r.topic_tags ?? []).forEach(t => tags.add(t)));
console.log(`topic_tags in gebruik: ${tags.size}`);

// ── Schrijfwijze-controle ────────────────────────────────────────────────────
// De query-kant (situatie_kenmerken.key, en de vaste tags in api/analyseer.js)
// gebruikt underscores. Een chunk die met een streepje getagd is matcht dan nooit
// en valt stil buiten elke analyse — geen foutmelding, alleen een gat.
const perNorm = {};
[...tags].forEach(t => { (perNorm[t.replace(/-/g, '_')] ||= []).push(t); });
const dubbel = Object.entries(perNorm).filter(([, v]) => v.length > 1);

if (dubbel.length) {
  console.warn(`\n⚠  ${dubbel.length} tag(s) met twee schrijfwijzen:`);
  dubbel.forEach(([n, v]) => console.warn(`     ${n}: ${v.join('  /  ')}`));
}

const { data: kenmerken } = await db.from('situatie_kenmerken').select('key');
const keys = new Set((kenmerken ?? []).map(k => k.key));
const weesTags = [...tags].filter(t => t.includes('-') && keys.has(t.replace(/-/g, '_')));
if (weesTags.length) {
  console.warn(`\n⚠  tag(s) met streepje terwijl het kenmerk een underscore heeft — matcht nooit:`);
  weesTags.forEach(t => console.warn(`     ${t}  →  hoort ${t.replace(/-/g, '_')} te zijn`));
}
if (!dubbel.length && !weesTags.length) console.log('schrijfwijzen: consistent ✓');

// De vaste standaardclausule die analyseer.js apart ophaalt
const { data: std } = await db.from('legal_chunks')
  .select('citation')
  .eq('source_id', '10000000-0000-0000-0000-000000000001')
  .eq('chunk_index', 28).limit(1);
console.log(`standaardclausule-chunk: ${std?.length ? 'aanwezig — ' + std[0].citation : 'ONTBREEKT'}`);

const { data: tmpl } = await db.from('document_templates').select('doc_type').limit(1000);
const per = {};
(tmpl ?? []).forEach(t => { per[t.doc_type] = (per[t.doc_type] ?? 0) + 1; });
console.log(`document_templates: ${JSON.stringify(per)}`);

console.log('\nVoorbeeld van 5 citations:');
(rijen ?? []).slice(0, 5).forEach(r => console.log('  ' + r.citation));
