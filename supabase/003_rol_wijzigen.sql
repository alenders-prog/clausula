-- Migratie 003 — Rolwijziging
CREATE OR REPLACE FUNCTION wijzig_rol(p_user_id UUID, p_nieuwe_rol TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org UUID;
BEGIN
  IF p_nieuwe_rol NOT IN ('admin', 'gebruiker') THEN
    RAISE EXCEPTION 'Ongeldige rol: %', p_nieuwe_rol;
  END IF;
  SELECT organisatie_id INTO v_org
  FROM gebruikersprofiel WHERE id = auth.uid() AND rol = 'admin';
  IF v_org IS NULL THEN RAISE EXCEPTION 'Geen toegang'; END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Je kunt je eigen rol niet wijzigen';
  END IF;
  UPDATE gebruikersprofiel
  SET rol = p_nieuwe_rol
  WHERE id = p_user_id AND organisatie_id = v_org;
  RETURN FOUND;
END;
$$;
