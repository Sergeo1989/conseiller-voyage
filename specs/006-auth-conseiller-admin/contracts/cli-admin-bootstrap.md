# Contrat — CLI `pnpm exec tsx apps/api/src/cli/admin-bootstrap.ts`

**User Story** : US7 scénario 1 — Bootstrap du tout premier admin (P2)
**FR couverts** : FR-029, FR-031, FR-032

## Auth

Local exécutable. Exécuté par un opérateur infrastructure ayant accès SSH/local au runner ou à un environnement de bootstrap (CI initial, conteneur d'amorçage).

**Garde-fou** : la commande exit avec code 2 si `COUNT(*) FROM auth_users WHERE role='admin' >= 1`. Empêche un usage abusif ultérieur — l'invitation admin-par-admin (`POST /admin/users`) est la voie normale dès qu'un admin existe.

## Invocation

```bash
pnpm exec tsx apps/api/src/cli/admin-bootstrap.ts \
  --email admin@conseiller-voyage.ca \
  --password 'TempStrong!Pass-2026' \
  --first-name Sergio \
  --last-name 'Talom Nokam'
```

Variables d'environnement requises :
- `DATABASE_URL`
- `AUTH_TOKEN_SECRET` (pas utilisé directement ici mais validé au boot du loader env.ts)
- `NODE_ENV` — accepte `development`, `staging`, `production`.

## Options CLI

| Flag | Type | Obligatoire | Valeur |
|---|---|---|---|
| `--email` | string | oui | Email valide RFC 5321 |
| `--password` | string | oui | Plaintext, doit satisfaire `validatePasswordPolicy` |
| `--first-name` | string | oui | 2..50 chars |
| `--last-name` | string | oui | 2..50 chars |
| `--force` | boolean | non | Permet d'exécuter même si un admin existe déjà (à utiliser uniquement pour le bootstrap d'environnement de test) |

Le mot de passe est **transmis en argv** pour simplifier le runbook. Risque OPSEC accepté car :
1. La commande est exécutée **une seule fois** sur un environnement neuf, bornée temporellement.
2. Le mot de passe est marqué temporaire dans le runbook et **doit être changé par US6** au premier login.
3. L'historique shell (bash history) doit être purgé après exécution — documenté dans `docs/runbooks/bootstrap-admin.md`.

Alternative pour les opérateurs paranoïaques : passer `--password -` lit le mot de passe sur stdin (jamais en argv).

## Sorties

### Succès

```text
[bootstrap] Création de l'admin Sergio Talom Nokam (admin@conseiller-voyage.ca)...
[bootstrap] ✓ AuthUser créé (id=...)
[bootstrap] ✓ AuthAccount credentials créé (bcrypt cost 11 sur SHA-256 pré-hash)
[bootstrap] ✓ AuthAuditEvent admin_bootstrap enregistré
[bootstrap]
[bootstrap] PROCHAINE ÉTAPE : aller sur https://app.conseiller-voyage.ca/connexion,
[bootstrap] se connecter avec ces identifiants, puis enrôler MFA immédiatement
[bootstrap] (redirect automatique vers /admin/mfa/enroll).
[bootstrap]
[bootstrap] N'OUBLIEZ PAS de changer le mot de passe temporaire après l'enrôlement
[bootstrap] MFA, via Paramètres > Sécurité.

Exit code: 0
```

### Erreur — admin existe déjà (sans --force)

```text
[bootstrap] ✗ ERREUR : un admin existe déjà (count=1).
[bootstrap]   Utilisez POST /admin/users via la console admin pour ajouter un admin.
[bootstrap]   Pour forcer (test only), passez --force.

Exit code: 2
```

### Erreur — politique mot de passe

```text
[bootstrap] ✗ ERREUR : politique de mot de passe non respectée :
[bootstrap]   - Au moins 12 caractères
[bootstrap]   - Au moins 1 majuscule, 1 minuscule, 1 chiffre, 1 symbole
[bootstrap]   - Ne pas contenir l'email ou le prénom

Exit code: 3
```

### Erreur — email mal formé

```text
[bootstrap] ✗ ERREUR : email invalide.

Exit code: 4
```

## Side effects

- INSERT `auth_users` { id=uuid, email, role='admin', emailVerified=NOW(), name=`${firstName} ${lastName}` }.
- INSERT `auth_accounts` { provider='credentials', providerAccountId=normalizeEmail(email), password_hash=bcrypt(base64(sha256(password)), cost=11) }.
- INSERT `auth_audit_events` { eventType='admin_bootstrap', actorUserId=NULL, targetUserId=newUserId, actorEmailHash=NULL, targetEmailHash=sha256(normalizedEmail), actorIp=NULL, metadata={ source: 'cli_bootstrap' } }.

**Aucun courriel envoyé** (pas d'INSERT outbox) — l'opérateur a le mot de passe sous la main, pas besoin de courriel d'invitation.

**Pas de MFA enrôlé** (`mfaSecrets = []`). Au premier login, le redirect vers `/admin/mfa/enroll` est forcé par la politique J1 (FR-031, héritage 002a US5).

## Tests d'intégration

- ✅ Bootstrap nominal sur base vide → exit 0 + INSERT user/account/audit
- ✅ Bootstrap avec un admin existant (sans --force) → exit 2, pas de side effect
- ✅ Bootstrap avec un admin existant + --force → exit 0 + INSERT (test only)
- ✅ Bootstrap avec mot de passe trop court → exit 3
- ✅ Bootstrap avec email mal formé → exit 4
- ✅ Bootstrap avec NODE_ENV=production sans AUTH_TOKEN_SECRET set → exit 1 (validation env.ts)
- ✅ Bootstrap avec `--password -` (stdin) → fonctionne identique à argv
- ✅ L'admin créé peut se connecter via API login et obtient redirect /admin/mfa/enroll

## Runbook

`docs/runbooks/bootstrap-admin.md` — ≤ 1 page, contient :

1. Pré-requis : accès SSH au runner ou exécution depuis CI bootstrap pipeline.
2. Charger `.env.production` avec `DATABASE_URL` + `AUTH_TOKEN_SECRET`.
3. Générer un mot de passe temporaire fort (commande `openssl rand -base64 24 | tr -d '/+=' | head -c 16` + ajout manuel d'un symbole).
4. Lancer la commande CLI ci-dessus.
5. Purger l'historique shell : `history -c && history -w`.
6. Procéder au login + enrôlement MFA + changement de mot de passe immédiat.
