-- ============================================================
-- Migratie 001 — Multi-tenancy & gebruikersbeheer
-- Uitvoeren in Supabase SQL-editor (eenmalig)
-- ============================================================


-- ── 1. Organisaties ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organisaties (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  naam              TEXT        NOT NULL,
  plan              TEXT        NOT NULL DEFAULT 'trial'
                                CHECK (plan IN ('trial', 'starter', 'pro')),
  retention_maanden INTEGER     NOT NULL DEFAULT 12,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── 2. Gebruikersprofiel (koppelt auth.users aan een org) ───
CREATE TABLE IF NOT EXISTS gebruikersprofiel (
  id             UUID  REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  organisatie_id UUID  REFERENCES organisaties(id) ON DELETE CASCADE NOT NULL,
  naam           TEXT,
  rol            TEXT  NOT NULL DEFAULT 'gebruiker'
                       CHECK (rol IN ('admin', 'gebruiker')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gebruikersprofiel_org_idx
  ON gebruikersprofiel(organisatie_id);


-- ── 3. Dossiers uitbreiden ───────────────────────────────────
-- Nullable: bestaande dossiers krijgen voorlopig geen org_id.
ALTER TABLE dossiers
  ADD COLUMN IF NOT EXISTS organisatie_id UUID REFERENCES organisaties(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS gebruiker_id   UUID REFERENCES auth.users(id)   ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dossiers_org_idx
  ON dossiers(organisatie_id);


-- ── 4. Screeningen: organisatie via dossier ──────────────────
-- Screeningen hangen aan dossiers — geen aparte org-kolom nodig.
-- RLS loopt via de dossier-koppeling (zie stap 8).
-- Optioneel: ook directe gebruiker_id bijhouden per screening.
ALTER TABLE screeningen
  ADD COLUMN IF NOT EXISTS gebruiker_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;


-- ── 5. Helper-functies ───────────────────────────────────────
CREATE OR REPLACE FUNCTION mijn_organisatie_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT organisatie_id
  FROM   gebruikersprofiel
  WHERE  id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION ik_ben_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM gebruikersprofiel
    WHERE id = auth.uid() AND rol = 'admin'
  )
$$;


-- ── 6. RLS inschakelen ───────────────────────────────────────
ALTER TABLE organisaties      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gebruikersprofiel ENABLE ROW LEVEL SECURITY;
ALTER TABLE dossiers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE screeningen       ENABLE ROW LEVEL SECURITY;


-- ── 7. RLS-policies: organisaties ───────────────────────────

DROP POLICY IF EXISTS "org: lid mag zien"        ON organisaties;
DROP POLICY IF EXISTS "org: admin mag bijwerken" ON organisaties;

CREATE POLICY "org: lid mag zien"
  ON organisaties FOR SELECT
  USING (id = mijn_organisatie_id());

CREATE POLICY "org: admin mag bijwerken"
  ON organisaties FOR UPDATE
  USING (id = mijn_organisatie_id() AND ik_ben_admin());


-- ── 8. RLS-policies: gebruikersprofiel ──────────────────────

DROP POLICY IF EXISTS "profiel: eigen org zien"  ON gebruikersprofiel;
DROP POLICY IF EXISTS "profiel: eigen bijwerken"  ON gebruikersprofiel;
DROP POLICY IF EXISTS "profiel: admin bijwerken"  ON gebruikersprofiel;

CREATE POLICY "profiel: eigen org zien"
  ON gebruikersprofiel FOR SELECT
  USING (organisatie_id = mijn_organisatie_id());

CREATE POLICY "profiel: eigen bijwerken"
  ON gebruikersprofiel FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "profiel: admin bijwerken"
  ON gebruikersprofiel FOR UPDATE
  USING (organisatie_id = mijn_organisatie_id() AND ik_ben_admin());


-- ── 9. RLS-policies: dossiers ───────────────────────────────

DROP POLICY IF EXISTS "dossier: eigen org" ON dossiers;

CREATE POLICY "dossier: eigen org"
  ON dossiers FOR ALL
  USING (
    organisatie_id IS NOT NULL
    AND organisatie_id = mijn_organisatie_id()
  );


-- ── 10. RLS-policies: screeningen ───────────────────────────

DROP POLICY IF EXISTS "screening: via dossier" ON screeningen;

CREATE POLICY "screening: via dossier"
  ON screeningen FOR ALL
  USING (
    dossier_id IN (
      SELECT id FROM dossiers
      WHERE organisatie_id = mijn_organisatie_id()
    )
  );


-- ── 11. RLS op kennisbank-tabellen ──────────────────────────

ALTER TABLE situatie_kenmerken  ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_chunks        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kennisbank: authenticated leest" ON situatie_kenmerken;
DROP POLICY IF EXISTS "kennisbank: authenticated leest" ON document_templates;
DROP POLICY IF EXISTS "kennisbank: authenticated leest" ON legal_chunks;

CREATE POLICY "kennisbank: authenticated leest"
  ON situatie_kenmerken FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "kennisbank: authenticated leest"
  ON document_templates FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "kennisbank: authenticated leest"
  ON legal_chunks FOR SELECT
  TO authenticated USING (true);


-- ── 12. Trigger: profiel aanmaken bij nieuwe gebruiker ───────
-- Supabase slaat organisatie_id + rol op in user_metadata
-- bij registratie (admin) of uitnodiging (gebruiker).

CREATE OR REPLACE FUNCTION _maak_gebruikersprofiel()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF (NEW.raw_user_meta_data->>'organisatie_id') IS NOT NULL THEN
    INSERT INTO gebruikersprofiel (id, organisatie_id, naam, rol)
    VALUES (
      NEW.id,
      (NEW.raw_user_meta_data->>'organisatie_id')::UUID,
      COALESCE(NEW.raw_user_meta_data->>'naam', split_part(NEW.email, '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'rol', 'gebruiker')
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bij_nieuwe_gebruiker ON auth.users;
CREATE TRIGGER bij_nieuwe_gebruiker
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION _maak_gebruikersprofiel();


-- ── 13. Storage-policies: documenten-bucket ─────────────────
-- Paden worden straks opgebouwd als {org_id}/{bestand}.
-- De policy controleert of het eerste mapniveau overeenkomt
-- met de organisatie_id van de ingelogde gebruiker.

DROP POLICY IF EXISTS "documenten: public lezen"   ON storage.objects;
DROP POLICY IF EXISTS "documenten: eigen org upload" ON storage.objects;
DROP POLICY IF EXISTS "documenten: eigen org lezen"  ON storage.objects;
DROP POLICY IF EXISTS "documenten: eigen org verwijderen" ON storage.objects;

CREATE POLICY "documenten: eigen org upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documenten'
    AND (storage.foldername(name))[1] = mijn_organisatie_id()::TEXT
  );

CREATE POLICY "documenten: eigen org lezen"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documenten'
    AND (storage.foldername(name))[1] = mijn_organisatie_id()::TEXT
  );

CREATE POLICY "documenten: eigen org verwijderen"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documenten'
    AND (storage.foldername(name))[1] = mijn_organisatie_id()::TEXT
  );
