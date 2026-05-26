-- Migration login_lockout_nulls_not_distinct — fix critique post-Phase 4.
--
-- Postgres traite NULL ≠ NULL dans les index unique standard. Cela
-- permettait d'insérer plusieurs rows avec (kind='login_account',
-- accountId=<X>, ipHash=NULL) — l'ON CONFLICT ne déclenchait jamais et
-- chaque échec créait un nouveau bucket, empêchant le lockout effectif.
--
-- Postgres 15+ supporte NULLS NOT DISTINCT pour traiter NULL = NULL dans
-- les index unique. On reconstruit l'index existant avec ce comportement.

DROP INDEX IF EXISTS "login_lockout_key_unique";

CREATE UNIQUE INDEX "login_lockout_key_unique"
  ON "auth_login_lockout_buckets" ("kind", "accountId", "ipHash")
  NULLS NOT DISTINCT;
