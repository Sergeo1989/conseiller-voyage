-- Migration notification_email_log_erasure_check — feature 003.
--
-- CHECK constraint qui garantit la cohérence post-effacement Loi 25 sur
-- `notification_email_log` :
--   1. Si `erasedAt` est non-null, toutes les colonnes PII DOIVENT
--      être null (clear/canonical/subject/htmlBody/textBody).
--   2. `recipientEmailHashHMAC` doit rester NOT NULL même après
--      effacement — fix B-5 review architecte (audit anti-resoumission).
--
-- Cette contrainte agit en défense en profondeur : un bug applicatif
-- qui tenterait de nullifier le hash ou de laisser un PII en clair
-- après `erasedAt` non-null sera rejeté par Postgres.

ALTER TABLE "notification_email_log"
  ADD CONSTRAINT "chk_erased_implies_null_pii_and_hash_kept"
  CHECK (
    -- 1. Si erasedAt non-null → tous les PII en clair doivent être null
    (
      "erasedAt" IS NULL
      OR (
        "recipientEmailClear" IS NULL
        AND "recipientEmailCanonical" IS NULL
        AND "subject" IS NULL
        AND "htmlBody" IS NULL
        AND "textBody" IS NULL
      )
    )
    -- 2. recipientEmailHashHMAC doit rester NOT NULL (garantit aussi
    -- par la déclaration NOT NULL de la colonne, mais explicite ici
    -- pour empêcher toute future migration de relâcher cette garantie).
    AND ("recipientEmailHashHMAC" IS NOT NULL)
  );

COMMENT ON CONSTRAINT "chk_erased_implies_null_pii_and_hash_kept"
  ON "notification_email_log"
  IS 'Loi 25 — défense en profondeur effacement (feature 003 fix B-5 review architecte).';
