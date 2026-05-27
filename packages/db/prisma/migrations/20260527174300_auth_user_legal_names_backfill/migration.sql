-- Migration auth_user_legal_names_backfill — feature 005 / dossier 007.
--
-- Les colonnes auth_users.firstName + lastName ont été créées NULLABLE par
-- la migration init_db. Pour les utilisateurs existants (créés par 002/006
-- avant cette feature), on les peuple depuis le champ `name` libre concaténé
-- par SignupConseillerUseCase (`${firstName} ${lastName}`).
--
-- Algorithme : split naïf sur le premier espace.
--   - prénom = première partie (avant le 1er espace)
--   - nom    = tout ce qui suit (peut contenir des espaces : "Le Goff",
--              "de la Tour", "Dupont-Tremblay")
--
-- Cas limites :
--   - `name` NULL → firstName + lastName restent NULL (admin Auth.js sans nom).
--   - `name` sans espace ("Marie") → firstName='Marie', lastName=NULL.
--     Le port AuthUserLegalNameReader retournera NULL et le profil ne
--     pourra pas générer de slug — comportement attendu (incomplet jusqu'à
--     ce que l'admin corrige la valeur).
--   - `name` avec espaces multiples → split sur la 1re occurrence (regex
--     `^([^ ]+) +(.+)$`).
--
-- Cf. A1 exploration repo (specs/007-profil-conseiller/tasks.md T010).

UPDATE "auth_users"
SET
  "firstName" = NULLIF(TRIM(split_part("name", ' ', 1)), ''),
  "lastName"  = NULLIF(
    TRIM(
      CASE
        WHEN POSITION(' ' IN "name") > 0 THEN
          SUBSTRING("name" FROM POSITION(' ' IN "name") + 1)
        ELSE
          ''
      END
    ),
    ''
  )
WHERE
  "name" IS NOT NULL
  AND ("firstName" IS NULL OR "lastName" IS NULL);
