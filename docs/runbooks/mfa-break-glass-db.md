# Runbook — Break-glass DB : récupération MFA admin verrouillé (dernier recours)

**Statut** : actif depuis livraison feature 005
**Owner** : équipe infra + porteur produit (double validation requise)
**Documents liés** :
- [Spec 005 § US4 — Reset MFA admin](../../specs/005-mfa-conseiller/spec.md)
- [Runbook politique 2 admins actifs](mfa-2-admins-actifs.md)
- [Plan 005 § Sécurité applicative (Principe IX)](../../specs/005-mfa-conseiller/plan.md)

---

## Quand utiliser cette procédure

**Uniquement** quand TOUS les chemins normaux sont épuisés :
- Le user à débloquer est **admin** (pas conseiller)
- Cet admin a perdu son device TOTP **ET** ses backup codes
- **Aucun autre admin actif** ne peut le reset via US4 (la politique
  « ≥ 2 admins actifs » a été violée à un moment dans le passé)

Si un autre admin actif existe : utiliser le chemin normal documenté
dans [`mfa-2-admins-actifs.md`](mfa-2-admins-actifs.md) § Cas 1. NE
PAS exécuter cette procédure inutilement.

---

## Pré-requis

1. **Double validation** : la procédure exige **deux personnes
   habilitées** présentes physiquement ou en visio synchrone :
   - 1 membre infra avec accès console AWS production
   - 1 porteur produit / lead technique
2. **Authentification de l'admin demandeur** confirmée hors-bande :
   - Appel téléphonique au numéro de la fiche RH
   - Vérification d'un document d'identité avec photo
   - Échange courriel professionnel attestant la demande
   - Idéalement : visio en direct avec carte d'identité visible
3. **Ticket d'incident ouvert** dans le système de support, avec
   description complète et accusé reçu signé par l'admin demandeur

---

## Procédure pas-à-pas

### Étape 1 — Accès DB production (région ca-central-1)

1. Connexion à l'AWS console (compte production)
2. Session Manager → instance bastion `cv-prod-bastion`
3. Tunnel SSH vers Postgres RDS :
   ```bash
   aws ssm start-session \
     --target i-<bastion_id> \
     --document-name AWS-StartPortForwardingSession \
     --parameters '{"portNumber":["5432"],"localPortNumber":["5433"]}' \
     --region ca-central-1
   ```
4. Connexion `psql` via tunnel local :
   ```bash
   psql -h localhost -p 5433 -U cv_prod_admin -d cv_prod
   ```
   Mot de passe DB admin lu depuis Secrets Manager
   `arn:aws:secretsmanager:ca-central-1:<account>:secret:cv-prod-db-admin`.

### Étape 2 — Identification de l'admin cible

```sql
SELECT id, email, role, "createdAt", "deletedAt"
FROM auth_users
WHERE email = 'admin-perdu@exemple.ca'
  AND role = 'admin'
  AND "deletedAt" IS NULL;
```

Noter le `id` (UUID). Si l'admin n'existe pas ou est déjà supprimé :
**STOP**, escalader au porteur produit.

### Étape 3 — Vérification de l'état MFA actuel

```sql
SELECT id, "userId", "encryptedSecret" IS NOT NULL AS has_secret,
       "enabledAt", "lastUsedAt"
FROM mfa_secrets
WHERE "userId" = '<UUID admin cible>';

SELECT COUNT(*) AS unused_backup_codes
FROM mfa_backup_codes mbc
INNER JOIN mfa_secrets ms ON ms.id = mbc."mfaSecretId"
WHERE ms."userId" = '<UUID admin cible>' AND mbc."usedAt" IS NULL;
```

Confirmer :
- Le secret existe et est `enabledAt IS NOT NULL` (admin était bien
  enrôlé)
- Il reste des backup codes inutilisés (`unused_backup_codes > 0`) —
  **incohérent avec la demande** : l'admin devrait pouvoir se connecter
  via backup code. Si oui, **STOP** et instruire l'admin d'utiliser ses
  backup codes plutôt que cette procédure.

### Étape 4 — Reset MFA via SQL (transaction)

**ATTENTION** : cette étape est destructive. Exécuter SEULEMENT après
confirmation des deux personnes présentes (cf. pré-requis n°1).

```sql
BEGIN;

-- 1. Marquer dans le journal d'audit l'opération break-glass.
INSERT INTO mfa_audit_events
  (id, "eventType", "actorUserId", "targetUserId", "targetRole",
   "actorIp", justification, metadata, "occurredAt")
VALUES
  (gen_random_uuid(),
   'mfa_reset_by_admin',
   NULL,  -- pas d'admin acteur (procédure break-glass)
   '<UUID admin cible>',
   'admin',
   NULL,
   'BREAK-GLASS DB : reset MFA exécuté hors application après '
   || 'épuisement des chemins normaux. Ticket: INC-XXXXX. '
   || 'Opérateurs présents : <nom1> (infra) + <nom2> (produit). '
   || 'Auth hors-bande : appel + ID photo confirmés à HH:MM.',
   jsonb_build_object(
     'breakGlass', true,
     'ticketId', 'INC-XXXXX',
     'operators', jsonb_build_array('<nom1>', '<nom2>')
   ),
   NOW());

-- 2. Supprimer les backup codes du user.
DELETE FROM mfa_backup_codes
WHERE "mfaSecretId" IN (
  SELECT id FROM mfa_secrets WHERE "userId" = '<UUID admin cible>'
);

-- 3. Supprimer le secret TOTP.
DELETE FROM mfa_secrets WHERE "userId" = '<UUID admin cible>';

-- 4. Invalider toutes les sessions actives du user.
DELETE FROM auth_sessions WHERE "userId" = '<UUID admin cible>';

-- 5. Invalider les buckets de rate limit du user.
DELETE FROM mfa_rate_limit_buckets WHERE "userId" = '<UUID admin cible>';

-- 6. Vérification : 0 lignes attendues partout.
SELECT 'mfa_secrets' AS table_name, COUNT(*) FROM mfa_secrets WHERE "userId" = '<UUID admin cible>'
UNION ALL
SELECT 'auth_sessions', COUNT(*) FROM auth_sessions WHERE "userId" = '<UUID admin cible>';

-- Si les comptes sont à 0, COMMIT. Sinon, ROLLBACK.
COMMIT;  -- ou ROLLBACK; en cas d'anomalie
```

### Étape 5 — Vérification post-action

```sql
SELECT * FROM mfa_audit_events
WHERE "targetUserId" = '<UUID admin cible>'
ORDER BY "occurredAt" DESC
LIMIT 5;
```

Confirmer que l'événement break-glass est présent et que le
`justification` contient bien le numéro de ticket et les opérateurs.

### Étape 6 — Communication

1. Envoyer à l'admin cible (par courriel **ET** SMS au numéro fiche RH) :
   > "Votre MFA a été réinitialisé via la procédure break-glass infra
   > à HH:MM. Connectez-vous à https://app.conseiller-voyage.ca pour
   > refaire votre enrôlement TOTP. Si ce n'est pas vous qui avez fait
   > la demande, contactez IMMÉDIATEMENT le porteur produit."
2. Documenter le ticket d'incident avec :
   - Procédure exécutée
   - Heure d'exécution
   - Opérateurs présents
   - Lien vers l'entrée `mfa_audit_events`
3. Post-mortem dans la semaine : pourquoi la politique « ≥ 2 admins
   actifs » a-t-elle été violée ? Comment éviter la prochaine fois ?

---

## Audit post-action obligatoire

Dans les 7 jours suivant un break-glass :
1. Revue par le porteur produit de toute la procédure
2. Validation par le COMEX si l'admin cible est un C-level
3. Mise à jour de ce runbook si une étape était ambiguë
4. Vérifier que le compteur d'admins actifs est revenu à ≥ 2 (sinon
   recruter / promouvoir d'urgence)

---

## Restrictions et garde-fous

- **Cette procédure NE DOIT JAMAIS** être utilisée pour un user
  conseiller. Les conseillers passent par US4 (reset par admin via
  l'application). Si un conseiller a un problème : escalade au
  porteur produit, pas break-glass.
- **Pas de copie locale** des credentials DB admin. Toujours lire
  depuis Secrets Manager au moment de la procédure.
- **Pas d'exécution depuis un poste personnel non managé**. Bastion
  AWS Session Manager uniquement.
- **Pas de partage d'écran public** pendant la connexion DB
  (risque de fuite du mot de passe affiché brièvement).
