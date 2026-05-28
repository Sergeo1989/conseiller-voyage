-- T015 — Trigger d'idempotence d'anonymisation Loi 25 sur intake_voyageur_contacts.
-- Cf. specs/002-voyageur-intake/data-model.md *Post-anonymisation Loi 25*
-- Pattern hérité de profil_immutability_triggers (007) et conformite (001).
--
-- Invariant : une fois `anonymizedAt IS NOT NULL`, les colonnes PII NE
-- DOIVENT PLUS être remises à NON-NULL. Garantit la défense en profondeur
-- de l'effacement Loi 25 (SC-008, FR-022, FR-022a) même en cas de bug code
-- ou de manipulation manuelle DB.

CREATE OR REPLACE FUNCTION intake_reject_voyageur_contact_unanonymize()
RETURNS TRIGGER AS $$
BEGIN
  -- Si le contact n'a pas (encore) été anonymisé, tout UPDATE est autorisé.
  IF OLD."anonymizedAt" IS NULL THEN
    RETURN NEW;
  END IF;

  -- À partir d'ici : OLD.anonymizedAt IS NOT NULL. On vérifie qu'aucune
  -- PII applicable ne passe de NULL à NON-NULL (re-population interdite).

  IF OLD."firstName" IS NULL AND NEW."firstName" IS NOT NULL THEN
    RAISE EXCEPTION 'Contact anonymisé Loi 25 : firstName ne peut pas être remis à non-NULL (id=%)', OLD.id;
  END IF;

  IF OLD."lastName" IS NULL AND NEW."lastName" IS NOT NULL THEN
    RAISE EXCEPTION 'Contact anonymisé Loi 25 : lastName ne peut pas être remis à non-NULL (id=%)', OLD.id;
  END IF;

  IF OLD."phone" IS NULL AND NEW."phone" IS NOT NULL THEN
    RAISE EXCEPTION 'Contact anonymisé Loi 25 : phone ne peut pas être remis à non-NULL (id=%)', OLD.id;
  END IF;

  IF OLD."postalCode" IS NULL AND NEW."postalCode" IS NOT NULL THEN
    RAISE EXCEPTION 'Contact anonymisé Loi 25 : postalCode ne peut pas être remis à non-NULL (id=%)', OLD.id;
  END IF;

  -- L'email passe à NULL au moment de l'anonymisation et `emailHashAfterErasure`
  -- est posé. Refuser une remise de email en non-NULL (anti-réintroduction PII).
  IF OLD."email" IS NULL AND NEW."email" IS NOT NULL THEN
    RAISE EXCEPTION 'Contact anonymisé Loi 25 : email ne peut pas être remis à non-NULL (id=%)', OLD.id;
  END IF;

  -- anonymizedAt est terminal : impossible de le remettre à NULL.
  IF NEW."anonymizedAt" IS NULL THEN
    RAISE EXCEPTION 'Contact anonymisé Loi 25 : anonymizedAt est terminal (id=%)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER intake_voyageur_contact_anonymisation_idempotent
  BEFORE UPDATE ON "intake_voyageur_contacts"
  FOR EACH ROW
  EXECUTE FUNCTION intake_reject_voyageur_contact_unanonymize();

-- ---------------------------------------------------------------------
-- Trigger équivalent sur intake_voyageur_briefs (status `anonymized` terminal)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION intake_reject_brief_unanonymize()
RETURNS TRIGGER AS $$
BEGIN
  -- Une fois status='anonymized', toute transition vers un autre statut
  -- est refusée (Principe II — irréversibilité).
  IF OLD."status" = 'anonymized' AND NEW."status" IS DISTINCT FROM 'anonymized' THEN
    RAISE EXCEPTION 'Brief anonymisé Loi 25 : statut terminal, tentative=% (id=%)', NEW."status", OLD.id;
  END IF;

  -- anonymizedAt est terminal : impossible de le remettre à NULL.
  IF OLD."anonymizedAt" IS NOT NULL AND NEW."anonymizedAt" IS NULL THEN
    RAISE EXCEPTION 'Brief anonymisé Loi 25 : anonymizedAt est terminal (id=%)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER intake_voyageur_brief_anonymisation_idempotent
  BEFORE UPDATE ON "intake_voyageur_briefs"
  FOR EACH ROW
  EXECUTE FUNCTION intake_reject_brief_unanonymize();
