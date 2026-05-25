-- T058 — Rôle DB applicatif restreint pour le module conformité.
-- Sécurité défense en profondeur (Principe IX) :
--   * L'application se connecte sous app_conformite (privilèges minimums)
--     en prod. Le superutilisateur reste utilisé uniquement pour les
--     migrations.
--   * Les privilèges UPDATE/DELETE sur conformite_audit_entries sont
--     REVOQUÉS dans la migration 0002 (couple avec le trigger
--     append-only).
--   * Le password n'est PAS défini ici — il est injecté par la migration
--     déploy via une variable provisoire ou directement par l'opérateur.
--     En dev local, Docker Compose passe AGCONF_PWD via .env.dev.
--
-- IMPORTANT : si vous exécutez ce SQL hors `prisma migrate deploy`, le
-- bloc PL/pgSQL ci-dessous est idempotent — il ne créera pas un rôle
-- déjà existant.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_conformite'
  ) THEN
    -- Le password est injecté ultérieurement via ALTER ROLE en prod, ou
    -- récupéré depuis AWS Secrets Manager au boot du conteneur.
    CREATE ROLE app_conformite WITH LOGIN PASSWORD 'change_me_in_deploy';
  END IF;
END
$$;

-- Privilèges de connexion + usage du schéma public (CONNECT/USAGE seulement).
-- Note: GRANT ON DATABASE exige un identifiant littéral, pas une expression
-- comme current_database() — on passe par EXECUTE format() pour résoudre
-- dynamiquement le nom (compatible Postgres standard + shadow database Prisma).
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_conformite', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO app_conformite;

-- Les tables et privilèges granulaires sont accordés après leur création
-- (migration 0001_init suivante).
