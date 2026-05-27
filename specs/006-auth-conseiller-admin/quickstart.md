# Quickstart — feature 002 (Auth conseiller + admin)

**Plan parent** : [plan.md](plan.md)

Démarrage rapide pour un reviewer ou un développeur qui découvre la feature. Ce flow valide les 7 user stories en un parcours linéaire de ~15 minutes.

---

## Pré-requis

```bash
# Containers locaux : Postgres + Redis + LocalStack (SES)
pnpm docker:up

# Migrations Prisma (inclut les 3 nouvelles migrations auth_credentials)
pnpm db:migrate

# Variables d'env (déjà dans .env.dev livré par 002a, ajout AUTH_TOKEN_SECRET)
echo "AUTH_TOKEN_SECRET=$(openssl rand -base64 32)" >> .env.dev

# Lancer le dev stack
pnpm dev:up
```

L'API est disponible sur `http://localhost:3001`, le front Next.js sur `http://localhost:3000`.

---

## 1. Bootstrap du premier admin (US7 scénario 1)

```bash
pnpm exec tsx apps/api/src/cli/admin-bootstrap.ts \
  --email admin@test.local \
  --password 'BootStrong!2026-Dev' \
  --first-name Sergio \
  --last-name 'Talom Nokam'
```

**Attendu** : exit 0, message « PROCHAINE ÉTAPE : aller sur /connexion ... ».

Vérification DB (via Adminer sur http://localhost:8080) :

```sql
SELECT id, email, role, "emailVerified" FROM auth_users WHERE role = 'admin';
-- 1 row, emailVerified = NOW()

SELECT provider, "providerAccountId", "password_hash" IS NOT NULL FROM auth_accounts;
-- 1 row, provider='credentials', providerAccountId='admin@test.local', password_hash NOT NULL

SELECT "eventType", "actorUserId", "targetUserId" FROM auth_audit_events;
-- 1 row : eventType='admin_bootstrap', actorUserId=NULL, targetUserId=<admin id>
```

---

## 2. Login admin + enrôlement MFA J1 (US2 + héritage 002a US5)

1. Ouvrir `http://localhost:3000/connexion`.
2. Saisir `admin@test.local` + `BootStrong!2026-Dev`.
3. **Attendu** : redirection automatique vers `/admin/mfa/enroll` (FR-011).
4. Scanner le QR code avec Google Authenticator, saisir le code TOTP, cocher les 10 backup codes (flow 002a).
5. **Attendu** : session admin pleinement active, redirection vers `/admin`.

Vérification DB :

```sql
SELECT "eventType", "occurredAt" FROM auth_audit_events ORDER BY "occurredAt" DESC LIMIT 5;
-- événements visibles : login_success, mfa_enrolled (002a)
```

---

## 3. Signup conseiller self-service (US1)

1. Ouvrir `http://localhost:3000/inscription` (ouvrir en navigation privée pour ne pas écraser la session admin).
2. Saisir :
   - Email : `maxime@test.local`
   - Mot de passe : `Maxime!Strong-2026`
   - Prénom : `Maxime`
   - Nom : `Lévesque`
   - Cocher les 2 cases CGU + Loi 25.
3. Soumettre.
4. **Attendu** : page de confirmation post-signup affichant « Si ce courriel n'est pas déjà utilisé... ». Bouton « Renvoyer » désactivé avec countdown 60s.

Vérification DB :

```sql
SELECT email, role, "emailVerified" FROM auth_users WHERE email = 'maxime@test.local';
-- 1 row, role='conseiller', emailVerified = NULL

SELECT "templateKind", payload->>'firstName' FROM auth_outbox_emails WHERE "recipientEmail" = 'maxime@test.local';
-- 1 row, templateKind='email_verification', firstName='Maxime'

SELECT "jwtNonce", "expiresAt" FROM auth_email_verification_tokens WHERE "userId" = (SELECT id FROM auth_users WHERE email = 'maxime@test.local');
-- 1 row, expiresAt ≈ NOW() + 24h
```

---

## 4. Vérification de courriel (US3)

Le worker SES n'étant pas branché en dev (feature 003), récupérer le token directement depuis la DB :

```sql
SELECT 'http://localhost:3000/verifier-email/' || payload->>'token' AS verification_url
FROM auth_outbox_emails
WHERE "recipientEmail" = 'maxime@test.local'
  AND "templateKind" = 'email_verification'
ORDER BY "createdAt" DESC
LIMIT 1;
```

1. Coller l'URL dans le navigateur (toujours en navigation privée).
2. **Attendu** : redirection vers `/connexion?verified=1` avec bandeau de succès.

Vérification DB :

```sql
SELECT email, "emailVerified" FROM auth_users WHERE email = 'maxime@test.local';
-- emailVerified = NOW()

SELECT "consumedAt" FROM auth_email_verification_tokens WHERE "userId" = (SELECT id FROM auth_users WHERE email = 'maxime@test.local');
-- consumedAt = NOW()

SELECT "eventType" FROM auth_audit_events WHERE "targetUserId" = (SELECT id FROM auth_users WHERE email = 'maxime@test.local');
-- événements : signup, email_verified
```

---

## 5. Login conseiller non-vérifié (US2 scénario 3, redirect MFA enroll)

Pour tester la redirection vers `/mfa/enroll`, il faut que le conseiller soit `verified` côté conformité (feature 001). En dev :

```sql
-- Simuler le passage en "verified" (raccourci dev — en prod, c'est le flow conformité 001)
-- Cf. specs/001-conformite-module/data-model.md pour le vrai flow.
-- Ici, on suppose qu'on bypass et on teste la redirection.
```

1. Se connecter avec `maxime@test.local` + `Maxime!Strong-2026`.
2. Si conformité=`pending` → redirection vers `/conseiller/conformite` (flow 001, hors scope 002).
3. Si conformité=`verified` (forcé en DB pour le test) → redirection vers `/mfa/enroll` (FR-010).

Vérification DB :

```sql
SELECT "eventType", metadata->>'reason' FROM auth_audit_events
WHERE "targetUserId" = (SELECT id FROM auth_users WHERE email = 'maxime@test.local')
ORDER BY "occurredAt" DESC LIMIT 3;
-- ... login_success en tête
```

---

## 6. Reset de mot de passe oublié (US5)

1. Logout (`/connexion`, lien « Mot de passe oublié »).
2. Ouvrir `http://localhost:3000/mot-de-passe-oublie`.
3. Saisir `maxime@test.local`, soumettre.
4. **Attendu** : message « Si ce courriel existe, vous recevrez un courriel... ».

Récupérer le token depuis l'outbox :

```sql
SELECT 'http://localhost:3000/mot-de-passe-reinitialiser/' || payload->>'token' AS reset_url
FROM auth_outbox_emails
WHERE "recipientEmail" = 'maxime@test.local'
  AND "templateKind" = 'password_reset'
ORDER BY "createdAt" DESC
LIMIT 1;
```

5. Coller l'URL, saisir un nouveau mot de passe `Maxime!NouveauX-2026`, soumettre.
6. **Attendu** : message de succès + lien retour vers `/connexion`. Toutes les sessions actives de Maxime sont fermées (vérifier `auth_sessions`).
7. Se reconnecter avec le nouveau mot de passe : succès.
8. Tenter de se reconnecter avec l'ancien mot de passe : 401.

Vérification DB :

```sql
SELECT "consumedAt", "invalidatedAt" FROM auth_password_reset_tokens
WHERE "userId" = (SELECT id FROM auth_users WHERE email = 'maxime@test.local');
-- 1 row consumedAt=NOW (le token utilisé), 0 row invalidatedAt (aucun autre actif)

SELECT "eventType" FROM auth_audit_events
WHERE "targetUserId" = (SELECT id FROM auth_users WHERE email = 'maxime@test.local')
ORDER BY "occurredAt" DESC LIMIT 5;
-- événements : password_reset_completed, password_reset_requested, login_success...
```

---

## 7. Lockout par échec login (US2 scénario 5)

1. Sur `/connexion`, tenter 5 fois consécutives un mauvais mot de passe pour `maxime@test.local`.
2. Au 6ᵉ essai (même avec le bon mot de passe), **attendu** : message « Votre compte est temporairement bloqué pendant 15 minutes ».

Vérification DB :

```sql
SELECT kind, "failureCount", "windowStartAt" FROM auth_login_lockout_buckets
WHERE "accountId" = (SELECT id FROM auth_users WHERE email = 'maxime@test.local')::uuid;
-- 1 row kind='login_account', failureCount=5, windowStartAt ≈ il y a quelques secondes

SELECT "eventType" FROM auth_audit_events ORDER BY "occurredAt" DESC LIMIT 6;
-- login_locked en tête, puis 5x login_failed
```

3. Attendre 15 min OU forcer en DB :

```sql
UPDATE auth_login_lockout_buckets SET "windowStartAt" = NOW() - INTERVAL '20 minutes'
WHERE "accountId" = (SELECT id FROM auth_users WHERE email = 'maxime@test.local')::uuid;
```

4. Re-tenter login avec bon mot de passe → succès, bucket reset.

---

## 8. Changement de mot de passe authentifié (US6)

1. Connecté en tant que Maxime, aller dans `Paramètres > Sécurité > Changer mon mot de passe`.
2. **Si MFA actif** : un modal step-up demande un code TOTP frais (héritage 002a). Saisir et valider.
3. Saisir l'ancien mot de passe `Maxime!NouveauX-2026`, nouveau `Maxime!Encore-2026` × 2.
4. Soumettre.
5. **Attendu** : message « Votre mot de passe a été changé. Les autres sessions actives ont été déconnectées. »
6. Vérifier qu'une session ouverte sur un autre navigateur a été fermée (page protégée renvoie vers `/connexion`).

---

## 9. Logout (US4)

1. Cliquer « Se déconnecter » dans le menu utilisateur.
2. **Attendu** : redirection `/connexion`. Tentative d'accès à `/conseiller` renvoie vers `/connexion`.

---

## 10. Invitation admin (US7 scénario 2)

1. Connecté en tant qu'admin (`admin@test.local` avec MFA), aller dans `/admin/utilisateurs/nouveau`.
2. Saisir `admin2@test.local`, soumettre.
3. **Attendu** : message « Invitation envoyée. Expire dans 72 heures. ».

Récupérer le token :

```sql
SELECT 'http://localhost:3000/admin/accepter-invitation/' || payload->>'token' AS invitation_url
FROM auth_outbox_emails
WHERE "recipientEmail" = 'admin2@test.local'
  AND "templateKind" = 'admin_invitation';
```

4. Coller l'URL en navigation privée. Saisir prénom + nom + mot de passe + cocher CGU/Loi 25.
5. **Attendu** : session admin2 ouverte automatiquement + redirection vers `/admin/mfa/enroll`.

---

## Validation finale

Tous les flows ci-dessus exercent :

- ✅ US1 (signup) — étape 3
- ✅ US2 (login) — étapes 2, 5, 7
- ✅ US3 (verify email) — étape 4
- ✅ US4 (logout) — étape 9
- ✅ US5 (password reset) — étape 6
- ✅ US6 (password change) — étape 8
- ✅ US7 (admin bootstrap + invitation) — étapes 1, 10

À l'issue de ce parcours, lancer :

```bash
pnpm lint
pnpm typecheck
pnpm --filter @cv/auth-domain test
pnpm --filter @cv/api test:integration
```

Tout doit passer (cible 100 % vert).
