-- 2026-09-05 — drie policies die in geen enkel bestand stonden, alsnog vastgelegd
--
-- ── DIT BESTAND VERANDERT NIETS ─────────────────────────────────────────────
--
-- Alle drie de policies hieronder bestáán al in de database. Dit bestand voegt niets toe en
-- haalt niets weg; het legt vast wat er staat, zodat de repo de database weer beschrijft.
-- Uitvoeren is veilig en is een no-op: de definities zijn woordelijk overgenomen uit
-- `pg_get_expr(polqual, polrelid)` en `polroles`, en het geheel staat in één transactie.
--
-- ── WAAROM DIT ER MOET STAAN ────────────────────────────────────────────────
--
-- Bij de RLS-inventarisatie van 5 september bleken er twintig policies te leven op de tien
-- tabellen met cliënt- of toegangsgegevens. Zeventien zijn terug te voeren op een
-- migratiebestand. Deze drie niet:
--
--   screeningen    "screening: eigen org"
--   dossiers       "dossiers_eigen_org"            ← ook een andere naamgeving dan de rest
--   organisaties   "org: service_role aanmaken"
--
-- Ze zijn dus in het dashboard aangeklikt. Dat is dezelfde stille vorm als het
-- Storage-incident van diezelfde ochtend (`docs/incident-2026-09-05-storage.md`): geen
-- migratie, geen versiebeheer, geen collegiale toetsing, en niets in deze repo dat het kan
-- laten zien.
--
-- Hier is de uitkomst goedaardig — zie het oordeel per policy hieronder — maar dat is
-- toeval en geen bescherming. Let op de richting van het risico: RLS-policies zijn
-- standaard **permissief**, en permissieve policies worden met OR gecombineerd. Eén
-- bijgeklikte permissieve policy verruimt dus, en van buiten is er niets aan te zien.

begin;

-- ── screeningen: "screening: eigen org" ─────────────────────────────────────
--
-- OORDEEL: in orde, en niet overbodig. Naast `screening: via dossier` (uit
-- `001_multitenancy.sql`, die de weg via het dossier afloopt) geeft deze een tweede weg naar
-- dezelfde organisatie, rechtstreeks via `screeningen.organisatie_id`. Beide zijn
-- afgeschermd op de eigen organisatie; met OR erbij lekt er niets over kantoorgrenzen.
--
-- LET OP DE `TO`-CLAUSULE. Die ontbreekt, dus deze policy geldt voor élke rol — ook voor
-- `anon`. Dat is niet onveilig (de USING houdt tegen, en sinds
-- `2026-09-05-anon-rechten-intrekken.sql` heeft anon er sowieso geen leesrecht meer), maar
-- het is breder dan nodig en het heeft een gevolg dat niemand verwacht: het maakt
-- `npm run check:anon` blind op deze tabel. Zie de correctie in dat bestand. Versmallen
-- naar `TO authenticated` is een aparte afweging en staat hier bewust niet in — eerst meten
-- of `postgres` en `service_role` er werkelijk langsheen gaan.

drop policy if exists "screening: eigen org" on public.screeningen;

create policy "screening: eigen org"
  on public.screeningen for all
  using (organisatie_id is not null and organisatie_id = mijn_organisatie_id());

-- ── dossiers: "dossiers_eigen_org" ──────────────────────────────────────────
--
-- OORDEEL: **duplicaat**. `dossier: eigen org` uit `001_multitenancy.sql` doet hetzelfde,
-- met dezelfde voorwaarde. Twee permissieve policies met een gelijke USING gecombineerd met
-- OR geven precies wat één ervan geeft — dit verruimt dus niets en verandert niets.
--
-- Hij blijft staan omdat weghalen een gedragswijziging is en vastleggen dat niet is. Wil je
-- hem alsnog kwijt, doe dat dan als apart besluit, met de controle erbij dat
-- `dossier: eigen org` er inderdaad nog staat:
--
--   drop policy if exists "dossiers_eigen_org" on public.dossiers;

drop policy if exists "dossiers_eigen_org" on public.dossiers;

create policy "dossiers_eigen_org"
  on public.dossiers for all to authenticated
  using      (organisatie_id = mijn_organisatie_id())
  with check (organisatie_id = mijn_organisatie_id());

-- ── organisaties: "org: service_role aanmaken" ──────────────────────────────
--
-- OORDEEL: onschadelijk, en vermoedelijk overbodig. Hij staat alleen op `service_role`, en
-- die rol gaat in Supabase sowieso langs RLS heen. Alleen INSERT, met check `true`.
-- Hoort bij de registratiestroom in `api/registreer.js`, die server-side met de service-role
-- draait.

drop policy if exists "org: service_role aanmaken" on public.organisaties;

create policy "org: service_role aanmaken"
  on public.organisaties for insert to service_role
  with check (true);

commit;

-- ── CONTROLE ────────────────────────────────────────────────────────────────
--
-- Hier horen precies drie regels uit te komen, met dezelfde rollen en expressies als
-- hierboven. `{-}` in de rolkolom betekent "alle rollen".

select c.relname                               as tabel,
       p.polname                               as policy,
       p.polroles::regrole[]                   as rollen,
       pg_get_expr(p.polqual,      p.polrelid) as using_expressie,
       pg_get_expr(p.polwithcheck, p.polrelid) as with_check
from   pg_policy p
join   pg_class     c on c.oid = p.polrelid
join   pg_namespace n on n.oid = c.relnamespace
where  n.nspname = 'public'
  and  p.polname in ('screening: eigen org', 'dossiers_eigen_org', 'org: service_role aanmaken')
order  by c.relname, p.polname;

-- ── LOSSE EINDJES DIE HIERUIT VOLGEN ────────────────────────────────────────
--
-- 1. `screening: eigen org` leunt op `screeningen.organisatie_id`, en `screening: via
--    dossier` op de organisatie van het dossier. Lopen die twee uiteen, dan zien twee
--    kantoren dezelfde screening. Dat is een gegevensvraag, geen gat. Deze query hoort
--    niets terug te geven:
--
--      select s.id, s.organisatie_id as screening_org, d.organisatie_id as dossier_org
--      from   public.screeningen s
--      join   public.dossiers    d on d.id = s.dossier_id
--      where  s.organisatie_id is distinct from d.organisatie_id;
--
-- 2. Er is geen enkele automatische controle die policies in de database vergelijkt met de
--    policies in deze map. Dat is precies het gat waar deze drie in vielen. Voorlopig
--    handwerk: draai blok C van `anon-rechten-controle.sql` en zoek elke naam op met
--    `grep -rn "<policynaam>" supabase/`.
