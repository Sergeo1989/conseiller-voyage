# Runbook — Bootstrap du premier administrateur

**Feature** : 002 (auth conseiller + admin)
**CLI** : `apps/api/src/cli/admin-bootstrap.ts`
**Contrat** : `specs/006-auth-conseiller-admin/contracts/cli-admin-bootstrap.md`

## Quand

Lors du déploiement initial sur un nouvel environnement (staging, prod). Une seule fois — la commande refuse de tourner si un admin existe déjà (sauf `--force` pour les tests).

## Pré-requis

- Accès SSH au runner ECS, OU exécution depuis un environnement CI bootstrap autorisé.
- Variables d'environnement chargées : `DATABASE_URL`, `AUTH_TOKEN_SECRET`.
- L'opérateur dispose d'un mot de passe fort généré ailleurs (jamais saisi en clair sur la CLI publique).

## Étapes

1. Se connecter au runner avec accès à la base Postgres ca-central-1.
2. Charger les variables d'env :
   ```bash
   source /etc/conseiller-voyage/.env.production
   ```
3. Générer un mot de passe fort temporaire :
   ```bash
   openssl rand -base64 24 | tr -d '/+=' | head -c 16
   ```
   Ajouter manuellement un symbole pour respecter la politique (`!`, `@`, `#`, etc.).
4. Exécuter la CLI :
   ```bash
   pnpm exec tsx apps/api/src/cli/admin-bootstrap.ts \
     --email admin@conseiller-voyage.ca \
     --password 'votre-mot-de-passe-temporaire' \
     --first-name Sergio \
     --last-name 'Talom Nokam'
   ```
   Exit code attendu : `0`. Sortie console : confirmation + instructions.
5. **Purger l'historique shell immédiatement** :
   ```bash
   history -c && history -w
   ```
6. Se rendre sur `https://app.conseiller-voyage.ca/connexion`, se connecter avec ces identifiants. Le système redirige automatiquement vers `/admin/mfa/enroll`.
7. Enrôler MFA (scan QR code dans Google Authenticator ou équivalent).
8. **Aller dans `Paramètres > Sécurité > Changer mon mot de passe`** et choisir un mot de passe définitif.

## Codes d'erreur

| Exit | Signification | Action |
|---|---|---|
| 0 | Succès | Continuer étape 5 |
| 1 | Erreur env / inattendue | Vérifier DATABASE_URL et AUTH_TOKEN_SECRET |
| 2 | Admin existe déjà | Utiliser `POST /admin/users` via console admin |
| 3 | Politique mot de passe non respectée | Régénérer un mot de passe conforme |
| 4 | Email invalide | Vérifier le format `@` |

## Sécurité

- Le mot de passe transmis en argv est visible dans `ps aux` pendant l'exécution. Risque OPSEC accepté car bornée à une exécution unique. Pour env hyper-sensible, ajouter `--password -` (lecture stdin — variante CLI à implémenter si besoin).
- L'historique shell est purgé après l'exécution.
- Le mot de passe doit être changé via US6 dès le premier login.

## Vérification post-exécution

```sql
SELECT id, email, role, "emailVerified" FROM auth_users WHERE role = 'admin';
-- Devrait montrer 1 row avec emailVerified NOT NULL
SELECT "eventType" FROM auth_audit_events WHERE "eventType" = 'admin_bootstrap';
-- Devrait montrer 1 row
```
