-- 2026-08-28 — drie kolommen erbij: wat er per ernst nog openstaat
--
-- `analyse_feiten` telt per ernst hoeveel er GEVONDEN is (hoog/midden/laag) en hoeveel
-- er in totaal is afgevinkt of genegeerd. Daaruit is niet af te leiden hoeveel er per
-- ernst nog openstaat: drie afgevinkte punten kunnen drie lage zijn of drie hoge.
--
-- Het dashboard heeft dat wel nodig — de twee ringen "gevonden → nog open" en de regel
-- "nog open, ernst hoog" staan erop. Zonder deze kolommen kan het dashboard alleen op
-- de nog bestaande screeningen rekenen, en dan zakt het weer mee als er een dossier
-- wordt verwijderd. Precies wat de feitentabel moest voorkomen.
--
-- Open = niet afgevinkt en niet genegeerd. Dezelfde definitie als op de dossierkaart.

begin;

alter table public.analyse_feiten
  add column if not exists open_hoog   integer not null default 0,
  add column if not exists open_midden integer not null default 0,
  add column if not exists open_laag   integer not null default 0;

comment on column public.analyse_feiten.open_hoog is
  'Bevindingen met ernst hoog die niet zijn afgevinkt en niet genegeerd.';

commit;

-- Na het draaien de bestaande regels bijwerken; de nieuwe kolommen staan tot dan op 0:
--
--   node scripts/feiten-sync.mjs
--   node scripts/feiten-sync.mjs --controle
--
-- Terugdraaien:
--
--   alter table public.analyse_feiten
--     drop column if exists open_hoog,
--     drop column if exists open_midden,
--     drop column if exists open_laag;
