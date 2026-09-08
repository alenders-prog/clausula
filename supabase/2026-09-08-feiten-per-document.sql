-- 2026-09-08 — analyse_feiten: één regel per DOCUMENT in plaats van per analyse
--
-- ── WAAROM ──────────────────────────────────────────────────────────────────
--
-- In het statistiekenpaneel staan drie knoppen: Alle / Convenant / Ouderschapsplan.
-- Die deden zichtbaar niets. De oorzaak zat niet in de knoppen maar hier: een analyse
-- van een convenant én een ouderschapsplan leverde ÉÉN regel, met de tellingen van
-- beide stukken opgeteld en doc_type = 'convenant+ouderschapsplan'.
--
-- Twee filters lazen dat veld verschillend, en allebei fout:
--
--   statistiekenUitFeiten  doc_type.split('+').includes(type)  → hele regel blijft staan,
--                          inclusief de bevindingen van het ándere stuk. Het staafdiagram
--                          bewoog dus niet.
--   mfnUitFeiten           doc_type === type                   → matcht niets, de ring
--                          verdween.
--
-- Achteraf splitsen kan niet: welke bevinding bij welk stuk hoorde staat niet in de
-- optelling. Vandaar de sleutelwijziging, zodat het bij het schrijven al gescheiden is.
--
-- ── WAT DIT MET BESTAANDE REGELS DOET ───────────────────────────────────────
--
-- Regels die er al staan met een samengesteld doc_type ('convenant+ouderschapsplan')
-- blijven staan zoals ze zijn. Ze tellen mee onder "Alle" en onder géén van de twee
-- typen — en dat is eerlijk: hun verdeling over de twee stukken is werkelijk onbekend.
-- Bij de eerstvolgende keer opslaan van diezelfde screening worden ze vervangen door
-- losse regels per document.
--
-- Wil je ze meteen omzetten: dat kan alleen door de screeningen opnieuw te laten
-- inlezen met scripts/feiten-sync.mjs --herbouw, die de rapporten er nog bij heeft.
--
-- ── DE SLEUTEL ──────────────────────────────────────────────────────────────
--
-- screening_id was uniek. Dat wordt (screening_id, doc_type). doc_type moet daarvoor
-- NOT NULL zijn: in Postgres zijn twee NULL's in een unique index van elkaar
-- verschillend, dus met NULL erin zou opnieuw opslaan alsnog dubbele regels opleveren
-- in plaats van bijgewerkte. Regels zonder type krijgen 'onbekend'.

begin;

-- 1. Geen NULL's meer in doc_type — anders draagt de unique index niets.
update public.analyse_feiten set doc_type = 'onbekend' where doc_type is null;

alter table public.analyse_feiten
  alter column doc_type set default 'onbekend',
  alter column doc_type set not null;

-- 2. De oude sleutel eraf. De naam is die van de constraint die `unique` op de kolom
--    aanmaakte; hij heet analyse_feiten_screening_id_key tenzij hij ooit is hernoemd.
alter table public.analyse_feiten
  drop constraint if exists analyse_feiten_screening_id_key;

-- 3. De nieuwe sleutel erop. Dit is degene waar de upsert in index.html op mikt
--    (onConflict: 'screening_id,doc_type'); loopt hij niet, dan komen er bij elk
--    opslaan regels bíj in plaats van overheen.
alter table public.analyse_feiten
  add constraint analyse_feiten_screening_doctype_key unique (screening_id, doc_type);

-- 4. Zoeken op screening_id gebeurt nog steeds — bij het opruimen van regels waarvan
--    het documenttype uit een analyse is verdwenen. De unique index hierboven begint
--    met screening_id en dekt dat, dus een extra index is niet nodig.

comment on column public.analyse_feiten.doc_type is
  'Documenttype van deze regel: convenant, ouderschapsplan, of onbekend. Sinds '
  '2026-09-08 één regel per document; oudere regels kunnen nog een samengestelde '
  'waarde met + bevatten en tellen dan alleen onder "Alle" mee.';

commit;
