#!/usr/bin/env node
/**
 * scripts/fetch-wetteksten.js
 *
 * Haalt officiële wetteksten op van wetten.overheid.nl en genereert
 * SQL-chunks voor legal_chunks_seed.sql via de Anthropic API.
 *
 * Gebruik:
 *   node scripts/fetch-wetteksten.js
 *   node scripts/fetch-wetteksten.js --artikel "art. 1:82 BW"
 *   node scripts/fetch-wetteksten.js --dry-run   (alleen fetchen, niet structureren)
 *
 * Vereisten: Node 18+, ANTHROPIC_API_KEY in .env
 * Output:    scripts/output/nieuwe-chunks.sql  (append-gereed voor legal_chunks_seed.sql)
 *
 * Workflow:
 *   1. Haal officiële wettekst op van wetten.overheid.nl (gezaghebbende bron)
 *   2. Laat Claude de tekst structureren (topic_tags, convenant-relevantie)
 *   3. Genereer SQL INSERT voor review en toevoeging aan seed-bestand
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── .env laden (zelfde methode als de rest van het project) ──────────
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  const env = readFileSync(envPath, 'utf8');
  for (const line of env.split('\n')) {
    const [k, ...v] = line.split('=');
    if (k?.trim() && !k.startsWith('#')) {
      process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_KEY) {
  console.error('❌  ANTHROPIC_API_KEY niet gevonden in .env');
  process.exit(1);
}

// ── Welke wetsartikelen willen we verwerken? ─────────────────────────
// Voeg hier nieuwe artikelen toe die ontbreken in de kennisbank.
// bwbId:   Unieke identifier van de wet op wetten.overheid.nl
// artikel: Artikelnummer zoals het in de URL/HTML-anker voorkomt
// hint:    Optionele context voor Claude (bijv. welk lid relevant is)

const TE_VERWERKEN = [
  // ── BW Boek 1 ────────────────────────────────────────────────────
  {
    sourceId:  '10000000-0000-0000-0000-000000000001',
    bwbId:     'BWBR0002656',
    wetNaam:   'BW Boek 1',
    artikel:   '1:82',
    hint:      'Wederzijdse verplichtingen tot bijdrage in kosten huishouding tijdens huwelijk',
  },
  {
    sourceId:  '10000000-0000-0000-0000-000000000001',
    bwbId:     'BWBR0002656',
    wetNaam:   'BW Boek 1',
    artikel:   '1:96',
    hint:      'Verknochte goederen — buiten verdeling gemeenschap',
  },
  {
    sourceId:  '10000000-0000-0000-0000-000000000001',
    bwbId:     'BWBR0002656',
    wetNaam:   'BW Boek 1',
    artikel:   '1:116',
    hint:      'Periodiek verrekenbeding — definitie en werking',
  },
  {
    sourceId:  '10000000-0000-0000-0000-000000000001',
    bwbId:     'BWBR0002656',
    wetNaam:   'BW Boek 1',
    artikel:   '1:403',
    hint:      'Bijdrage ouders in kosten kind na 21 jaar (studerende kinderen)',
  },
  // ── WVPS ─────────────────────────────────────────────────────────
  {
    sourceId:  '10000000-0000-0000-0000-000000000003',
    bwbId:     'BWBR0006081',
    wetNaam:   'WVPS',
    artikel:   '6',
    hint:      'Informatieplicht pensioengerechtigde richting pensioenuitvoerder',
  },
  // ── BW Boek 3 ────────────────────────────────────────────────────
  {
    sourceId:  '10000000-0000-0000-0000-000000000004',
    bwbId:     'BWBR0005291',
    wetNaam:   'BW Boek 3',
    artikel:   '3:186',
    hint:      'Titel voor overdracht bij verdeling (notariële akte vereist)',
  },
];

// ── Bekende chunk-indices per source (volgende vrije index) ──────────
// Bijwerken na elke run zodat indices uniek blijven.
const VOLGENDE_INDEX = {
  '10000000-0000-0000-0000-000000000001': 31,  // BW Boek 1 (24-30 gebruikt in 2026-07)
  '10000000-0000-0000-0000-000000000002': 3,   // Rv
  '10000000-0000-0000-0000-000000000003': 6,   // WVPS (4-5 gebruikt in 2026-07)
  '10000000-0000-0000-0000-000000000004': 3,   // BW Boek 3 (2 gebruikt in 2026-07)
  '10000000-0000-0000-0000-000000000005': 5,   // Tremanormen
  '10000000-0000-0000-0000-000000000006': 4,   // IB 2001 (3 gebruikt in 2026-07)
  '10000000-0000-0000-0000-000000000007': 2,   // Participatiewet
};

// ── Stap 1: Officiële wettekst ophalen ───────────────────────────────
async function haalWettekstOp(bwbId, artikel) {
  // wetten.overheid.nl: geconsolideerde tekst als HTML.
  //
  // Zonder datumsuffix krijg je de meest recente geldende versie. Mét suffix
  // (/<BWBR-ID>/<datum>/0) antwoordt de site sinds enige tijd met 404 — en dat
  // werd hieronder afgevangen met een console.warn en `return null`, waarna het
  // script vrolijk doorliep met nul wetteksten. Op 24-08-2026 bleek zo dat de
  // hele fetcher al een tijd niets meer ophaalde zonder dat iemand het zag.
  const url = `https://wetten.overheid.nl/${bwbId}`;

  console.log(`  → Ophalen: ${url}`);
  let html;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DocumentScreening-LegalKB/1.0 (kennisbank-onderhoud)' },
      signal:  AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.warn(`  ⚠ Kon ${bwbId} niet ophalen: ${err.message}`);
    return null;
  }

  // Extraheer het relevante artikel uit de HTML
  // wetten.overheid.nl gebruikt anker-IDs in het formaat "Artikel82", "Artikel1:82", etc.
  // We zoeken naar de sectie die het artikel bevat.
  const artikelTekst = extractArtikel(html, artikel);
  if (!artikelTekst) {
    console.warn(`  ⚠ Artikel ${artikel} niet gevonden in HTML van ${bwbId}`);
    return null;
  }
  return artikelTekst;
}

function extractArtikel(html, artikel) {
  // Verwijder het dubbele-punt-formaat voor de zoektekst (1:82 → 82, 3:186 → 186)
  const artikelNr = artikel.includes(':') ? artikel.split(':')[1] : artikel;

  // Zoekpatronen voor wetten.overheid.nl HTML-structuur
  // Het artikel staat in een element met id of name die het artikelnummer bevat
  const patronen = [
    // Patroon 1: <div id="...Artikel82..."> of <artikel id="...">
    new RegExp(
      `<(?:div|artikel|section)[^>]*id=["'][^"']*[Aa]rtikel${artikelNr}[^"']*["'][^>]*>([\\s\\S]*?)</(?:div|artikel|section)>`,
      'i'
    ),
    // Patroon 2: Na een anker-element <a id="Artikel82"></a>
    new RegExp(
      `<a[^>]*id=["'][^"']*[Aa]rtikel${artikelNr}["'][^>]*>[\\s\\S]*?(<p[^>]*>[\\s\\S]*?)(?=<a[^>]*id=["'][^"']*[Aa]rtikel)`,
      'i'
    ),
  ];

  for (const patroon of patronen) {
    const match = html.match(patroon);
    if (match) {
      // HTML-tags verwijderen en witruimte normaliseren
      return match[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 3000); // max 3000 chars voor context
    }
  }
  return null;
}

// ── Stap 2: Claude structureert de wettekst ─────────────────────────
async function structureerMetClaude(artikel, wetNaam, officieleTekst, hint) {
  const prompt = `Je taak: genereer een juridische kennisbank-chunk voor een documentscreeningtool die Nederlandse echtscheidingsdocumenten (convenanten en ouderschapsplannen) analyseert.

ARTIKEL: ${artikel} (${wetNaam})
OFFICIËLE WETTEKST:
${officieleTekst || '(niet automatisch opgehaald — gebruik je juridische kennis)'}

EXTRA CONTEXT: ${hint || 'Geen'}

Genereer:
1. CITATION: Korte naam van het artikel (bijv. "art. 1:82 BW — bijdrage kosten huishouding")
2. CONTENT: Uitleg voor mediators — wat staat er in het artikel, en wat is het belang voor een convenant of ouderschapsplan? Schrijf in alinea's. Gebruik CAPS voor kernbegrippen. Vermeld ook welke GANGBARE FORMULERINGEN in convenanten correct zijn zodat de screener geen valse positieven genereert.
3. TOPIC_TAGS: Array van relevante Supabase-tags uit deze lijst:
   convenant, ouderschapsplan, alimentatie, partneralimentatie, kinderalimentatie, jongmeerderjarigen,
   tremanormen, nihilbeding, pensioen, pensioenverevening, pensioenverevening_uitgesloten,
   woning, hypotheek, eigen_woning, verdeling, vermogen, gemeenschap_van_goederen, beperkte_gemeenschap,
   huwelijkse_voorwaarden, koude_uitsluiting, verrekenbeding, uitsluitingsclausule,
   huwelijk_voor_2018, huwelijk_na_2018, fiscaal, gezag, gezamenlijk_gezag, omgang,
   informatieplicht, zorgregeling, geschillenregeling, kinderen_minderjarig

Antwoord UITSLUITEND in dit JSON-formaat (geen uitleg eromheen):
{
  "citation": "...",
  "content": "...",
  "topic_tags": ["...", "..."]
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:       'claude-sonnet-4-6',
      max_tokens:  2048,
      temperature: 0,
      messages:    [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API fout (${res.status}): ${err.slice(0, 200)}`);
  }

  const json = await res.json();
  const tekst = json.content?.[0]?.text ?? '';

  try {
    // Extraheer JSON uit de respons (Claude voegt soms tekst toe rondom het blok)
    const match = tekst.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Geen JSON gevonden');
    return JSON.parse(match[0]);
  } catch {
    throw new Error(`JSON parse mislukt. Claude-output:\n${tekst.slice(0, 300)}`);
  }
}

// ── Stap 3: SQL genereren ────────────────────────────────────────────
function genereerSQL(chunks) {
  if (!chunks.length) return '';

  // Groepeer per source_id voor nette INSERTs
  const perSource = {};
  for (const c of chunks) {
    (perSource[c.sourceId] ??= []).push(c);
  }

  const lines = [
    `-- Gegenereerd door scripts/fetch-wetteksten.js op ${new Date().toISOString().slice(0,10)}`,
    `-- Voeg dit toe aan legal_chunks_seed.sql vóór het SELECT-verificatieblok`,
    '',
  ];

  for (const [sourceId, groep] of Object.entries(perSource)) {
    lines.push(`INSERT INTO legal_chunks (source_id, chunk_index, citation, content, topic_tags) VALUES`);
    const rijen = groep.map((c, i) => {
      const isLaatste = i === groep.length - 1;
      const tags      = c.topic_tags.map(t => `'${t}'`).join(',');
      // Escape single quotes in content
      const content   = c.content.replace(/'/g, "''");
      const citation  = c.citation.replace(/'/g, "''");
      return (
        `('${sourceId}', ${c.chunkIndex},\n` +
        `'${citation}',\n` +
        `'${content}',\n` +
        `ARRAY[${tags}])${isLaatste ? '' : ','}`
      );
    });
    lines.push(rijen.join(',\n\n'), ';', '');
  }

  return lines.join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  const args    = process.argv.slice(2);
  const dryRun  = args.includes('--dry-run');
  const filter  = args.find(a => a.startsWith('--artikel='))?.slice(10);

  const targets = filter
    ? TE_VERWERKEN.filter(t => t.artikel === filter)
    : TE_VERWERKEN;

  if (!targets.length) {
    console.error(`Geen artikelen gevonden${filter ? ` voor "${filter}"` : ''}.`);
    process.exit(1);
  }

  console.log(`\n📚  Kennisbank-uitbreiding — ${targets.length} artikel(en) te verwerken\n`);

  const indexTeller = { ...VOLGENDE_INDEX };
  const resultaten  = [];

  for (const target of targets) {
    console.log(`\n▶  ${target.artikel} (${target.wetNaam})`);

    // Stap 1: officiële tekst ophalen
    const officieleTekst = await haalWettekstOp(target.bwbId, target.artikel);
    if (officieleTekst) {
      console.log(`  ✓ Officiële tekst opgehaald (${officieleTekst.length} tekens)`);
    } else {
      console.log(`  ℹ Geen officiële tekst — Claude gebruikt eigen kennis`);
    }

    if (dryRun) {
      console.log('  (dry-run: stap 2 overgeslagen)');
      continue;
    }

    // Stap 2: structureren via Claude
    try {
      const chunk     = await structureerMetClaude(
        target.artikel, target.wetNaam, officieleTekst, target.hint
      );
      const idx       = indexTeller[target.sourceId] ?? 99;
      indexTeller[target.sourceId] = idx + 1;

      resultaten.push({
        sourceId:   target.sourceId,
        chunkIndex: idx,
        citation:   chunk.citation,
        content:    chunk.content,
        topic_tags: chunk.topic_tags,
      });
      console.log(`  ✓ Gestructureerd: "${chunk.citation}" [idx ${idx}]`);
    } catch (err) {
      console.error(`  ✗ Fout bij structureren: ${err.message}`);
    }

    // Rate-limit buffer (1 call/s)
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!resultaten.length) {
    console.log('\nGeen resultaten om op te slaan.');
    return;
  }

  // Stap 3: SQL wegschrijven
  const sql       = genereerSQL(resultaten);
  const outputDir = join(__dirname, 'output');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const outputPad = join(outputDir, 'nieuwe-chunks.sql');
  writeFileSync(outputPad, sql, 'utf8');

  console.log(`\n✅  ${resultaten.length} chunk(s) gegenereerd → ${outputPad}`);
  console.log('\nVolgende stap:');
  console.log('  1. Review het gegenereerde SQL-bestand');
  console.log('  2. Voeg de inhoud toe aan legal_chunks_seed.sql (vóór het SELECT-blok)');
  console.log('  3. Voer de INSERT-statements uit in de Supabase SQL-editor');
  console.log('  4. Pas VOLGENDE_INDEX bovenaan dit script aan voor de volgende run\n');

  // Toon ook de SQL in de terminal voor snelle review
  console.log('─'.repeat(60));
  console.log(sql);
  console.log('─'.repeat(60));
}

main().catch(err => {
  console.error('\n❌  Onverwachte fout:', err.message);
  process.exit(1);
});
