-- 2026-08-29 — api_verbruik: wat elke Claude-aanroep kostte en hoe lang hij duurde
--
-- Aanleiding: op de vraag "wat kost een vraag" was geen antwoord te geven. Anthropic
-- stuurt bij élk antwoord een `usage`-blok mee met precieze tokentellingen, en alle
-- drie de endpoints gooiden dat weg. De kolom "API-kosten per screening" op de
-- beheerpagina stond er als verzonnen getal omdat er geen bron was.
--
-- Eén regel per Claude-aanroep. Een analyse doet er vier tot zes, een adviesvraag met
-- zoekwerk tot zes.
--
-- ── DEZELFDE DRIE REGELS ALS analyse_feiten ─────────────────────────────────
--
--   1. GEEN CASCADE. screening_id is een gewone uuid zonder foreign key. Een verwijderd
--      dossier mag de kostenhistorie niet meenemen.
--   2. GEEN INHOUD. Geen prompts, geen antwoorden, geen zoektermen. Alleen tellingen en
--      een fase-aanduiding uit een vaste lijst. Een zoekterm is vrije tekst van de
--      gebruiker en kan een cliëntnaam bevatten.
--   3. HET TELWERK STAAT NIET HIER. De kostenberekening zit in src/api/kosten.js met
--      tests; deze tabel bewaart alleen de uitkomst.
--
-- Zie docs/avg-verwerkersovereenkomst.md — deze verwerking valt onder dezelfde clausule
-- als analyse_feiten ("verbruikte verwerkingscapaciteit").

begin;

create table if not exists public.api_verbruik (
  id             uuid primary key default gen_random_uuid(),

  -- Wie. organisatie_id kent geen bewaartermijn (een kantoor is geen natuurlijk
  -- persoon); gebruiker_id wél.
  organisatie_id uuid,
  gebruiker_id   uuid,
  screening_id   uuid,          -- losse uuid, geen foreign key

  -- Wat. `fase` is de aanroep binnen het endpoint: structuur, bevindingen, cross_doc,
  -- consolidatie, zoekronde, afronding, clausule, concept, … Vrij tekstveld maar met
  -- een vaste woordenlijst in src/api/kosten.js — vrije tekst zou hier alsnog een
  -- zoekterm kunnen worden.
  endpoint       text not null,
  fase           text,
  model          text,

  -- Verbruik, exact zoals Anthropic het teruggeeft
  input_tokens         integer not null default 0,
  output_tokens        integer not null default 0,
  cache_lees_tokens    integer not null default 0,
  cache_schrijf_tokens integer not null default 0,

  -- Uitkomst van de berekening in src/api/kosten.js. Opgeslagen en niet ter plekke
  -- berekend: prijzen veranderen, en dan zou een oude regel met de nieuwe prijs
  -- worden herberekend — dat is geen historie meer.
  kosten_usd     numeric(10,6),

  -- Tijd. Het VERSCHIL tussen deze twee is de bruikbare maat: veel tijd vóór het
  -- eerste token betekent dat het model nadenkt (kortere prompt helpt), veel tijd
  -- erna dat het schrijft (korter antwoord helpt). Zonder dat onderscheid optimaliseer
  -- je op goed geluk.
  duur_ms          integer,
  eerste_token_ms  integer,

  -- Een mislukte aanroep is juist wat je wilt zien. De klacht van 28 augustus 2026 —
  -- "resultaat verschijnt half en verdwijnt dan" — was een timeout waarvan nergens een
  -- spoor terug te vinden was.
  geslaagd       boolean not null default true,
  foutsoort      text,          -- 'timeout' | 'http' | 'afgebroken' | 'onbekend'

  gestart_op     timestamptz not null default now()
);

comment on table public.api_verbruik is
  'Eén regel per Claude-aanroep: tokens, kosten en duur. Geen prompts of antwoorden. '
  'Zie docs/avg-verwerkersovereenkomst.md.';

create index if not exists api_verbruik_org_datum_idx
  on public.api_verbruik (organisatie_id, gestart_op desc);
create index if not exists api_verbruik_gebruiker_idx
  on public.api_verbruik (gebruiker_id, gestart_op desc) where gebruiker_id is not null;
create index if not exists api_verbruik_fase_idx
  on public.api_verbruik (endpoint, fase, gestart_op desc);
-- Voor "de tien traagste aanroepen": zonder deze index scant dat de hele tabel.
create index if not exists api_verbruik_duur_idx
  on public.api_verbruik (duur_ms desc nulls last);


-- ── Toegang ─────────────────────────────────────────────────────────────────
alter table public.api_verbruik enable row level security;

-- Drie niveaus, afgedwongen in de policy en niet in de knop:
--   platform    alles, over alle kantoren heen
--   admin       het eigen kantoor, inclusief per gebruiker
--   gebruiker   alleen zichzelf
--
-- Die laatste regel is er niet voor niets: zonder de eigen-regel-clausule zou een
-- mediator het verbruik van collega's kunnen opvragen door het verzoek na te bouwen.
-- Eigen functie en NIET mijn_rol_vereist_mfa() hergebruiken. Die geeft vandaag
-- hetzelfde antwoord — beide komen neer op rol = 'admin' — maar ze beantwoorden
-- verschillende vragen. Wordt MFA ooit ook voor mediators verplicht, dan verandert
-- met die ene wijziging stilzwijgend wie het verbruik van collega's mag inzien.
-- Twee vragen, twee functies.
create or replace function public.is_kantoorbeheerder()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from gebruikersprofiel
                 where id = auth.uid() and rol = 'admin');
$$;

drop policy if exists "verbruik: lezen" on public.api_verbruik;
create policy "verbruik: lezen"
  on public.api_verbruik for select
  using (
    is_platform()
    or (organisatie_id = mijn_organisatie_id() and is_kantoorbeheerder())
    or gebruiker_id = auth.uid()
  );

-- Schrijven doet de server met de service role; die gaat langs RLS heen. Er is bewust
-- geen insert-policy voor gewone gebruikers: verbruikscijfers die de browser mag
-- schrijven zijn geen verbruikscijfers.


-- ── Bewaartermijn ───────────────────────────────────────────────────────────
-- Zelfde regel als analyse_feiten: na 18 maanden is een regel niet meer tot een
-- persoon herleidbaar. Het account blijft; wat veroudert is de verwijzing op elke
-- afzonderlijke regel, op basis van de leeftijd van díé regel.
create or replace function public.anonimiseer_oud_verbruik(maanden integer default 18)
returns integer
language sql
security definer
set search_path = public
as $$
  with geraakt as (
    update api_verbruik set gebruiker_id = null
     where gebruiker_id is not null
       and gestart_op < now() - (maanden || ' months')::interval
    returning 1)
  select count(*)::integer from geraakt;
$$;

-- Vertrekt iemand, dan gaat de verwijzing direct weg.
create or replace function public.wis_gebruiker_uit_verbruik()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update api_verbruik set gebruiker_id = null where gebruiker_id = old.id;
  return old;
end;
$$;

drop trigger if exists gebruikersprofiel_wis_verbruik on public.gebruikersprofiel;
create trigger gebruikersprofiel_wis_verbruik
  before delete on public.gebruikersprofiel
  for each row execute function public.wis_gebruiker_uit_verbruik();

commit;


-- ── Periodiek draaien ───────────────────────────────────────────────────────
--   select anonimiseer_oude_feiten();     -- analyse_feiten
--   select anonimiseer_oud_verbruik();    -- deze tabel
--
-- ── Terugdraaien ────────────────────────────────────────────────────────────
--   begin;
--   drop trigger if exists gebruikersprofiel_wis_verbruik on public.gebruikersprofiel;
--   drop function if exists public.wis_gebruiker_uit_verbruik();
--   drop function if exists public.anonimiseer_oud_verbruik(integer);
--   drop table if exists public.api_verbruik;   -- LET OP: historie is dan weg
--   commit;
