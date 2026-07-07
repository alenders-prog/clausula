-- ============================================================
-- Migratie 008 — namen_map kolom voor AES-GCM versleutelde naamkoppeling
-- Uitvoeren in Supabase SQL-editor (eenmalig)
--
-- Doel: Sla persoonsgegevens (namen partijen, kinderen, mediator, notaris)
--       NIET meer in plaintext op. In plaats daarvan:
--         - rapport en classificatie: gepseudonimiseerd ([PERSOON_A] etc.)
--         - namen_map: AES-256-GCM versleuteld via Vercel env var NAAM_ENCRYPTION_KEY
--
-- Bestaande screeningen (zonder namen_map): worden niet aangeraakt.
-- Ze blijven leesbaar — de browser toont gewoon de opgeslagen plaintext namen.
-- Bij een nieuwe analyse worden ze automatisch met encryptie opgeslagen.
-- ============================================================

ALTER TABLE screeningen
  ADD COLUMN IF NOT EXISTS namen_map TEXT;

COMMENT ON COLUMN screeningen.namen_map IS
  'AES-256-GCM versleutelde naamkoppeling (placeholder → echte naam). '
  'Formaat: base64(IV[12] || ciphertext). Sleutel in Vercel env var NAAM_ENCRYPTION_KEY.';
