-- 2026-09-05 — de anonieme rol heeft geen tabeltoegang nodig
--
-- ── WAAROM ──────────────────────────────────────────────────────────────────
--
-- De anonieme rol heeft leesrecht op de tabellen in `public`. Dat is de Supabase-standaard:
-- bij aanmaak krijgen `anon` en `authenticated` alle rechten op dat schema, en RLS doet de
-- rest. Er lekt niets, want de policies filteren op `mijn_organisatie_id()` en die geeft
-- zonder sessie NULL.
--
-- Maar dan is de muur twee toevalligheden dik waar hij een ontbrekend recht dik kan zijn.
-- En elke tabel is daarmee één policy-fout verwijderd van openstaan. Dat is geen
-- theoretisch bezwaar: diezelfde ochtend bleek de documenten-bucket open te staan doordat
-- er drie policies naast de juiste waren geklikt.
--
-- ── CORRECTIE, 5 SEPTEMBER 2026, NA UITVOERING ──────────────────────────────
--
-- Hier stond dat de melding `permission denied for function mijn_organisatie_id` bewees dat
-- anon leesrecht op die tabellen had: het verzoek zou tót de policy zijn gekomen. **Die
-- gevolgtrekking is onjuist en is ingetrokken.**
--
-- Ná het intrekken hieronder gaf `has_table_privilege('anon','public.screeningen','select')`
-- false, terwijl diezelfde melding bleef komen — ook rechtstreeks in de database met
-- `set local role anon`. Het EXECUTE-recht op een functie in een policy-expressie wordt
-- eerder getoetst dan het SELECT-recht op de tabel, dus de melding zegt niets over dat
-- tabelrecht. Hij zegt alleen dat er een policy bestaat die voor élke rol geldt (aangemaakt
-- zonder `TO`-clausule) en dat anon de functie daarin niet mag aanroepen.
--
-- Waar een policy wél `TO authenticated` staat — de verdeling-tabellen in
-- `007_verdeling_rls.sql` — geldt er voor anon geen enkele policy, en komt het tabelrecht
-- als eerste aan de beurt: `permission denied for table`. Dát is het verschil tussen de
-- zeven en de drie hieronder, en niet een verschil in rechten.
--
-- De reden om in te trekken blijft staan; alleen het bewijs eronder was verkeerd gelezen.
-- Wat er nu werkelijk staat, meet je met `supabase/anon-rechten-controle.sql`.
--
-- ── DAT DIT KAN, IS NAGEKEKEN ───────────────────────────────────────────────
--
-- Geen enkele pagina vóór het inloggen bevraagt een tabel:
--
--   login.html            geen enkele .from() of .rpc() — alleen auth
--   registreer.html       .from('gebruikersprofiel'), maar binnen `if (session)`,
--                         dus de gebruiker is dan al ingelogd → authenticated
--   wachtwoord-*.html     geen enkele .from()
--   assistent-mobiel.html dossiers en screeningen, na inloggen
--
-- De uitnodigingsstroom loopt via `api/registreer.js` en de trigger op `auth.users`, beide
-- server-side met de service-role. Die raken deze rechten niet.
--
-- ── VOLGORDE ────────────────────────────────────────────────────────────────
--
-- In twee stappen, met een controle ertussen. Alles in één keer intrekken en dán pas kijken
-- is precies de aanname die dit hoofdstuk begon — en als het misgaat, gaat het mis bij het
-- inloggen, de vervelendste plek die er is.

-- ── STAP 1: de tabellen met cliëntgegevens ──────────────────────────────────

begin;

revoke all on public.screeningen        from anon;
revoke all on public.dossiers           from anon;
revoke all on public.gebruikersprofiel  from anon;
revoke all on public.analyse_feiten     from anon;
revoke all on public.api_verbruik       from anon;
revoke all on public.uitnodigingen      from anon;
revoke all on public.organisaties       from anon;

revoke all on public.verdeling_posten             from anon;
revoke all on public.verdeling_overzicht_totalen  from anon;
revoke all on public.zorgverdeling_dagdelen       from anon;

commit;

-- ── CONTROLE VÓÓR STAP 2 ────────────────────────────────────────────────────
--
-- Doe dit nu, niet later:
--
--   1. Log uit en log opnieuw in.
--   2. Open een dossier en bekijk een opgeslagen analyse.
--   3. Draai `supabase/anon-rechten-controle.sql` in de SQL-editor. Deel A hoort
--      `anon_select = false` te geven op elke tabel. Dát is het bewijs, en het is het
--      enige bewijs dat er is.
--   4. `npm run check:anon` blijft nuttig — hij ziet een lek — maar hij kan het intrekken
--      niet aantonen. Op de zeven tabellen met een policy voor alle rollen meldt hij
--      "onbeslist", vóór én na. Zie de correctie bovenaan dit bestand.
--
-- Gaat er iets stuk, dan is dit de terugweg:
--
--   grant select, insert, update, delete on public.<tabel> to anon;

-- ── STAP 2: de naslagtabellen ───────────────────────────────────────────────
--
-- STAP 1 IS UITGEVOERD EN GOED BEVONDEN op 5 september 2026: `has_table_privilege('anon',
-- <tabel>, 'select')` gaf false op alle tien, zonder kolomrechten en zonder overerving.
-- Inloggen, een dossier openen en een opgeslagen analyse bekijken werkten ongewijzigd.
--
-- Deze tabellen bevatten geen persoonsgegevens, dus de winst is kleiner — maar `anon` heeft
-- er evenmin iets te zoeken.
--
-- DAT DIT KAN, IS NAGEKEKEN. Ze worden op drie plekken gelezen, en geen daarvan is anoniem:
--
--   api/analyseer.js:497, api/ai-assistent.js:745   service_role — raakt deze rechten niet
--   index.html:4276 (situatie_kenmerken)            in de analyse-flow, dus na inloggen
--   index.html:6294-6320, src/kennisbank/zoek.js    in de assistent-flow, idem
--
-- Alle browserqueries lopen dus als `authenticated`, en die rechten blijven staan.
-- `api/_auth.js` gebruikt de anon-sleutel wél, maar uitsluitend tegen `/auth/v1/user` —
-- dat is geen tabel.

begin;
revoke all on public.legal_chunks       from anon;
revoke all on public.situatie_kenmerken from anon;
revoke all on public.document_templates from anon;
revoke all on public.legal_sources      from anon;
revoke all on public.example_chunks     from anon;
revoke all on public.example_documents  from anon;
commit;

-- ── LET OP: nieuwe tabellen krijgen de rechten opnieuw ──────────────────────
--
-- Supabase zet standaardrechten klaar voor toekomstige tabellen in `public`. Zonder de
-- regel hieronder krijgt elke nieuwe tabel weer volledige rechten voor `anon`, en dan is
-- dit werk over een maand ongedaan gemaakt zonder dat iemand het merkt — dezelfde stille
-- vorm als de dashboardwijziging bij Storage.
--
-- Let op: standaardrechten hangen aan de rol die de tabel aanmaakt. De regel hieronder
-- geldt voor de rol die hem uitvoert (in de SQL-editor: `postgres`). Maakt iets later een
-- tabel aan als een andere rol, dan valt die erbuiten — zichtbaar te maken met:
--
--   select defaclrole::regrole, defaclnamespace::regnamespace, defaclacl
--   from   pg_default_acl;

alter default privileges in schema public revoke all on tables from anon;
