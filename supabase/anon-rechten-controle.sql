-- Controle: wat mag de anonieme rol werkelijk?
--
-- ── WAAROM DIT NIET VAN BUITEN KAN ──────────────────────────────────────────
--
-- `npm run check:anon` doet de aanvraag zoals een bezoeker hem doet. Dat ziet een lek, maar
-- het kan niet zien of `anon` nog tabelrechten heeft.
--
-- Gemeten op 5 september 2026: nadat alle rechten waren ingetrokken bleef de API op zeven
-- tabellen "permission denied for function mijn_organisatie_id" geven, terwijl
-- `has_table_privilege('anon', 'public.screeningen', 'select')` op dat moment **false** was.
-- Ook rechtstreeks in de database, met `set local role anon`, kwam die functie-melding.
--
-- De reden: policies die zijn aangemaakt zonder `TO`-clausule gelden voor élke rol, dus ook
-- voor anon. Hun USING-expressie hoort daarmee bij de query, en het EXECUTE-recht op een
-- functie in die expressie wordt eerder getoetst dan het SELECT-recht op de tabel. De
-- foutmelding zegt dus niets over het tabelrecht — hij zegt alleen dat er een policy voor
-- alle rollen bestaat.
--
-- Draai dit bestand in de SQL-editor na elke wijziging aan rechten of policies.

-- ── A. Het rechtenbeeld ─────────────────────────────────────────────────────
--
-- `has_table_privilege` telt alles mee: directe rechten, rechten via PUBLIC, en rechten die
-- de rol erft via lidmaatschap van een andere rol. `relacl` laat die laatste twee niet zien,
-- en kolomrechten (`pg_attribute.attacl`) staan er evenmin in — die overleven een
-- `revoke ... on table` ook niet, dus ze staan hier apart.

select c.relname                                        as tabel,
       has_table_privilege('anon',          c.oid, 'select') as anon_select,
       has_table_privilege('authenticated', c.oid, 'select') as auth_select,
       c.relrowsecurity                                 as rls_aan,
       (select string_agg(a.attname, ', ')
          from   pg_attribute a
         where  a.attrelid = c.oid
           and  a.attacl::text like '%anon=%')          as kolomrechten_anon
from   pg_class c
join   pg_namespace n on n.oid = c.relnamespace
where  n.nspname = 'public'
  and  c.relkind = 'r'
order  by anon_select desc, c.relname;

-- Verwacht: `anon_select` overal false, `kolomrechten_anon` overal leeg, `rls_aan` overal
-- true. Eén regel met anon_select = true is een bevinding, ook als er niets uit lekt.

-- ── B. Erft anon iets via een andere rol? ───────────────────────────────────

select r.rolname as anon_is_lid_van
from   pg_roles r
where  pg_has_role('anon', r.oid, 'member')
  and  r.rolname <> 'anon';

-- Verwacht: leeg.

-- ── C. Welke policies gelden voor alle rollen? ──────────────────────────────
--
-- `{-}` betekent: geen TO-clausule, dus élke rol — ook anon. Dat is niet fout (de USING
-- houdt tegen), maar het is breder dan nodig, en het is de reden dat A hierboven bestaat.

select c.relname                              as tabel,
       p.polname                              as policy,
       case p.polpermissive when true then 'PERMISSIEF (OR — verruimt)'
                            else 'RESTRICTIEF (AND — versmalt)' end as soort,
       p.polroles::regrole[]                  as rollen,
       pg_get_expr(p.polqual, p.polrelid)     as using_expressie
from   pg_policy p
join   pg_class     c on c.oid = p.polrelid
join   pg_namespace n on n.oid = c.relnamespace
where  n.nspname = 'public'
order  by (p.polroles = '{0}') desc, c.relname, p.polname;

-- ── D. Staat elke policy ook in de repo? ────────────────────────────────────
--
-- Dit is de controle die geen enkel script kan doen: neem de namen uit C en zoek ze op in
-- `supabase/*.sql`. Een policy die daar niet in voorkomt is in het dashboard aangeklikt en
-- staat buiten elke vorm van versiebeheer en toetsing — dezelfde stille vorm als de
-- Storage-policies van 5 september 2026 (`docs/incident-2026-09-05-storage.md`).
--
--   grep -rn "<policynaam>" supabase/
--
-- Let op de richting van het risico: permissieve policies worden met OR gecombineerd. Eén
-- bijgeklikte permissieve policy verruimt, en er is niets aan te zien.
