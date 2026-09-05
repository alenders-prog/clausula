-- 2026-09-05 — de documenten-bucket stond open voor anonieme bezoekers
--
-- ── WAT ER AAN DE HAND WAS ──────────────────────────────────────────────────
--
-- Op storage.objects stonden naast de drie juiste policies uit 001_multitenancy.sql
-- (TO authenticated, afgeschermd op de organisatiemap) nog drie policies op de anon-rol:
--
--     allow anon download   1ljx2pw_0   SELECT   public
--     allow anon signed url 1ljx2pw_0   SELECT   public
--     allow anon upload     1ljx2pw_0   INSERT   public
--
-- De naamsuffix verraadt de herkomst: die vorm genereert de policywizard in het
-- Supabase-dashboard. Ze zijn dus aangeklikt en niet uit een migratie gekomen, en daarom
-- liet niets in deze repo zien dat ze bestonden.
--
-- Gemeten op 5 september 2026, met alleen de publieke sleutel uit config.js en zonder in
-- te loggen — die sleutel wordt aan elke bezoeker van app.clausula.nl geserveerd:
--
--     lijst mappen in de bucket        HTTP 200    dossier-UUID's opsombaar
--     lijst bestanden in een map       HTTP 200    12 bestanden
--     download van een document        HTTP 200    107.422 bytes
--     ondertekende URL aanvragen       HTTP 200
--
-- De INSERT-policy is niet getest — schrijven naar een productiebucket om een gat aan te
-- tonen is geen redelijke prijs. Maar hij stond er, dus anoniem plaatsen kon.
--
-- De bucket zelf staat níét als publiek gemarkeerd: /object/public/ gaf 400. Het waren
-- uitsluitend deze policies.
--
-- ── DE REPARATIE ────────────────────────────────────────────────────────────
--
-- Alleen de drie anon-policies verdwijnen. De drie uit 001_multitenancy.sql blijven staan
-- en doen het werk: TO authenticated, en de eerste mapnaam moet de organisatie van de
-- gebruiker zijn.

BEGIN;

DROP POLICY IF EXISTS "allow anon download 1ljx2pw_0"   ON storage.objects;
DROP POLICY IF EXISTS "allow anon signed url 1ljx2pw_0" ON storage.objects;
DROP POLICY IF EXISTS "allow anon upload 1ljx2pw_0"     ON storage.objects;

-- Ook de oude naam uit 001_multitenancy.sql, voor het geval die ooit terugkeert.
DROP POLICY IF EXISTS "documenten: public lezen"        ON storage.objects;

COMMIT;

-- ── CONTROLE ────────────────────────────────────────────────────────────────
--
-- Wat hierna overblijft moet uitsluitend {authenticated} zijn. Draai dit in dezelfde
-- sessie en lees de uitkomst; hij hoort drie regels te geven, alle drie authenticated.

SELECT policyname,
       cmd,
       roles,
       CASE WHEN roles::text[] <@ ARRAY['authenticated'] THEN 'ok' ELSE 'LET OP' END AS oordeel
FROM   pg_policies
WHERE  schemaname = 'storage'
  AND  tablename  = 'objects'
ORDER  BY oordeel DESC, policyname;

-- Staat er nog iets met 'anon' of 'public' in de rollen, dan is dit script niet af:
-- die regel geeft dan 'LET OP'. Verwijder hem pas nadat je hebt vastgesteld waar hij
-- vandaan komt — er is er hier al één stilletjes bijgekomen.
--
-- Toets daarna van buitenaf met:  node scripts/storage-toegang-check.mjs
-- Dat is de controle die telt: het beleid lezen zegt wat er hoort te gebeuren, de probe
-- zegt wat er werkelijk gebeurt.
