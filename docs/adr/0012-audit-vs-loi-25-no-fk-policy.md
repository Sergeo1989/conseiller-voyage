# ADR-0012 — Journal d'audit `auth_audit_events` sans FK Prisma vers `auth_users`

**Statut** : Accepté
**Date** : 2026-05-26
**Feature concernée** : 002 (`specs/006-auth-conseiller-admin/`)

## Contexte

La constitution v2.2.0 pose deux principes **NON-NÉGOCIABLES** qui entrent
en contradiction structurelle quand on conçoit un journal d'audit
d'authentification :

- **Principe IX (Sécurité applicative)** — le journal d'audit `auth_audit_events`
  est **immuable** au niveau base de données. La feature 002 le matérialise par
  des triggers Postgres `BEFORE UPDATE/DELETE/TRUNCATE` qui rejettent toute
  mutation, sur le pattern déjà éprouvé en 001 (audit conformité) et 002a
  (`mfa_audit_events`).

- **Principe II (Vie privée et Loi 25)** — l'effacement d'un compte utilisateur
  doit être possible de bout en bout (FR-037). Concrètement, la feature 023
  (`EraseUserDataUseCase`) exécute `DELETE FROM auth_users WHERE id = ?`.

Sans précaution architecturale, ces deux principes s'auto-bloquent :

1. Avec une FK Prisma `actor: AuthUser? @relation(..., onDelete: SetNull)` :
   le `DELETE FROM auth_users` déclenche un `UPDATE auth_audit_events SET
   actorUserId = NULL` que le trigger d'immutability **rejette**. L'utilisateur
   devient indélébile → violation Loi 25.

2. Avec une FK `onDelete: Cascade` : le `DELETE` cascade en `DELETE FROM
   auth_audit_events` que le trigger d'immutability **rejette aussi**. Idem.

## Décision

`auth_audit_events` n'a **AUCUNE FK Prisma** vers `auth_users`. Les colonnes
`actorUserId` et `targetUserId` sont des `Uuid?` nus — pas de `@relation`.

Pour préserver la corrélation auditable pendant que le compte vit, deux
colonnes supplémentaires hashent l'email normalisé :

- `actorEmailHash` : `VARCHAR(64)` = SHA-256 base64 de `normalizeEmail(actorEmail)`
- `targetEmailHash` : `VARCHAR(64)` = SHA-256 base64 de `normalizeEmail(targetEmail)`

Le SHA-256 est irréversible côté attaquant (32 octets d'entropie). Côté
admin avec connaissance d'un email candidat, le hash permet la recherche
auditée (`WHERE targetEmailHash = sha256(suspect_email)`).

## Conséquences

### Positives

1. **Effacement Loi 25 fonctionne** : `DELETE FROM auth_users` ne touche pas
   à `auth_audit_events`. La trace reste intacte. L'utilisateur est complètement
   supprimé des tables FK-cascadées (`auth_accounts`, `auth_sessions`, tokens,
   outbox).

2. **Audit immuable préservé** : aucune UPDATE/DELETE ne s'exécute jamais sur
   `auth_audit_events`. Les triggers d'immutability restent un rempart fort
   sans exception.

3. **Corrélation auditable post-effacement** : un auditeur interne avec
   connaissance d'un email candidat (e.g., réquisition légale, plainte
   utilisateur) peut hash l'email et requêter le journal — sans que la
   plateforme conserve l'email en clair.

4. **Pas d'exception fragile dans les triggers** : la solution évite la
   tentation d'écrire un trigger conditionnel `IF (OLD.actorUserId IS NOT
   NULL AND NEW.actorUserId IS NULL) THEN allow ELSE reject` qui serait
   complexe et fragile.

### Négatives

1. **UUID orphelins en lecture** : un audit log post-effacement contient un
   `actorUserId` qui pointe vers un UUID inexistant. Le lookup retourne 0 row.
   Documenter dans la vue/UI admin pour ne pas créer de confusion.

2. **Pas de jointure Prisma directe** : pour afficher un audit log avec le
   nom du user, il faut un lookup explicite côté application (qui retournera
   éventuellement « utilisateur supprimé »).

3. **Le hash email est une PII pseudonymisée mais corrélable** : la Loi 25
   ne demande pas d'effacement irréversible total (l'audit est une exception
   contractuelle au droit à l'effacement, déjà actée en feature 001). Si
   une politique future exigeait l'effacement strict, il faudrait aussi
   nullifier les hash — mais cela contredirait Principe IX.

4. **Pattern à généraliser ?** L'audit MFA (002a) a la même contradiction
   non explicitement résolue. À reviewer post-livraison 002 pour décider
   si on aligne `mfa_audit_events` sur le même pattern.

## Alternatives rejetées

### A. FK `onDelete: SetNull` + trigger d'immutability avec exception whitelistée

Le trigger d'immutability vérifierait `IF (OLD.actorUserId IS NOT NULL
AND NEW.actorUserId IS NULL AND OLD.actorIp = NEW.actorIp ...) THEN
RETURN NULL` (autorise l'UPDATE de cascade Loi 25 uniquement).

**Rejetée** : trop fragile. Difficile à tester exhaustivement. Risque
qu'un bug futur dans le whitelist autorise des UPDATEs malicieuses.

### B. Table d'audit anonymisée séparée par compte

Une table `auth_audit_events_<userId_hash>` séparée pour chaque compte,
supprimable en un `DROP TABLE` au moment de l'effacement.

**Rejetée** : explosion combinatoire des tables (potentiellement 500+
tables pour 500 conseillers). Impossible à requêter globalement. Anti-pattern.

### C. Chiffrement de la PII dans l'audit avec clé par-user

Chaque audit row stockerait l'email chiffré avec une clé spécifique au
user, supprimée au moment de l'effacement Loi 25 → la PII chiffrée devient
illisible (crypto-shredding).

**Rejetée** : architecturalement intéressante mais ajoute beaucoup de
complexité (gestion de clés par-user, KMS) sans bénéfice net vs le hash
SHA-256 qui produit le même résultat fonctionnel (pseudonymisation).

### D. Pas d'audit logging du tout

Évite la contradiction en supprimant le journal. **Rejetée** absolument :
viole Principe IX OWASP A09 ; bloque toute investigation post-incident.

## Implémentation

- Migration `20260527000000_init_auth_credentials` crée la table sans aucune
  contrainte FK sur `actorUserId` / `targetUserId`.
- Modèle Prisma `AuthAuditEvent` dans `auth-credentials.prisma` ne déclare
  aucune `@relation`.
- Le port `AuthAuditWriter.append()` accepte `actorEmail` / `targetEmail`
  optionnels ; l'adapter Prisma applique SHA-256 base64 avant INSERT.
- L'effacement Loi 25 (feature 023) ne touche **pas** à `auth_audit_events`.

## Liens

- `specs/006-auth-conseiller-admin/data-model.md` § AuthAuditEvent
- `specs/006-auth-conseiller-admin/research.md` § R11
- Review architecte sénior : finding **H7** (résolu par cette ADR)
- Constitution `.specify/memory/constitution.md` Principe IX + Principe II
- ADR-0010 (chiffrement secret TOTP) — autre pattern de pseudonymisation
- 002a `mfa_audit_events` — pattern à reviewer post-002 pour cohérence
