-- Migratie 006 — Dossierzichtbaarheid per gebruiker
-- ============================================================

-- 1. Kolom toevoegen aan gebruikersprofiel
ALTER TABLE gebruikersprofiel
  ADD COLUMN IF NOT EXISTS ziet_alle_dossiers BOOLEAN NOT NULL DEFAULT false;

-- Admins zien standaard alles
UPDATE gebruikersprofiel SET ziet_alle_dossiers = true WHERE rol = 'admin';


-- 2. Helper-functie (SECURITY DEFINER zodat RLS hem kan aanroepen)
CREATE OR REPLACE FUNCTION ik_zie_alle_dossiers()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (ziet_alle_dossiers OR rol = 'admin')
     FROM gebruikersprofiel WHERE id = auth.uid()),
    false
  )
$$;


-- 3. RLS-policy op dossiers vervangen
DROP POLICY IF EXISTS "dossier: eigen org" ON dossiers;

CREATE POLICY "dossier: eigen org"
  ON dossiers FOR ALL
  USING (
    organisatie_id IS NOT NULL
    AND organisatie_id = mijn_organisatie_id()
    AND (
      ik_zie_alle_dossiers()               -- admin of instelling aan
      OR gebruiker_id = auth.uid()         -- eigen dossier
      OR gebruiker_id IS NULL              -- oud dossier zonder eigenaar (backward compat)
    )
  );


-- 4. lijst_gebruikers uitbreiden met ziet_alle_dossiers
DROP FUNCTION IF EXISTS lijst_gebruikers();
CREATE OR REPLACE FUNCTION lijst_gebruikers()
RETURNS TABLE(id UUID, naam TEXT, rol TEXT, email TEXT, lid_sinds TIMESTAMPTZ, ziet_alle_dossiers BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.naam, p.rol, u.email::TEXT, p.created_at, p.ziet_alle_dossiers
  FROM   gebruikersprofiel p
  JOIN   auth.users u ON u.id = p.id
  WHERE  p.organisatie_id = mijn_organisatie_id()
  ORDER  BY p.created_at;
END;
$$;


-- 5. Functie voor de beheerder om de instelling te wijzigen
CREATE OR REPLACE FUNCTION wijzig_dossier_toegang(p_user_id UUID, p_ziet_alle BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org UUID;
BEGIN
  -- Alleen admin van dezelfde org
  SELECT organisatie_id INTO v_org
  FROM gebruikersprofiel WHERE id = auth.uid() AND rol = 'admin';
  IF v_org IS NULL THEN RAISE EXCEPTION 'Geen toegang'; END IF;

  UPDATE gebruikersprofiel
  SET ziet_alle_dossiers = p_ziet_alle
  WHERE id = p_user_id AND organisatie_id = v_org;
  RETURN FOUND;
END;
$$;
