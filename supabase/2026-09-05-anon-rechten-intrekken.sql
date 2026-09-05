-- 2026-09-05 — de anonieme rol heeft geen tabeltoegang nodig
--
-- ── WAAROM ──────────────────────────────────────────────────────────────────
--
-- Gemeten op 5 september: een anonieme aanvraag op screeningen, dossiers,
-- gebruikersprofiel, analyse_feiten, organisaties, api_verbruik en uitnodigingen komt tót
-- de policy en struikelt daar op `permission denied for function mijn_organisatie_id`.
--
-- Die melding zegt iets belangrijks: de anonieme rol **heeft leesrecht op die tabellen**.
-- Dat is de Supabase-standaard — bij aanmaak krijgen `anon` en `authenticated` alle rechten
-- op `public`, en RLS doet de rest. Er lekt niets, want de functie is niet uitvoerbaar en
-- zou hij dat wél zijn dan geeft hij NULL en levert het filter geen rijen.
--
-- Maar dan is de muur twee toevalligheden dik waar hij een ontbrekend recht dik kan zijn.
-- En elke tabel is daarmee één policy-fout verwijderd van openstaan. Dat is geen
-- theoretisch bezwaar: diezelfde ochtend bleek de documenten-bucket open te staan doordat
-- er drie policies naast de juiste waren geklikt.
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
--   3. Draai `node scripts/anon-rechten-check.mjs` — die hoort te melden dat de
--      foutmelding is veranderd van "permission denied for function mijn_organisatie_id"
--      naar "permission denied for table". Dát is het bewijs dat het verzoek nu al vóór
--      de policy strandt.
--
-- Gaat er iets stuk, dan is dit de terugweg:
--
--   grant select, insert, update, delete on public.<tabel> to anon;

-- ── STAP 2: de naslagtabellen ───────────────────────────────────────────────
--
-- Pas uitvoeren als stap 1 goed is bevonden. Deze bevatten geen persoonsgegevens, dus de
-- winst is kleiner — maar `anon` heeft er evenmin iets te zoeken.

-- begin;
-- revoke all on public.legal_chunks       from anon;
-- revoke all on public.situatie_kenmerken from anon;
-- revoke all on public.document_templates from anon;
-- revoke all on public.legal_sources      from anon;
-- revoke all on public.example_chunks     from anon;
-- revoke all on public.example_documents  from anon;
-- commit;

-- ── LET OP: nieuwe tabellen krijgen de rechten opnieuw ──────────────────────
--
-- Supabase zet standaardrechten klaar voor toekomstige tabellen in `public`. Zonder de
-- regel hieronder krijgt elke nieuwe tabel weer volledige rechten voor `anon`, en dan is
-- dit werk over een maand ongedaan gemaakt zonder dat iemand het merkt — dezelfde stille
-- vorm als de dashboardwijziging bij Storage.

-- alter default privileges in schema public revoke all on tables from anon;
