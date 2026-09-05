-- 2026-09-05 — B2: de backuptabellen uit het API-schema halen
--
-- ── WAAROM ──────────────────────────────────────────────────────────────────
--
-- `_backup_screeningen` bevat 111 rijen uit 27 juni – 2 augustus 2026. Daarvan hebben er
-- **57 geen enkele pseudonimisering**, en alle 111 dragen de volledige documenttekst.
--
-- Ze staan in het `public`-schema, en dat is precies het schema dat PostgREST bedient. Ze
-- zijn dus via de API bereikbaar; alleen een RLS-regel die geen rijen teruggeeft houdt
-- tegen. De actieve tabellen zijn beter af: die worden beschermd doordat de anonieme rol er
-- geen rechten op heeft — althans, ná
-- `2026-09-05-anon-rechten-intrekken.sql`.
--
-- Op 5 september bleek hoe dun "alleen een RLS-regel" is: bij Storage stonden er drie
-- policies naast de juiste, aangeklikt in het dashboard, en niets in de repo liet dat zien.
-- Dezelfde vorm, hier met 57 onbewerkte dossiers erachter.
--
-- ── VERPLAATSEN, NIET VERWIJDEREN ───────────────────────────────────────────
--
-- De architectuurbeoordeling noemde beide opties. Verplaatsen is hier beter:
--
--   * het haalt de blootstelling weg — PostgREST bedient alleen `public` (en wat er
--     expliciet is bijgezet), dus een tabel in een ander schema is niet meer bereikbaar
--   * het is omkeerbaar, en verwijderen niet
--   * er is een reden waarom het backups zijn, en die reden is van buiten niet te zien
--
-- Wilt u ze later alsnog kwijt, dan staat de opdracht onderaan. Doe dat pas als vaststaat
-- dat er niets meer in zit dat u nodig heeft — 111 rijen weggooien is geen stap terug.

begin;

-- Een schema dat PostgREST niet bedient. Alleen de service-role komt er nog bij.
create schema if not exists archief;

revoke all on schema archief from anon, authenticated;
grant  usage on schema archief to postgres, service_role;

alter table if exists public._backup_screeningen set schema archief;
alter table if exists public._backup_dossiers    set schema archief;

revoke all on all tables in schema archief from anon, authenticated;

commit;

-- ── CONTROLE ────────────────────────────────────────────────────────────────
--
-- Hier hoort niets meer uit te komen: de tabellen staan niet meer in `public`.

select table_schema, table_name
from   information_schema.tables
where  table_name in ('_backup_screeningen', '_backup_dossiers')
order  by table_schema;

-- Verwacht: beide regels met table_schema = 'archief'.
--
-- En van buitenaf, met de publieke sleutel — beide horen nu 404 te geven in plaats van
-- 200 met een lege lijst:
--
--   curl -s -o /dev/null -w "%{http_code}\n" \
--     "https://<project>.supabase.co/rest/v1/_backup_screeningen?select=*&limit=1" \
--     -H "apikey: <publieke sleutel uit config.js>"

-- ── LATER, ALS ZE ECHT WEG MOGEN ────────────────────────────────────────────
--
-- Niet nu uitvoeren. Eerst vaststellen dat er niets in staat dat u nog nodig heeft, en bij
-- voorkeur een export bewaren buiten de database.
--
-- drop table if exists archief._backup_screeningen;
-- drop table if exists archief._backup_dossiers;
