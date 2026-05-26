-- Migration auth_credentials_grants — feature 002.
--
-- GRANT SELECT/INSERT/UPDATE/DELETE pour le rôle app_conformite sur les 6
-- nouvelles tables auth + les enums associés.
--
-- Pattern DO + format() pour shadow DB compat (P1-7 / bug_026 de 002a).
--
-- Dette technique M11 inscrite roadmap : à terme, créer un rôle dédié
-- app_identite avec least-privilege strict. Aujourd'hui, réutilisation
-- pragmatique d'app_conformite pour cohérence opérationnelle 001 + 002a + 002.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_conformite') THEN
    -- Tables (SELECT, INSERT, UPDATE, DELETE)
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO %I', 'auth_email_verification_tokens', 'app_conformite');
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO %I', 'auth_password_reset_tokens', 'app_conformite');
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO %I', 'auth_admin_invitation_tokens', 'app_conformite');
    -- auth_audit_events : SELECT + INSERT seulement (triggers rejettent UPDATE/DELETE).
    EXECUTE format('GRANT SELECT, INSERT ON %I TO %I', 'auth_audit_events', 'app_conformite');
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO %I', 'auth_login_lockout_buckets', 'app_conformite');
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO %I', 'auth_outbox_emails', 'app_conformite');

    -- Enums Postgres (USAGE pour pouvoir caster aux valeurs)
    EXECUTE format('GRANT USAGE ON TYPE %I TO %I', 'AuthAuditEventType', 'app_conformite');
    EXECUTE format('GRANT USAGE ON TYPE %I TO %I', 'LoginLockoutKind', 'app_conformite');
    EXECUTE format('GRANT USAGE ON TYPE %I TO %I', 'AuthEmailTemplate', 'app_conformite');
  END IF;
END $$;
