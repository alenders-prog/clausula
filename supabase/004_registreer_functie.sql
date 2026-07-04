-- Migratie 004 — registreer_nieuw_kantoor functie
-- Maakt een nieuwe organisatie aan en retourneert het UUID.
-- SECURITY DEFINER zodat de aanroep RLS omzeilt.

CREATE OR REPLACE FUNCTION registreer_nieuw_kantoor(kantoor_naam TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  IF kantoor_naam IS NULL OR trim(kantoor_naam) = '' THEN
    RAISE EXCEPTION 'Kantoor naam mag niet leeg zijn';
  END IF;

  INSERT INTO organisaties (naam)
  VALUES (trim(kantoor_naam))
  RETURNING id INTO v_org_id;

  RETURN v_org_id;
END;
$$;
