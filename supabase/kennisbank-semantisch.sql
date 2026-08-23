-- ═══════════════════════════════════════════════════════════════════════════
-- Semantisch zoeken in de kennisbank
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Aanleiding (23 augustus 2026). De kennisbank werd doorzocht met
--
--     ilike('content', '%' || eerste_woord || '%')
--
-- dus alléén op het eerste woord van de zoekopdracht, zonder enige sortering.
-- Gemeten over twaalf realistische vragen: zes daarvan leverden nul relevante
-- chunks op. Het model kreeg materiaal dat er half naast zat, zocht opnieuw, en
-- dat verklaart een groot deel van de drie tot vijf zoekrondes per vraag.
--
-- Woordzoeken kán dit niet oplossen. Op "heeft de vertrekkende partij nog
-- zeggenschap over de woning" hoort art. 3:170 BW het antwoord te zijn, maar het
-- woord "zeggenschap" komt in die chunk niet voor. Gemeten resultaat over dezelfde
-- twaalf vragen — relevante chunks in de top 5:
--
--     nu (eerste woord)          11
--     alle woorden + score       22
--     semantisch (voyage-law-2)  34      en nul vragen zonder treffer
--
-- ── In deze volgorde uitvoeren in de Supabase SQL-editor ──────────────────────
--
-- Het hele bestand mag in één keer, en mag opnieuw: elke stap is idempotent
-- (`if not exists` / `or replace`). Loopt er iets mis, corrigeer dan en draai het
-- bestand opnieuw in zijn geheel — de stappen die al gelukt waren doen niets.

-- ── Stap 1: pgvector aanzetten ───────────────────────────────────────────────
create extension if not exists vector;

-- ── Stap 2: kolom voor de embedding ──────────────────────────────────────────
-- 1024 dimensies: dat is wat voyage-law-2 teruggeeft. Een ander model betekent
-- een andere lengte en dus een nieuwe kolom.
alter table legal_chunks
  add column if not exists embedding vector(1024);

-- Bijhouden wanneer een chunk voor het laatst is ingelezen. Zonder dit is niet te
-- zien of een gewijzigde chunk nog met zijn oude tekst in de index staat.
alter table legal_chunks
  add column if not exists embedding_bij timestamptz;

-- ── Stap 3: index ────────────────────────────────────────────────────────────
-- HNSW op cosinus-afstand. Bij 94 chunks is dit nog niet nodig voor de snelheid,
-- maar de index moet er staan vóór de kennisbank groeit — niet erna.
--
-- Geeft dit "access method hnsw does not exist", dan is pgvector ouder dan 0.5.
-- Sla deze stap dan over: zonder index werkt alles, alleen wordt er lineair
-- gezocht. Bij honderd chunks merk je daar niets van.
create index if not exists legal_chunks_embedding_idx
  on legal_chunks using hnsw (embedding vector_cosine_ops);

-- ── Stap 4: zoekfunctie ──────────────────────────────────────────────────────
-- Geeft de dichtstbijzijnde chunks terug, optioneel beperkt tot bepaalde tags.
-- `drempel` filtert resultaten weg die alleen maar het minst ver weg liggen: bij
-- een vraag die buiten de kennisbank valt hoort níéts terug te komen, geen vijf
-- willekeurige chunks.
create or replace function zoek_legal_chunks(
  query_embedding vector(1024),
  aantal          int     default 5,
  drempel         float   default 0.35,
  filter_tags     text[]  default null
)
-- Let op: `id` is een uuid, niet een bigint. De types hieronder moeten exact
-- overeenkomen met die van legal_chunks, anders weigert Postgres de functie met
-- "return type mismatch in function declared to return record" — een melding die
-- naar de functie wijst en niet naar de kolom die niet klopt.
returns table (
  id         uuid,
  citation   text,
  content    text,
  topic_tags text[],
  score      float
)
language sql
stable
as $$
  -- Expliciet casten. De declaratie hierboven moet exact overeenkomen met wat deze
  -- select teruggeeft; een kolom die varchar blijkt in plaats van text laat Postgres
  -- de hele functie weigeren. Met een cast kan dat niet meer botsen.
  select
    lc.id,
    lc.citation::text,
    lc.content::text,
    lc.topic_tags::text[],
    (1 - (lc.embedding <=> query_embedding))::float as score
  from legal_chunks lc
  where lc.embedding is not null
    and (filter_tags is null or lc.topic_tags::text[] && filter_tags)
    and 1 - (lc.embedding <=> query_embedding) >= drempel
  order by lc.embedding <=> query_embedding
  limit aantal;
$$;

-- PostgREST kent nieuwe functies pas na een herlaadsignaal. Zonder deze regel
-- geeft de API "function not found" terwijl de functie gewoon bestaat.
notify pgrst, 'reload schema';

-- ── Stap 5: controle ─────────────────────────────────────────────────────────
-- Draai hierna `node scripts/kennisbank-embed.mjs` om de 94 chunks in te lezen.
-- Daarna hoort deze query 94 te geven, en 0 voor de tweede kolom:
--
--   select count(*) filter (where embedding is not null) as ingelezen,
--          count(*) filter (where embedding is null)     as ontbreekt
--   from legal_chunks;
