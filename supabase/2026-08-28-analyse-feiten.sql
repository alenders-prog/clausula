-- 2026-08-28 — analyse_feiten: tellingen die blijven staan als het dossier verdwijnt
--
-- Het dashboard rekent live uit `dossiers` + `screeningen`. Verwijdert iemand een
-- dossier, dan gaan de screeningen mee en zakken de cijfers. Voor "hoe staan we ervoor"
-- klopt dat; voor "wat is er in totaal gedaan" niet. Doortellen na verwijdering kan
-- alleen als er iets LOSSTAANDS wordt bewaard.
--
-- ── DRIE REGELS DIE DIT BESTAND DRAGEN ──────────────────────────────────────
--
--   1. GEEN CASCADE. Er staat nergens `references screeningen(id) on delete cascade`;
--      de sleutels zijn gewone uuid's. Zet die referentie er ooit alsnog bij, dan
--      verdwijnt de historie precies zoals voorheen en is dit bestand zinloos.
--
--   2. GEEN INHOUD. Geen issue-titels, geen passages, geen namen, geen bestandsnamen.
--      Die dragen letterlijke citaten uit cliëntdocumenten — op 26 augustus 2026 bleek
--      nog dat een issue-titel een rekeningnummer meedroeg. Alleen tellingen.
--      Dat is niet alleen netjes: het is de voorwaarde waaronder deze regels ná een
--      verwijderverzoek mogen blijven staan.
--      GEVOLG: "top terugkerende verbeterpunten" kan hier niet uit komen — dat vraagt
--      titels. Dat blok blijft live berekend per kantoor uit bestaande screeningen.
--
--   3. HET TELWERK STAAT NIET HIER. Deze tabel wordt gevuld vanuit de browser met
--      src/dashboard/feiten.js, dat de al geteste aggregatie uit statistieken.js
--      gebruikt. Bewust géén trigger met jsonb-ontleding: dat zou dezelfde telling een
--      tweede keer implementeren, in een taal waar de unittests niet bij kunnen.
--      Ontbrekende regels worden bijgewerkt door scripts/feiten-sync.mjs — dat script
--      is tegelijk de backfill en de reparatie.
--
-- Lees `docs/avg-verwerkersovereenkomst.md` vóór uitrol: `gebruiker_id` verwijst naar
-- een persoon, en die verwerking hoort in de verwerkersovereenkomst te staan.

begin;

create table if not exists public.analyse_feiten (
  id               uuid primary key default gen_random_uuid(),

  -- Wie. organisatie_id kent geen bewaartermijn (een kantoor is geen natuurlijk
  -- persoon); gebruiker_id wél — zie anonimiseer_oude_feiten() onderaan.
  organisatie_id   uuid,
  gebruiker_id     uuid,

  -- Waar het bij hoorde. Gewone uuid's, geen foreign key: ze blijven staan als het
  -- dossier of de screening is verwijderd en verwijzen dan nergens meer naar.
  dossier_sleutel  uuid,
  screening_id     uuid not null unique,
  versie_nr        integer,

  doc_type         text,
  geanalyseerd_op  timestamptz not null default now(),

  issues_totaal    integer not null default 0,
  hoog             integer not null default 0,
  midden           integer not null default 0,
  laag             integer not null default 0,
  afgevinkt        integer not null default 0,
  genegeerd        integer not null default 0,

  -- {"juridisch":{"h":1,"m":4,"l":1}, ...} — de vijf dimensies, geen MfN
  per_categorie    jsonb not null default '{}'::jsonb,

  -- MfN staat apart: eigen schaal, eigen noemer per documenttype
  mfn_totaal       integer,
  mfn_aanwezig     integer,
  mfn_onvolledig   integer,
  mfn_ontbreekt    integer,
  mfn_extra        integer,

  score            integer,
  bijgewerkt_op    timestamptz not null default now()
);

comment on table public.analyse_feiten is
  'Append-only tellingen per geanalyseerd document. Geen inhoud, geen cascade: blijft '
  'staan als dossier of screening wordt verwijderd. Zie docs/avg-verwerkersovereenkomst.md.';

create index if not exists analyse_feiten_org_datum_idx
  on public.analyse_feiten (organisatie_id, geanalyseerd_op desc);
create index if not exists analyse_feiten_gebruiker_idx
  on public.analyse_feiten (gebruiker_id) where gebruiker_id is not null;
create index if not exists analyse_feiten_dossier_idx
  on public.analyse_feiten (dossier_sleutel, versie_nr);


-- ── Toegang ─────────────────────────────────────────────────────────────────
alter table public.analyse_feiten enable row level security;

-- Rol 'platform' ziet alles: dat is de leverancier, niet een kantoor. Nieuw naast
-- 'admin' (kantoorbeheerder) en 'gebruiker' (mediator).
create or replace function public.is_platform()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from gebruikersprofiel
                 where id = auth.uid() and rol = 'platform');
$$;

drop policy if exists "feiten: lezen" on public.analyse_feiten;
create policy "feiten: lezen"
  on public.analyse_feiten for select
  using (is_platform() or organisatie_id = mijn_organisatie_id());

-- Schrijven mag alleen voor de eigen organisatie, en alleen op eigen naam. Zonder de
-- tweede voorwaarde kan iemand verbruik op naam van een collega wegschrijven.
drop policy if exists "feiten: schrijven" on public.analyse_feiten;
create policy "feiten: schrijven"
  on public.analyse_feiten for insert
  with check (organisatie_id = mijn_organisatie_id() and gebruiker_id = auth.uid());

drop policy if exists "feiten: bijwerken" on public.analyse_feiten;
create policy "feiten: bijwerken"
  on public.analyse_feiten for update
  using (organisatie_id = mijn_organisatie_id());

-- Verwijderen kan niemand. Dat is het punt van de tabel: hij telt door, ook als het
-- dossier weg is. Opruimen gebeurt uitsluitend via de service role.


-- ── Bewaartermijn ───────────────────────────────────────────────────────────
-- Na 18 maanden is een regel niet meer tot een persoon herleidbaar. Het ACCOUNT blijft
-- bestaan; wat veroudert is de verwijzing op elke afzonderlijke regel, op basis van de
-- leeftijd van díé regel. Een gebruiker die drie jaar meedraait houdt dus achttien
-- maanden aan toerekenbare historie, en daarvoor alleen tellingen.
--
-- organisatie_id blijft staan: een kantoor is geen natuurlijk persoon, dus daar geldt
-- geen bewaartermijn. De statistiek per organisatie blijft daarmee volledig intact.
--
-- Achttien maanden is een KEUZE, geen norm. De motivering hoort in het
-- verwerkingsregister — een termijn zonder onderbouwing is bij een controle net zo
-- lastig als geen termijn.
create or replace function public.anonimiseer_oude_feiten(maanden integer default 18)
returns integer
language sql
security definer
set search_path = public
as $$
  with geraakt as (
    update analyse_feiten
       set gebruiker_id = null, bijgewerkt_op = now()
     where gebruiker_id is not null
       and geanalyseerd_op < now() - (maanden || ' months')::interval
    returning 1)
  select count(*)::integer from geraakt;
$$;

comment on function public.anonimiseer_oude_feiten(integer) is
  'Verwijdert de gebruikersverwijzing op feitregels ouder dan N maanden. Tellingen '
  'blijven staan. Periodiek draaien (pg_cron of Vercel-cron).';

-- Vertrekt iemand, dan gaat de verwijzing DIRECT weg — niet pas na achttien maanden.
-- Dat honoreert het verwijderverzoek terwijl de tellingen blijven staan.
create or replace function public.wis_gebruiker_uit_feiten()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update analyse_feiten
     set gebruiker_id = null, bijgewerkt_op = now()
   where gebruiker_id = old.id;
  return old;
end;
$$;

drop trigger if exists gebruikersprofiel_wis_feiten on public.gebruikersprofiel;
create trigger gebruikersprofiel_wis_feiten
  before delete on public.gebruikersprofiel
  for each row execute function public.wis_gebruiker_uit_feiten();

commit;


-- ── Na het draaien ──────────────────────────────────────────────────────────
--
--   node scripts/feiten-sync.mjs          bestaande screeningen inlezen (backfill)
--   node scripts/feiten-controle.mjs      narekenen of de tellingen nog kloppen
--
-- Plan `select anonimiseer_oude_feiten();` periodiek in — maandelijks volstaat.
--
-- ── Terugdraaien ────────────────────────────────────────────────────────────
--
--   begin;
--   drop trigger if exists gebruikersprofiel_wis_feiten on public.gebruikersprofiel;
--   drop function if exists public.wis_gebruiker_uit_feiten();
--   drop function if exists public.anonimiseer_oude_feiten(integer);
--   drop table if exists public.analyse_feiten;   -- LET OP: historie is dan weg
--   drop function if exists public.is_platform();
--   commit;
