// Maakt de Supabase Storage-bucket 'documenten' leeg via de API, zodat de
// bestanden echt verdwijnen en niet alleen hun metadata-rij.
//
// Draaien vanuit de projectmap:
//   node <pad>/storage-leegmaken.mjs          → toont alleen wat er staat
//   node <pad>/storage-leegmaken.mjs --ja     → verwijdert daadwerkelijk

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const BUCKET = 'documenten';
const ECHT   = process.argv.includes('--ja');

// .env uitlezen zonder extra dependency
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter(r => r.includes('=') && !r.trim().startsWith('#'))
    .map(r => {
      const i = r.indexOf('=');
      return [r.slice(0, i).trim(), r.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const sleutel = env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!sleutel) { console.error('SUPABASE_SERVICE_ROLE_KEY ontbreekt in .env'); process.exit(1); }

// Zonder de sleutel te tonen: klopt het type? Een service-role key is een JWT met
// "role":"service_role" in de payload. Met een anon-key blokkeert RLS het verwijderen,
// en dat meldt de Storage-API niet als fout — hij verwijdert dan stilletjes niets.
let rol = 'onbekend';
if (sleutel.startsWith('eyJ')) {
  try { rol = JSON.parse(Buffer.from(sleutel.split('.')[1], 'base64').toString()).role; } catch {}
} else if (sleutel.startsWith('sb_secret_'))      { rol = 'service_role (nieuw formaat)'; }
else if (sleutel.startsWith('sb_publishable_'))   { rol = 'PUBLIEK — fout'; }
console.log(`Sleutel: ${sleutel.length} tekens, rol = ${rol}\n`);

const db = createClient(env.SUPABASE_URL, sleutel, {
  auth: { persistSession: false },
});

// De bucket is ingedeeld als {screeningId}/{volgnummer}.pdf, dus twee niveaus diep.
async function allePaden() {
  const paden = [];
  const { data: mappen, error } = await db.storage.from(BUCKET).list('', { limit: 1000 });
  if (error) throw error;

  for (const map of mappen ?? []) {
    if (map.id) { paden.push(map.name); continue; }   // los bestand in de root
    const { data: bestanden } = await db.storage.from(BUCKET).list(map.name, { limit: 1000 });
    for (const b of bestanden ?? []) paden.push(`${map.name}/${b.name}`);
  }
  return paden;
}

const paden = await allePaden();
console.log(`Gevonden in '${BUCKET}': ${paden.length} bestanden`);
paden.slice(0, 10).forEach(p => console.log('  ' + p));
if (paden.length > 10) console.log(`  … en nog ${paden.length - 10}`);

if (!paden.length) { console.log('\nNiets te doen.'); process.exit(0); }

if (!ECHT) {
  console.log('\nProefdraai — er is niets verwijderd.');
  console.log('Draai opnieuw met --ja om het echt te doen.');
  process.exit(0);
}

// In blokken van 100: de API weigert te lange lijsten.
let weg = 0;
for (let i = 0; i < paden.length; i += 100) {
  const blok = paden.slice(i, i + 100);
  const { data, error } = await db.storage.from(BUCKET).remove(blok);
  if (error) { console.error('Fout bij verwijderen:', error.message); process.exit(1); }
  // remove() geeft de daadwerkelijk verwijderde objecten terug. Een lege lijst
  // zonder foutmelding betekent dat RLS het tegenhield — niet dat het gelukt is.
  weg += data?.length ?? 0;
  console.log(`  blok ${blok.length} aangeboden, ${data?.length ?? 0} verwijderd (totaal ${weg})`);
}

const rest = await allePaden();
console.log(`\nKlaar. Nog aanwezig: ${rest.length} bestanden.`);
