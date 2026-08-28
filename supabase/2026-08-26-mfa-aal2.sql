-- 2026-08-26 — tweefactorauthenticatie afdwingen in de database, niet in de knop
--
-- Aanleiding: de app vraagt beheerders sinds vandaag om een tweede factor. Zolang die
-- eis alleen in de frontend zit, is het geen maatregel maar een suggestie: wie het
-- verzoek nabouwt met een gewoon toegangstoken komt er alsnog langs. Artikel 32 AVG
-- vraagt een passende maatregel, en een controle die met een curl-opdracht te omzeilen
-- is, is dat niet.
--
-- Wat Supabase meegeeft: elk JWT draagt een claim `aal` — 'aal1' na alleen een
-- wachtwoord, 'aal2' nadat een TOTP-challenge is doorlopen. Daar is in een policy op
-- te toetsen.
--
--   AANPAK: alleen áánscherpen waar de rol dat vraagt.
--   Een mediator zonder factor houdt aal1 en moet gewoon kunnen werken; zou de policy
--   aal2 van iedereen eisen, dan sluit deze migratie het hele kantoor buiten op de dag
--   dat hij draait. Vandaar de voorwaarde op de rol.
--
--   VOLGORDE VAN UITROLLEN — deze migratie draait als LAATSTE.
--   1. De app staat live met het tabblad Beveiliging.
--   2. Elke beheerder heeft een authenticator ingesteld (te controleren met de query
--      onderaan dit bestand).
--   3. Pas dan dit script draaien.
--   Andersom sluit u uzelf buiten: een beheerder zonder factor kan na deze migratie
--   geen dossiers meer lezen, ook niet om er een in te stellen.
--
--   RAAKT DIT HET TESTACCOUNT? Nee. Nagekeken op 26-08-2026: test@dalstein.nl heeft
--   geen MFA-factor en geen rij in gebruikersprofiel, dus mijn_rol_vereist_mfa() geeft
--   false en deze policies laten het met rust. De eval komt bovendien niet bij dossiers
--   of screeningen — /api/analyseer leest alleen document_templates en legal_chunks.
--
--   Let op als de eval ooit een screening gaat opslaan: dan botst hij hierop, en de
--   melding is een lege resultaatset of een permissiefout. Dat ziet eruit als een
--   promptregressie. Zie de waarschuwing in CLAUDE.md over de verlopen TEST_JWT_TOKEN —
--   precies dezelfde valkuil, andere oorzaak.

begin;

-- ── Hulpfunctie: heeft deze sessie een tweede factor doorlopen? ──────────────
-- STABLE en niet VOLATILE: de claim verandert niet binnen één statement, en zo mag
-- de planner hem één keer uitrekenen in plaats van per rij.
create or replace function public.sessie_is_aal2()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

comment on function public.sessie_is_aal2() is
  'True als de huidige sessie een tweede factor heeft doorlopen (JWT-claim aal = aal2).';

-- ── Hulpfunctie: vereist de rol van deze gebruiker een tweede factor? ────────
-- Spiegelt ROLLEN_MET_VERPLICHTE_MFA uit src/auth/mfa-beleid.js. Lopen die twee
-- uiteen, dan vraagt de app iets anders dan de database afdwingt — de app is dan
-- hooguit hinderlijk, de database is leidend.
create or replace function public.mijn_rol_vereist_mfa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from gebruikersprofiel
    where id = auth.uid() and rol = 'admin'
  );
$$;

comment on function public.mijn_rol_vereist_mfa() is
  'True voor rollen die niet zonder tweede factor mogen. Spiegelt ROLLEN_MET_VERPLICHTE_MFA in src/auth/mfa-beleid.js.';

-- ── Policies aanscherpen ────────────────────────────────────────────────────
-- De bestaande voorwaarde blijft staan; er komt één eis bij. Een gebruiker moet
-- ofwel geen verplichte MFA hebben, ofwel de tweede factor hebben doorlopen.

drop policy if exists "dossier: eigen org" on dossiers;

create policy "dossier: eigen org"
  on dossiers for all
  using (
    organisatie_id is not null
    and organisatie_id = mijn_organisatie_id()
    and (not mijn_rol_vereist_mfa() or sessie_is_aal2())
  );

drop policy if exists "screening: via dossier" on screeningen;

create policy "screening: via dossier"
  on screeningen for all
  using (
    dossier_id in (
      select id from dossiers
      where organisatie_id = mijn_organisatie_id()
    )
    and (not mijn_rol_vereist_mfa() or sessie_is_aal2())
  );

commit;


-- ── Vóór het draaien: welke beheerders hebben nog geen factor? ───────────────
-- Draai dit EERST. Komt er een rij uit, dan sluit de migratie die persoon buiten.
--
--   select g.id, g.naam, g.rol
--   from gebruikersprofiel g
--   where g.rol = 'admin'
--     and not exists (
--       select 1 from auth.mfa_factors f
--       where f.user_id = g.id and f.status = 'verified'
--     );
--
-- ── Terugdraaien ────────────────────────────────────────────────────────────
-- Sluit u zichzelf toch buiten, dan draait dit het terug — alleen uitvoerbaar met de
-- service role, want RLS geldt niet voor die rol:
--
--   begin;
--   drop policy if exists "dossier: eigen org" on dossiers;
--   create policy "dossier: eigen org" on dossiers for all
--     using (organisatie_id is not null and organisatie_id = mijn_organisatie_id());
--   drop policy if exists "screening: via dossier" on screeningen;
--   create policy "screening: via dossier" on screeningen for all
--     using (dossier_id in (select id from dossiers where organisatie_id = mijn_organisatie_id()));
--   commit;
