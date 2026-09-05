-- 2026-09-05 — inventarisatie van de toegangsbeveiliging, tegen de lévende database
--
-- ── WAAROM DIT ER IS ────────────────────────────────────────────────────────
--
-- De frontend praat rechtstreeks met Supabase: veertig queries over zeven tabellen, met de
-- publieke sleutel. Daar is RLS de énige bescherming. De architectuurbeoordeling markeerde
-- de volledigheid daarvan als ongetoetst: er was gekeken wat een anonieme bezoeker kan,
-- niet wat een ingelogde gebruiker van een ánder kantoor kan.
--
-- De migraties zien er goed uit. Permissieve policies filteren op
-- `organisatie_id = mijn_organisatie_id()`, en `dossiertoegang.sql` legt daar een
-- **restrictieve** laag overheen voor de zichtbaarheid binnen een kantoor — restrictief,
-- dus met EN gecombineerd, dus versmallend. Dat is bewust zo gekozen en staat er ook bij.
--
-- Maar op 5 september bleek dat de migraties niet hoeven te kloppen met de werkelijkheid:
-- de Storage-policies waren via het dashboard aangevuld met drie regels voor de anonieme
-- rol, en niets in de repo kon dat laten zien. Deze query kijkt daarom naar wat er
-- werkelijk staat, niet naar wat er hoort te staan.
--
-- Draaien in de SQL Editor. Leest alleen; verandert niets.

-- ── 1. Tabellen zonder RLS ──────────────────────────────────────────────────
-- Hier hoort niets uit te komen. Een tabel in `public` zonder RLS is via PostgREST
-- bereikbaar voor iedereen die leesrecht heeft.

select 'GEEN RLS' as bevinding, c.relname as tabel
from   pg_class c
join   pg_namespace n on n.oid = c.relnamespace
where  n.nspname = 'public'
  and  c.relkind = 'r'
  and  not c.relrowsecurity
order  by c.relname;

-- ── 2. Alle policies, met hun afscherming ───────────────────────────────────
-- Let op `permissive`: permissieve policies worden met OF gecombineerd, dus één te ruime
-- regel verruimt het geheel. Restrictieve worden met EN gecombineerd en versmallen.
--
-- Kolom `oordeel`:
--   org         filtert op mijn_organisatie_id()  — goed
--   restrictief versmalt, hoeft zelf niet op org te filteren
--   naslag      referentietabellen zonder persoonsgegevens (legal_chunks, situatie_kenmerken)
--   LET OP      permissief én niet op organisatie — dit met de hand nalopen

select tablename                                   as tabel,
       policyname                                  as policy,
       cmd,
       permissive,
       roles,
       case
         when permissive = 'RESTRICTIVE'                         then 'restrictief'
         when coalesce(qual,'') || coalesce(with_check,'')
              like '%mijn_organisatie_id%'                       then 'org'
         when tablename in ('legal_chunks','situatie_kenmerken',
                            'document_templates')                then 'naslag'
         else 'LET OP'
       end                                          as oordeel
from   pg_policies
where  schemaname = 'public'
order  by case when permissive = 'PERMISSIVE'
                and coalesce(qual,'') || coalesce(with_check,'') not like '%mijn_organisatie_id%'
                and tablename not in ('legal_chunks','situatie_kenmerken','document_templates')
               then 0 else 1 end,
         tabel, policy;

-- ── 3. Wat de anonieme rol mag ──────────────────────────────────────────────
-- De anonieme rol heeft bij een nieuw Supabase-project leesrecht op alles in `public`; dat
-- is de standaard bij aanmaak. Er lekt niets — de policies filteren op
-- `mijn_organisatie_id()` en die geeft zonder sessie NULL — maar de bescherming is dan twee
-- toevalligheden dik in plaats van een ontbrekend recht. Dezelfde dunne vorm die B2 bij de
-- backuptabellen beschreef, en de Storage-policies lieten zien dat zoiets stil kan
-- verschuiven. Ingetrokken met `2026-09-05-anon-rechten-intrekken.sql`.
--
-- CORRECTIE 5 september 2026: hier stond dat de melding `permission denied for function
-- mijn_organisatie_id` bij een anonieme aanvraag bewees dát die rol leesrecht had — het
-- verzoek zou tót de policy zijn gekomen. Die gevolgtrekking is onjuist en is ingetrokken;
-- de melding blijft komen nadat álle rechten zijn ingetrokken. De redenering staat in
-- `2026-09-05-anon-rechten-intrekken.sql`, de juiste meting in `anon-rechten-controle.sql`.
--
-- Let ook op wat dit blok niet ziet: `information_schema.role_table_grants` toont geen
-- rechten die via PUBLIC of via rollidmaatschap binnenkomen, en geen kolomrechten.
-- `has_table_privilege` in `anon-rechten-controle.sql` telt die alle drie mee.

select table_name as tabel, grantee as rol, string_agg(privilege_type, ', ' order by privilege_type) as rechten
from   information_schema.role_table_grants
where  table_schema = 'public'
  and  grantee in ('anon','authenticated')
group  by table_name, grantee
order  by grantee, table_name;

-- ── Wat te doen met de uitkomst ─────────────────────────────────────────────
--
-- Blok 1 leeg  → goed.
-- Blok 2       → elke regel met 'LET OP' met de hand nalopen. Er hoort er geen te zijn.
-- Blok 3       → staat `anon` bij tabellen met cliëntgegevens (screeningen, dossiers,
--                gebruikersprofiel, analyse_feiten, organisaties)? Die rechten kunnen weg:
--
--                  revoke all on public.screeningen       from anon;
--                  revoke all on public.dossiers          from anon;
--                  revoke all on public.gebruikersprofiel from anon;
--                  revoke all on public.analyse_feiten    from anon;
--                  revoke all on public.organisaties      from anon;
--
--                De app gebruikt die rechten niet: elke aanroep gebeurt met een ingelogde
--                gebruiker, en die valt onder `authenticated`. Laat `anon` wél staan op
--                legal_chunks en situatie_kenmerken als de inlogpagina die nodig heeft —
--                toets dat vóór het intrekken.
--
--                Daarna weer meten, want intrekken zonder toetsen is hetzelfde soort
--                aanname als die dit hele hoofdstuk begon.
