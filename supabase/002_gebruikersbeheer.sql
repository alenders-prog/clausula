-- ============================================================
-- Migratie 002 — Gebruikersbeheer & uitnodigingen
-- ============================================================

-- ── 1. Uitnodigingen-tabel ───────────────────────────────────
CREATE TABLE IF NOT EXISTS uitnodigingen (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  token          TEXT        DEFAULT encode(gen_random_bytes(32), 'hex') NOT NULL UNIQUE,
  organisatie_id UUID        REFERENCES organisaties(id) ON DELETE CASCADE NOT NULL,
  rol            TEXT        DEFAULT 'gebruiker' CHECK (rol IN ('admin', 'gebruiker')),
  uitgenodigd_door UUID      REFERENCES auth.users(id),
  gebruikt_op    TIMESTAMPTZ,
  vervalt_op     TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE uitnodigingen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "uitnodiging: admin ziet eigen" ON uitnodigingen;
CREATE POLICY "uitnodiging: admin ziet eigen"
  ON uitnodigingen FOR SELECT
  USING (organisatie_id = mijn_organisatie_id() AND ik_ben_admin());


-- ── 2. Uitnodiging aanmaken (alleen admin van eigen org) ─────
CREATE OR REPLACE FUNCTION maak_uitnodiging(p_rol TEXT DEFAULT 'gebruiker')
RETURNS TABLE(token TEXT, vervalt_op TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_token    TEXT;
  v_vervalt  TIMESTAMPTZ;
  v_org_id   UUID;
BEGIN
  SELECT organisatie_id INTO v_org_id
  FROM gebruikersprofiel WHERE id = auth.uid() AND rol = 'admin';
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Geen toegang: alleen admins mogen uitnodigen'; END IF;

  v_token   := encode(gen_random_bytes(32), 'hex');
  v_vervalt := NOW() + INTERVAL '7 days';

  INSERT INTO uitnodigingen (token, organisatie_id, rol, uitgenodigd_door, vervalt_op)
  VALUES (v_token, v_org_id, p_rol, auth.uid(), v_vervalt);

  RETURN QUERY SELECT v_token, v_vervalt;
END;
$$;


-- ── 3. Uitnodiging valideren (publiek — geen auth nodig) ─────
CREATE OR REPLACE FUNCTION valideer_uitnodiging(p_token TEXT)
RETURNS TABLE(organisatie_id UUID, kantoor_naam TEXT, rol TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.organisatie_id, o.naam, u.rol
  FROM   uitnodigingen u
  JOIN   organisaties  o ON o.id = u.organisatie_id
  WHERE  u.token       = p_token
    AND  u.gebruikt_op IS NULL
    AND  u.vervalt_op  > NOW();
END;
$$;


-- ── 4. Uitnodiging markeren als gebruikt ────────────────────
CREATE OR REPLACE FUNCTION gebruik_uitnodiging(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE uitnodigingen SET gebruikt_op = NOW()
  WHERE token = p_token AND gebruikt_op IS NULL AND vervalt_op > NOW();
  RETURN FOUND;
END;
$$;


-- ── 5. Gebruikerslijst ophalen (alleen eigen org) ────────────
CREATE OR REPLACE FUNCTION lijst_gebruikers()
RETURNS TABLE(id UUID, naam TEXT, rol TEXT, email TEXT, lid_sinds TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.naam, p.rol, u.email::TEXT, p.created_at
  FROM   gebruikersprofiel p
  JOIN   auth.users u ON u.id = p.id
  WHERE  p.organisatie_id = mijn_organisatie_id()
  ORDER  BY p.created_at;
END;
$$;


-- ── 6. Gebruiker verwijderen uit org (alleen admin) ─────────
CREATE OR REPLACE FUNCTION verwijder_gebruiker(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org UUID;
BEGIN
  SELECT organisatie_id INTO v_org FROM gebruikersprofiel WHERE id = auth.uid() AND rol = 'admin';
  IF v_org IS NULL THEN RAISE EXCEPTION 'Geen toegang'; END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'Je kunt jezelf niet verwijderen'; END IF;

  DELETE FROM gebruikersprofiel WHERE id = p_user_id AND organisatie_id = v_org;
  RETURN FOUND;
END;
$$;
