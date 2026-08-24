#!/usr/bin/env node
/**
 * scripts/check-legal-chunks.js
 * ─────────────────────────────
 * Controleert de volledigheid van de legal_chunks kennisbank in Supabase.
 * Vergelijkt de aanwezige chunks met de verwachte referentielijst.
 *
 * Gebruik (vanuit de project-root):
 *   node scripts/check-legal-chunks.js
 *
 * Vereisten:
 *   - .env met SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY
 *   - @supabase/supabase-js (al aanwezig in package.json)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── .env inladen (simpele parser, geen dotenv afhankelijkheid) ────────
function laadEnv() {
  try {
    const envPad = resolve(__dirname, '../.env');
    const inhoud = readFileSync(envPad, 'utf8');
    for (const regel of inhoud.split('\n')) {
      const [key, ...rest] = regel.trim().split('=');
      if (key && !key.startsWith('#')) {
        process.env[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // .env niet gevonden — gebruik omgevingsvariabelen
  }
}

laadEnv();

const SUPABASE_URL             = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌  SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt in .env');
  process.exit(1);
}

// ── Referentielijst: alle verwachte chunks ────────────────────────────
// Voeg hier nieuwe verwachte chunks aan toe als je de kennisbank uitbreidt.
const VERWACHT = [
  // BW Boek 1 — Huwelijksvermogen
  { citation: 'art. 1:94 BW (vóór 1-1-2018) — algehele gemeenschap van goederen', categorie: 'BW Boek 1' },
  { citation: 'art. 1:94 BW (na 1-1-2018) — beperkte gemeenschap van goederen',   categorie: 'BW Boek 1' },
  { citation: 'art. 1:99–100 BW — ontbinding en verdeling huwelijksgemeenschap',   categorie: 'BW Boek 1' },
  { citation: 'art. 1:114 BW — huwelijkse voorwaarden',                            categorie: 'BW Boek 1' },
  { citation: 'art. 1:132–133 BW — koude uitsluiting',                             categorie: 'BW Boek 1' },
  { citation: 'art. 1:121 BW — verrekenbeding',                                    categorie: 'BW Boek 1' },
  { citation: 'art. 1:141 BW — niet-nagekomen periodiek verrekenbeding',           categorie: 'BW Boek 1' },
  { citation: 'art. 1:94 lid 3 BW / art. 1:95 BW — uitsluitingsclausule en zaaksvervanging', categorie: 'BW Boek 1' },
  // BW Boek 1 — Partneralimentatie
  { citation: 'Art. 1:157 BW — duur partneralimentatie (geldend recht, verzoeken vanaf 1-1-2020)',               categorie: 'BW Boek 1 — alimentatie' },
  { citation: 'art. 1:158 BW — Nihilbeding',                    categorie: 'BW Boek 1 — alimentatie' },
  { citation: 'art. 1:159 BW — Niet-wijzigingsbeding alimentatie',                             categorie: 'BW Boek 1 — alimentatie' },
  { citation: 'art. 1:159a BW — Partneralimentatie en Participatiewet-verhaal', categorie: 'BW Boek 1 — alimentatie' },
  { citation: 'art. 1:160 BW — verval alimentatie bij samenwonen of hertrouwen',   categorie: 'BW Boek 1 — alimentatie' },
  { citation: 'art. 1:397 BW — draagkracht alimentatie (algemeen)',                categorie: 'BW Boek 1 — alimentatie' },
  { citation: 'art. 1:401 BW — wijziging en intrekking alimentatie',               categorie: 'BW Boek 1 — alimentatie' },
  { citation: 'art. 1:402 BW — ingangsdatum alimentatieverplichting',              categorie: 'BW Boek 1 — alimentatie' },
  { citation: 'art. 1:408 BW — indexering alimentatie',                            categorie: 'BW Boek 1 — alimentatie' },
  // BW Boek 1 — Kinderalimentatie
  { citation: 'art. 1:404 BW — kinderalimentatie',                                 categorie: 'BW Boek 1 — alimentatie' },
  // BW Boek 1 — Gezag en zorgregeling
  { citation: 'art. 1:247 BW — ouderlijk gezag',                                   categorie: 'BW Boek 1 — gezag' },
  { citation: 'art. 1:253n BW — eenhoofdig gezag na scheiding',                   categorie: 'BW Boek 1 — gezag' },
  { citation: 'art. 1:253a BW — geschillenregeling bij gezamenlijk gezag',         categorie: 'BW Boek 1 — gezag' },
  { citation: 'art. 1:377a–377b BW — omgang en informatieplicht',                  categorie: 'BW Boek 1 — gezag' },
  // Rv
  { citation: 'art. 815 Rv — convenant bij gemeenschappelijk echtscheidingsverzoek', categorie: 'Rv' },
  { citation: 'art. 826 Rv — ouderschapsplan bij echtscheiding met kinderen',       categorie: 'Rv' },
  // WVPS
  { citation: 'WVPS art. 2 — standaard pensioenverevening 50/50',                  categorie: 'WVPS' },
  { citation: 'WVPS art. 5 — afwijking pensioenverevening',                        categorie: 'WVPS' },
  { citation: 'WVPS art. 11 — meldingsplicht bij pensioenuitvoerder (2-jaarstermijn)', categorie: 'WVPS' },
  // BW Boek 3
  { citation: 'art. 3:170 BW — beheer en beschikking gemeenschappelijk goed',      categorie: 'BW Boek 3' },
  // IB 2001
  { citation: 'IB 2001 art. 6.3 + 3.101 — fiscale behandeling partneralimentatie', categorie: 'Fiscaal' },
  { citation: 'IB 2001 art. 3.111 + 3.119a — eigen woning en renteaftrek na scheiding', categorie: 'Fiscaal' },
  // Participatiewet
  { citation: 'Participatiewet art. 62 — verhaalsrecht gemeente op alimentatieplichtige', categorie: 'Participatiewet' },
  // Tremanormen
  { citation: 'Tremanormen 2025 — Methode kinderalimentatie (§1–4)',               categorie: 'Tremanormen' },
  { citation: 'Tremanormen 2025 — Behoeftetabel kinderalimentatie (tabel 1)',      categorie: 'Tremanormen' },
  { citation: 'Tremanormen 2025 — Draagkrachttabel en berekening draagkracht',    categorie: 'Tremanormen' },
  { citation: 'Tremanormen 2025 — Partneralimentatie: jusvergelijking',            categorie: 'Tremanormen' },
];

// ── Vergelijkingsfunctie: fuzzy match op eerste paar woorden ─────────
function matchCitatie(aanwezig, verwacht) {
  // Exacte match
  if (aanwezig === verwacht) return true;
  // Begint met hetzelfde (jaar in citation kan afwijken)
  const normA = aanwezig.toLowerCase().replace(/\s+/g, ' ').trim();
  const normV = verwacht.toLowerCase().replace(/\s+/g, ' ').trim();
  // Eerste 25 tekens gelijk → match (vangt "art. 1:157 BW" vs "art. 1:157 BW — ...")
  return normA.startsWith(normV.slice(0, 25)) || normV.startsWith(normA.slice(0, 25));
}

// ── Hoofdlogica ───────────────────────────────────────────────────────
async function main() {
  console.log('\n🔍  Legal Chunks — Volledigheidscheck');
  console.log('═'.repeat(55));

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Haal alle huidige chunks op
  const { data: chunks, error } = await supabase
    .from('legal_chunks')
    .select('citation, topic_tags, source_id')
    .order('citation');

  if (error) {
    console.error('❌  Supabase-fout:', error.message);
    process.exit(1);
  }

  const aanwezigCitaties = new Set(chunks.map(c => c.citation));

  // Check elke verwachte chunk
  const ontbreekt = [];
  const aanwezig  = [];

  for (const v of VERWACHT) {
    const gevonden = [...aanwezigCitaties].some(a => matchCitatie(a, v.citation));
    if (gevonden) {
      aanwezig.push(v);
    } else {
      ontbreekt.push(v);
    }
  }

  // Rapport per categorie
  const categorieën = [...new Set(VERWACHT.map(v => v.categorie))];
  for (const cat of categorieën) {
    const catAanwezig  = aanwezig.filter(v => v.categorie === cat);
    const catOntbreekt = ontbreekt.filter(v => v.categorie === cat);
    const totaal = catAanwezig.length + catOntbreekt.length;
    const status = catOntbreekt.length === 0 ? '✅' : '⚠️ ';
    console.log(`\n${status}  ${cat} (${catAanwezig.length}/${totaal})`);
    for (const v of catOntbreekt) {
      console.log(`     ❌  ONTBREEKT: ${v.citation}`);
    }
  }

  // Onverwachte chunks (in DB maar niet in referentielijst)
  const onverwacht = chunks.filter(c =>
    !VERWACHT.some(v => matchCitatie(c.citation, v.citation))
  );

  console.log('\n' + '─'.repeat(55));
  console.log(`📊  Samenvatting:`);
  console.log(`    Aanwezig:       ${aanwezig.length} / ${VERWACHT.length} verwachte chunks`);
  console.log(`    Ontbrekend:     ${ontbreekt.length}`);
  console.log(`    Totaal in DB:   ${chunks.length} chunks`);
  if (onverwacht.length > 0) {
    console.log(`\n📌  Extra chunks in DB (niet in referentielijst):`);
    for (const c of onverwacht) {
      console.log(`    • ${c.citation}`);
    }
  }

  // Actie-advies
  if (ontbreekt.length > 0) {
    console.log('\n💡  Actie: voer legal_chunks_seed.sql opnieuw uit in Supabase SQL-editor.');
    console.log('    Het seed-bestand bevat alle verwachte chunks.\n');
  } else {
    console.log('\n🎉  Kennisbank is volledig! Geen actie nodig.\n');

    // Controleer of Tremanormen nog actueel zijn
    const tremanormenChunk = chunks.find(c => c.citation?.includes('Tremanormen'));
    if (tremanormenChunk) {
      const huidigJaar = new Date().getFullYear();
      if (!tremanormenChunk.citation?.includes(String(huidigJaar))) {
        console.log(`⚠️   Tremanormen lijken niet bijgewerkt voor ${huidigJaar}.`);
        console.log(`    Update: zie docs/kennisbank-onderhoud.md voor de procedure.\n`);
      }
    }
  }
}

main().catch(err => {
  console.error('Onverwachte fout:', err);
  process.exit(1);
});
