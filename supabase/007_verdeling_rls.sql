-- ============================================================
-- Migratie 007 — RLS voor verdeling-tabellen
-- Uitvoeren in Supabase SQL-editor (eenmalig)
--
-- Probleem: verdeling_overzicht_totalen, verdeling_posten en
-- zorgverdeling_dagdelen stonden UNRESTRICTED — iedereen kon
-- alle data lezen én schrijven.
--
-- Oplossing:
--   1. organisatie_id-kolom toevoegen aan alle drie tabellen
--   2. RLS inschakelen
--   3. Beleid: authenticated users zien alleen eigen org
-- ============================================================

-- ── 1. organisatie_id toevoegen ──────────────────────────────
ALTER TABLE verdeling_overzicht_totalen
  ADD COLUMN IF NOT EXISTS organisatie_id UUID REFERENCES organisaties(id) ON DELETE CASCADE;

ALTER TABLE verdeling_posten
  ADD COLUMN IF NOT EXISTS organisatie_id UUID REFERENCES organisaties(id) ON DELETE CASCADE;

ALTER TABLE zorgverdeling_dagdelen
  ADD COLUMN IF NOT EXISTS organisatie_id UUID REFERENCES organisaties(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS verdeling_overzicht_org_idx ON verdeling_overzicht_totalen(organisatie_id);
CREATE INDEX IF NOT EXISTS verdeling_posten_org_idx    ON verdeling_posten(organisatie_id);
CREATE INDEX IF NOT EXISTS zorgverdeling_org_idx       ON zorgverdeling_dagdelen(organisatie_id);


-- ── 2. RLS inschakelen ───────────────────────────────────────
ALTER TABLE verdeling_overzicht_totalen ENABLE ROW LEVEL SECURITY;
ALTER TABLE verdeling_posten            ENABLE ROW LEVEL SECURITY;
ALTER TABLE zorgverdeling_dagdelen      ENABLE ROW LEVEL SECURITY;


-- ── 3. Beleid: alleen eigen organisatie ─────────────────────

-- verdeling_overzicht_totalen
DROP POLICY IF EXISTS "verdeling_overzicht: eigen org" ON verdeling_overzicht_totalen;
CREATE POLICY "verdeling_overzicht: eigen org"
  ON verdeling_overzicht_totalen FOR ALL TO authenticated
  USING  (organisatie_id = mijn_organisatie_id())
  WITH CHECK (organisatie_id = mijn_organisatie_id());

-- verdeling_posten
DROP POLICY IF EXISTS "verdeling_posten: eigen org" ON verdeling_posten;
CREATE POLICY "verdeling_posten: eigen org"
  ON verdeling_posten FOR ALL TO authenticated
  USING  (organisatie_id = mijn_organisatie_id())
  WITH CHECK (organisatie_id = mijn_organisatie_id());

-- zorgverdeling_dagdelen
DROP POLICY IF EXISTS "zorgverdeling: eigen org" ON zorgverdeling_dagdelen;
CREATE POLICY "zorgverdeling: eigen org"
  ON zorgverdeling_dagdelen FOR ALL TO authenticated
  USING  (organisatie_id = mijn_organisatie_id())
  WITH CHECK (organisatie_id = mijn_organisatie_id());


-- ── 4. Bestaande rijen koppelen aan de enige organisatie ─────
-- Als er al data in zit en er is maar één organisatie in het systeem,
-- vul dan organisatie_id automatisch in. Sla over als er meerdere zijn.
DO $$
DECLARE
  _org_id UUID;
  _org_count INT;
BEGIN
  SELECT COUNT(*) INTO _org_count FROM organisaties;
  IF _org_count = 1 THEN
    SELECT id INTO _org_id FROM organisaties LIMIT 1;
    UPDATE verdeling_overzicht_totalen SET organisatie_id = _org_id WHERE organisatie_id IS NULL;
    UPDATE verdeling_posten            SET organisatie_id = _org_id WHERE organisatie_id IS NULL;
    UPDATE zorgverdeling_dagdelen      SET organisatie_id = _org_id WHERE organisatie_id IS NULL;
    RAISE NOTICE 'Bestaande rijen gekoppeld aan organisatie %', _org_id;
  ELSIF _org_count > 1 THEN
    RAISE NOTICE 'Meerdere organisaties gevonden — koppel bestaande rijen handmatig via organisatie_id.';
  END IF;
END $$;
