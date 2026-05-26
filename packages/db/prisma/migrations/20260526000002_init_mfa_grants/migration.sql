-- Migration init_mfa_grants — feature 005 polish post-ultrareview.
--
-- BUG_026 du review ultraréview : la migration init_mfa_immutability
-- (20260526000001) accordait `SELECT, INSERT, UPDATE` au rôle
-- `app_conformite` sur `mfa_secrets` et `mfa_outbox_emails` (DELETE
-- oublié) et N'ACCORDAIT RIEN sur `auth_sessions` (qui restait en
-- SELECT-only depuis 001 — assumption: "Aucune écriture côté API").
--
-- Feature 005 invalide cette assumption :
--   - VerifyTotpUseCase / VerifyBackupCodeUseCase / EnrollTotpUseCase /
--     StepUpUseCase : UPDATE auth_sessions SET mfaVerifiedAt = NOW
--   - StepUpUseCase (3 échecs) : DELETE auth_sessions
--   - PrismaActiveSessionRevoker (reset admin + device change) :
--     DELETE auth_sessions
--   - PrismaMfaSecretRepository.supersedePending / deleteAllByUserId :
--     DELETE mfa_secrets
--   - ChangeDeviceUseCase : DELETE mfa_secrets (transaction)
--
-- En CI ces appels passent parce que `cv_dev` est superuser. En
-- production où `app_conformite` est provisionné via 0000_setup_db_roles,
-- chaque appel MFA échoue avec `permission denied for table ...` →
-- feature 005 non-fonctionnelle.
--
-- Fix minimal : ajouter les GRANTs manquants. Pattern DO + format()
-- pour shadow DB compat (P1-7 de la review initiale).
--
-- Note : un rôle dédié `app_identite` serait plus propre conformément
-- au principe least-privilege. Différé à la feature 002 quand elle
-- arrivera avec sa propre infra de provisioning de rôle.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_conformite') THEN
    -- Compléments mfa_*
    EXECUTE format('GRANT DELETE ON %I TO %I', 'mfa_secrets', 'app_conformite');
    EXECUTE format('GRANT DELETE ON %I TO %I', 'mfa_outbox_emails', 'app_conformite');
    -- Écritures sur auth_sessions (invalidation par 005 reset/device-change
    -- + refresh mfaVerifiedAt par enroll/verify/step-up).
    EXECUTE format('GRANT UPDATE, DELETE ON %I TO %I', 'auth_sessions', 'app_conformite');
  END IF;
END $$;
