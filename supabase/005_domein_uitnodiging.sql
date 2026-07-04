-- Migratie 005 — Domeinrestrictie bij uitnodigen
-- ============================================================

-- 1. Voeg domein-kolom toe aan organisaties
ALTER TABLE organisaties ADD COLUMN IF NOT EXISTS domein TEXT;

-- 2. Update de trigger zodat bij de eerste admin-registratie
--    het e-maildomein automatisch wordt opgeslagen
CREATE OR REPLACE FUNCTION _maak_gebruikersprofiel()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := (NEW.raw_user_meta_data->>'organisatie_id')::UUID;

  IF v_org_id IS NOT NULL THEN
    INSERT INTO public.gebruikersprofiel (id, organisatie_id, naam, rol)
    VALUES (
      NEW.id,
      v_org_id,
      COALESCE(NEW.raw_user_meta_data->>'naam', split_part(NEW.email, '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'rol', 'gebruiker')
    )
    ON CONFLICT (id) DO NOTHING;

    -- Sla het e-maildomein op bij de eerste admin-registratie
    IF COALESCE(NEW.raw_user_meta_data->>'rol', 'gebruiker') = 'admin' THEN
      UPDATE public.organisaties
      SET domein = lower(split_part(NEW.email, '@', 2))
      WHERE id = v_org_id AND (domein IS NULL OR domein = '');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Helper voor de uitnodigings-API: geeft org-info terug voor de ingelogde admin
CREATE OR REPLACE FUNCTION org_info_voor_uitnodiging()
RETURNS TABLE(org_id UUID, org_naam TEXT, org_domein TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT o.id, o.naam, o.domein
  FROM   public.organisaties o
  JOIN   public.gebruikersprofiel p ON p.organisatie_id = o.id
  WHERE  p.id = auth.uid() AND p.rol = 'admin';
END;
$$;

-- 4. Stel voor bestaande admins het domein in (eenmalig)
UPDATE organisaties o
SET domein = lower(split_part(u.email, '@', 2))
FROM public.gebruikersprofiel p
JOIN auth.users u ON u.id = p.id
WHERE p.organisatie_id = o.id
  AND p.rol = 'admin'
  AND (o.domein IS NULL OR o.domein = '');
