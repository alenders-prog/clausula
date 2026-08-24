// Controleert of de juridische kennisbank daadwerkelijk gevuld is en of de query
// die api/analyseer.js gebruikt ook echt rijen oplevert. Read-only.
//
//   node scripts/kennisbank-check.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// Pad relatief aan dít bestand, niet aan de werkmap: de PostToolUse-hook roept het
// script via execFileSync aan en dan is de werkmap niet gegarandeerd de projectmap.
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(r => r.includes('=') && !r.trim().startsWith('#'))
    .map(r => { const i = r.indexOf('='); return [r.slice(0, i).trim(), r.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Wat er mis blijkt. Tot 24 augustus 2026 eindigde dit script altijd met exitcode 0,
// ook als het een tag vond die nergens op matcht: het meldde het gat en gaf groen.
// Daardoor was het niet als poort te gebruiken — in een hook of in CI zag niemand het.
const problemen = [];

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
  problemen.push(`${dubbel.length} tag(s) met twee schrijfwijzen`);
  console.warn(`\n⚠  ${dubbel.length} tag(s) met twee schrijfwijzen:`);
  dubbel.forEach(([n, v]) => console.warn(`     ${n}: ${v.join('  /  ')}`));
}

const { data: kenmerken } = await db.from('situatie_kenmerken').select('key');
const keys = new Set((kenmerken ?? []).map(k => k.key));
const weesTags = [...tags].filter(t => t.includes('-') && keys.has(t.replace(/-/g, '_')));
if (weesTags.length) {
  problemen.push(`${weesTags.length} tag(s) met streepje die nooit matchen`);
  console.warn(`\n⚠  tag(s) met streepje terwijl het kenmerk een underscore heeft — matcht nooit:`);
  weesTags.forEach(t => console.warn(`     ${t}  →  hoort ${t.replace(/-/g, '_')} te zijn`));
}
if (!dubbel.length && !weesTags.length) console.log('schrijfwijzen: consistent ✓');

// ── Bereikbaarheid: gaat elke chunk ooit mee naar een analyse? ───────────────
// api/analyseer.js bouwt zijn zoektags uit situatie_kenmerken, de documenttypes, en
// een vast lijstje bij huwelijkse voorwaarden. Een chunk waarvan géén enkele tag in
// die verzameling voorkomt, wordt bij geen enkele classificatie opgehaald. Hij staat
// in de database, kost niets, en doet niets — en dat is nergens aan te zien, want
// een analyse zonder die kennis ziet er even compleet uit.
//
// Gemeten op 23 augustus 2026: acht van de vierennegentig chunks, waaronder het
// complete IPR-blok. Zie supabase/kennisbank-bereikbaarheid.sql.
const BEREIKBAAR_ZONDER_KENMERK = new Set([
  // documenttypes (effectiefHoofd.map(d => d.type))
  'convenant', 'ouderschapsplan', 'huwelijkse_voorwaarden',
  // het vaste lijstje dat erbij komt zodra er huwelijkse voorwaarden zijn
  'verrekenbeding', 'koude_uitsluiting', 'uitsluitingsclausule',
  // afgeleid uit de nationaliteiten, zie src/rapport/internationaal.js
  'internationaal',
]);
const bereikbaar = new Set([...keys, ...BEREIKBAAR_ZONDER_KENMERK]);
const onbereikbaar = (rijen ?? []).filter(r => !(r.topic_tags ?? []).some(t => bereikbaar.has(t)));

if (onbereikbaar.length) {
  problemen.push(`${onbereikbaar.length} chunk(s) bereiken geen enkele analyse`);
  console.warn(`\n⚠  ${onbereikbaar.length} chunk(s) bereiken géén enkele analyse:`);
  onbereikbaar.forEach(r =>
    console.warn(`     ${(r.citation ?? '').slice(0, 56).padEnd(58)}[${(r.topic_tags ?? []).join(', ')}]`));
  console.warn('   Geef ze een tag die in situatie_kenmerken staat, of voeg een kenmerk toe.');
  console.warn('   Zie supabase/kennisbank-bereikbaarheid.sql voor het patroon.');
} else {
  console.log('bereikbaarheid: elke chunk kan in een analyse terechtkomen ✓');
}

// De vaste standaardclausule die analyseer.js apart ophaalt
const { data: std } = await db.from('legal_chunks')
  .select('citation')
  .eq('source_id', '10000000-0000-0000-0000-000000000001')
  .eq('chunk_index', 28).limit(1);
console.log(`standaardclausule-chunk: ${std?.length ? 'aanwezig — ' + std[0].citation : 'ONTBREEKT'}`);
if (!std?.length) problemen.push('de standaardclausule-chunk ontbreekt');

const { data: tmpl } = await db.from('document_templates').select('doc_type').limit(1000);
const per = {};
(tmpl ?? []).forEach(t => { per[t.doc_type] = (per[t.doc_type] ?? 0) + 1; });
console.log(`document_templates: ${JSON.stringify(per)}`);

console.log('\nVoorbeeld van 5 citations:');
(rijen ?? []).slice(0, 5).forEach(r => console.log('  ' + r.citation));

// ── Uitkomst ────────────────────────────────────────────────────────────────
// Ook op stdout, niet alleen op stderr. De PostToolUse-hook leest het resultaat via
// execFileSync en die geeft uitsluitend stdout terug — de ⚠-regels hierboven staan
// op stderr en waren voor de hook dus onzichtbaar. Hij keek naar '⚠' in een tekst
// waar dat teken per definitie niet in kon staan.
if (problemen.length) {
  console.log(`\nUITKOMST: ${problemen.length} probleem/problemen — ${problemen.join('; ')}`);
} else {
  console.log('\nUITKOMST: kennisbank in orde.');
}
process.exitCode = problemen.length ? 1 : 0;
