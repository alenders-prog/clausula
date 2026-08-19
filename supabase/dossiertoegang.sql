-- Uitnodigingen: vastleggen vóór wie ze bedoeld zijn en wat de nieuwe collega ziet.
--
--   1. e-mailadres en dossiertoegang op de uitnodiging
--   2. valideer_uitnodiging geeft het adres terug (zodat het formulier het invult)
--   3. de trigger controleert het adres en neemt de toegangskeuze over
--   4. de afscherming per eigenaar aanzetten
--
-- VOLGORDE IS BELANGRIJK. Stap 1 t/m 3 mogen meteen; ze veranderen niets aan wie
-- wat ziet. Stap 4 zet de afscherming daadwerkelijk aan en mag pas ná de deploy
-- van de bijbehorende app-versie: die vult organisatie_id en gebruiker_id op
-- nieuwe screenings, en zonder die velden zou stap 4 records onzichtbaar maken
-- voor iedereen behalve beheerders.
--
-- Controleer vóór stap 4:
--   select count(*) filter (where gebruiker_id is null) as zonder_eigenaar
--   from public.screeningen;
-- Staat daar iets anders dan 0, wijs die rijen dan eerst een eigenaar toe.


-- ── Stap 1: adres en toegangskeuze vastleggen op de uitnodiging ──────────────
-- Zonder e-mailadres draagt een uitnodiging alleen de organisatie en de rol.
-- Wie de link onderschept, kan zich dan met een willekeurig adres aanmelden —
-- de domeincontrole in api/uitnodigen.js kijkt immers alleen naar wat de
-- beheerder intypt, niet naar wat er bij het aanmelden wordt ingevuld.
alter table public.uitnodigingen
  add column if not exists ziet_alle_dossiers boolean not null default false,
  add column if not exists email text;


-- ── Stap 2: het adres teruggeven aan het aanmeldformulier ───────────────────
-- Return type verandert, dus eerst weg. De functie is bewust publiek: ze wordt
-- aangeroepen door iemand die nog geen account heeft. Het token ís het geheim;
-- wie dat heeft, heeft de mail gekregen en kent het adres al.
drop function if exists public.valideer_uitnodiging(text);

create function public.valideer_uitnodiging(p_token text)
returns table(organisatie_id uuid, kantoor_naam text, rol text, email text)
language plpgsql security definer set search_path = public
as $$
begin
  return query
  select u.organisatie_id, o.naam, u.rol, u.email
  from   uitnodigingen u
  join   organisaties  o on o.id = u.organisatie_id
  where  u.token       = p_token
    and  u.gebruikt_op is null
    and  u.vervalt_op  > now();
end;
$$;


-- ── Stap 3: de trigger controleert het adres en neemt de keuze over ─────────
-- Zelfde functie als de tokenbeveiliging, met de adrescontrole en één regel
-- extra in de INSERT.
create or replace function public._maak_gebruikersprofiel()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token text;
  v_uitn  public.uitnodigingen%rowtype;
  v_rol   text;
begin
  v_token := new.raw_user_meta_data->>'uitnodiging_token';
  if v_token is null or v_token = '' then
    return new;  -- geen token → geen profiel → RLS geeft nergens toegang
  end if;

  -- Claimen en valideren in één statement: zo is een token nooit twee keer
  -- bruikbaar, ook niet bij twee gelijktijdige aanmeldingen.
  update public.uitnodigingen
  set    gebruikt_op = now()
  where  token = v_token
    and  gebruikt_op is null
    and  (vervalt_op is null or vervalt_op > now())
  returning * into v_uitn;

  if not found then
    return new;  -- ongeldig, verlopen of al gebruikt
  end if;

  -- De uitnodiging geldt voor één adres. Een exception in plaats van een stille
  -- weigering: die draait de hele transactie terug, dus ook het claimen
  -- hierboven — de uitnodiging blijft bruikbaar voor wie hem wél kreeg.
  -- Uitnodigingen van vóór deze migratie hebben geen adres; die slaan we over.
  if v_uitn.email is not null
     and lower(new.email) <> lower(v_uitn.email) then
    raise exception 'Deze uitnodiging is bedoeld voor een ander e-mailadres'
      using errcode = 'check_violation';
  end if;

  -- Rol komt uit de uitnodiging (door een beheerder gezet), nooit uit de aanmelding.
  v_rol := coalesce(v_uitn.rol, 'gebruiker');

  insert into public.gebruikersprofiel (id, organisatie_id, naam, rol, ziet_alle_dossiers)
  values (
    new.id,
    v_uitn.organisatie_id,
    coalesce(new.raw_user_meta_data->>'naam', split_part(new.email, '@', 1)),
    v_rol,
    -- Beheerders zien altijd alles; voor mediators telt de keuze op de uitnodiging.
    (v_rol = 'admin') or coalesce(v_uitn.ziet_alle_dossiers, false)
  )
  on conflict (id) do nothing;

  if v_rol = 'admin' then
    update public.organisaties
    set    domein = lower(split_part(new.email, '@', 2))
    where  id = v_uitn.organisatie_id and (domein is null or domein = '');
  end if;

  return new;
end;
$function$;


-- ── Stap 4: de afscherming aanzetten (PAS NA DE DEPLOY) ─────────────────────
-- RESTRICTIVE is hier het hele punt: gewone policies worden met OF gecombineerd,
-- dus een extra permissieve regel zou de toegang juist verruimen. Restrictieve
-- policies worden met EN gecombineerd en beperken dus wél. De bestaande
-- organisatiefilters blijven gelden — een mediator komt nooit buiten zijn kantoor.

create policy "dossier: eigen tenzij toegestaan"
on public.dossiers as restrictive for all to authenticated
using (
  gebruiker_id = auth.uid()
  or exists (
    select 1 from public.gebruikersprofiel g
    where g.id = auth.uid()
      and (g.rol = 'admin' or g.ziet_alle_dossiers)
  )
);

create policy "screening: eigen tenzij toegestaan"
on public.screeningen as restrictive for all to authenticated
using (
  gebruiker_id = auth.uid()
  -- Vangnet voor screenings die (nog) geen eigen gebruiker_id hebben maar wel
  -- aan een dossier hangen: dan telt de eigenaar van het dossier.
  or exists (
    select 1 from public.dossiers d
    where d.id = screeningen.dossier_id
      and d.gebruiker_id = auth.uid()
  )
  or exists (
    select 1 from public.gebruikersprofiel g
    where g.id = auth.uid()
      and (g.rol = 'admin' or g.ziet_alle_dossiers)
  )
);


-- ── Controle achteraf ────────────────────────────────────────────────────────
-- Verwacht: vier permissieve policies (organisatie) + twee restrictieve (eigenaar).
-- select tablename, policyname, permissive, cmd
-- from pg_policies
-- where schemaname = 'public' and tablename in ('dossiers', 'screeningen')
-- order by tablename, permissive desc;
