-- ============================================================================
-- embedding_hash — zodat een GEWIJZIGDE chunk opnieuw wordt ingelezen
--
-- Aanleiding (24 augustus 2026). Na het rechtzetten van de alimentatie-chunks
-- meldde `node scripts/kennisbank-embed.mjs`:
--
--     kennisbank: 90 chunks | in te lezen: 0
--     ✓ Alles staat al in de index.
--
-- terwijl er drie chunks waren herschreven. Het script koos zijn werk zo:
--
--     chunks.filter(c => !c.embedding_bij)
--
-- Dat vindt alleen chunks die NOG NOOIT zijn ingelezen. Een chunk waarvan de
-- tekst verandert houdt zijn stempel en blijft dus voor altijd op zijn oude
-- inhoud vindbaar — exact het gevaar dat in de kop van datzelfde script staat
-- beschreven, en in CLAUDE.md. De regel bestond, maar ging nooit af.
--
-- De tabel heeft geen `updated_at`, dus er valt niets te vergelijken. Vandaar
-- een hash van de tekst die is ingelezen. Verschilt die van de hash van de
-- huidige tekst, dan is de embedding verouderd — en dat is nu wél te zien.
--
-- Na deze migratie hebben alle bestaande chunks een lege hash. De eerstvolgende
-- run leest ze daarom allemaal opnieuw in. Dat is precies wat er nu moet
-- gebeuren: de embeddings van de bijgewerkte chunks staan nog op de oude tekst.
--
-- DRAAIEN, DAN:  node scripts/kennisbank-embed.mjs
-- ============================================================================

alter table legal_chunks
  add column if not exists embedding_hash text;

comment on column legal_chunks.embedding_hash is
  'sha256 van citation + newline + content zoals ingelezen door '
  'scripts/kennisbank-embed.mjs. Wijkt af van de huidige tekst → embedding verouderd.';

-- Controle: verwacht 90 chunks, alle met een lege hash.
select count(*) filter (where embedding_hash is null) as zonder_hash,
       count(*)                                       as totaal
from legal_chunks;
