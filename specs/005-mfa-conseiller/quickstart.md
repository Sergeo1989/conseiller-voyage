# Quickstart développeur : MFA conseiller (feature 005)

**Audience** : développeur qui démarre l'implémentation de 005.
**Pré-requis** : feature 001 mergée sur main (déjà fait) ; feature 004
mergée OU rebase régulier (PR #12 ouverte au moment d'écrire ce
quickstart — adapter en conséquence).

---

## 1. Setup local

```powershell
# Cloner et installer
git checkout 005-mfa-conseiller
pnpm install

# Démarrer la stack locale (Postgres + Redis via Docker Compose)
pnpm docker:up

# Appliquer les migrations existantes
pnpm db:migrate

# Générer la KEK locale pour le chiffrement TOTP (32 bytes Base64)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" `
  > .mfa-kek.tmp.txt
# Ajouter dans .env.development :
# MFA_KEK_BASE64=<contenu de .mfa-kek.tmp.txt>
# puis supprimer le fichier tmp
```

---

## 2. Démarrer le développement

### Ordre TDD recommandé (Principe VI)

```powershell
# Étape 1 : package mfa pur — tests d'abord
cd packages/mfa
# Écrire les tests AVANT le code (commits rouges)
pnpm test --watch

# Étape 2 : repositories + use cases (Testcontainers Postgres)
cd ../../apps/api
pnpm test:integration --filter mfa

# Étape 3 : flow web (Playwright)
cd ../web
pnpm test:e2e --filter mfa
```

### Lancer la stack en mode dev

```powershell
pnpm dev:up   # Docker + migrate + Turbo dev (web + api en parallèle)
```

Ouvrir :
- `http://localhost:3000/mfa/enroll` (côté Next)
- `http://localhost:4000/api/mfa/health` (côté Nest, doit retourner 200)
- `http://localhost:4000/api/docs` (Swagger autogen) → section "Mfa"

---

## 3. Scénarios de validation manuelle

### Scénario A — Enrôlement initial conseiller (US1)

1. Créer un compte conseiller via `/inscription`.
2. Approuver son dossier de conformité via l'interface admin
   (feature 001).
3. Se déconnecter, se reconnecter en conseiller → doit rediriger vers
   `/mfa/enroll`.
4. Scanner le QR code avec Google Authenticator / 1Password TOTP.
5. Saisir le code à 6 chiffres. Vérifier que la case
   « J'ai sauvegardé mes codes de récupération » bloque la suite tant
   que non cochée.
6. Cocher, valider → accès au tableau de bord.

### Scénario B — Step-up sur action sensible (US2)

1. Connecté en conseiller avec MFA actif, simuler une session > 30 min
   via le DevTool DB ou via :
   ```powershell
   pnpm db:studio
   # UPDATE auth_sessions SET mfaVerifiedAt = NOW() - INTERVAL '31 minutes'
   #   WHERE userId = '<uuid>';
   ```
2. Tenter d'accepter un lead (route stub `/leads/test/accept`).
3. Vérifier que le modal step-up s'ouvre.
4. Fermer le modal sans valider → l'écran précédent reste accessible
   en lecture seule, l'action sensible n'a pas eu lieu.
5. Réessayer, saisir le code TOTP correct → l'action est exécutée.

### Scénario C — Backup code (US3)

1. Sur l'écran de demande TOTP (post-login), cliquer « Utiliser un code
   de récupération ».
2. Saisir un code valide → connecté.
3. Réessayer avec le même code → refusé.
4. Consommer jusqu'à 2 codes restants → vérifier la bannière de
   warning.

### Scénario D — Reset MFA admin (US4)

1. Se connecter en admin (compte admin de test).
2. Naviguer vers `/admin/users/<targetUuid>/reset-mfa`.
3. Saisir une justification < 20 caractères → bouton désactivé.
4. Saisir une justification ≥ 20 chars → confirmer.
5. Vérifier la session de la cible est invalidée (la prochaine requête
   API → 401).
6. Vérifier l'entrée d'audit dans `mfa_audit_events`.

### Scénario E — Auto-service device change (US6)

1. Naviguer vers `/parametres/mfa/change-device`.
2. Saisir mot de passe + code TOTP de l'ancien device.
3. Compléter l'enrôlement du nouveau device.
4. Vérifier que toutes les autres sessions sont révoquées (test depuis
   un second navigateur).
5. Re-essayer le scénario avec un backup code à la place du TOTP.

---

## 4. Tests automatisés

### Unitaires (logique pure)

```powershell
cd packages/mfa
pnpm test
# Couverture cible ≥ 95 %
pnpm test --coverage
```

### Intégration (Testcontainers Postgres)

```powershell
cd apps/api
pnpm test:integration
# Includes :
# - mfa-secret-repository.test.ts
# - mfa-audit-immutability.test.ts (vérifie triggers append-only)
# - enroll-flow.test.ts
# - step-up-flow.test.ts
# - reset-admin-flow.test.ts
# - device-change-flow.test.ts
```

### E2E (Playwright)

```powershell
cd apps/web
pnpm playwright install --with-deps   # une fois
pnpm test:e2e --filter mfa
```

### A11y (axe-core, CI bloquant)

```powershell
cd apps/web
pnpm test:a11y --filter mfa
```

---

## 5. Commandes utiles

| Commande | Effet |
|---|---|
| `pnpm db:studio` | Ouvrir Prisma Studio sur la BD locale |
| `pnpm db:migrate -- --name <slug>` | Créer une nouvelle migration |
| `pnpm check:mfa-secrets-not-leaked` | Linter custom : grep pour patterns Base32 ≥ 16 chars dans les logs |
| `pnpm mfa:simulate-locked-user <userId>` | Outil de support : afficher l'état d'un user verrouillé |

---

## 6. Pièges connus

- **Decalage d'horloge** : le TOTP exige que device et serveur soient à
  ±30 s. En dev sur WSL2, vérifier `date` sur l'hôte vs le container —
  une dérive de 5 min suffit à faire échouer tous les codes.
- **Cookies cross-origin** : Auth.js v5 utilise `__Host-cv.session.token`
  en prod (HTTPS only). En dev, le fallback `authjs.session-token` est
  activé (cf. `apps/api/src/modules/identite/interface/auth.guard.ts`).
- **KEK manquante** : si `MFA_KEK_BASE64` n'est pas définie, le module
  refuse de démarrer avec une erreur explicite — chercher
  `KekNotConfiguredError` dans `apps/api/src/main.ts`.
- **Tests Testcontainers lents au premier run** : le pull de
  `postgres:16-alpine` prend ~1 min. Suivants instantanés.

---

## 7. Lien vers les autres documents

- [Spec fonctionnelle](spec.md)
- [Plan d'implémentation](plan.md)
- [Recherche technique](research.md)
- [Modèle de données](data-model.md)
- [Contrats](contracts/)

---

## 8. Definition of Done

Voir checklist `Definition of Done` dans [plan.md](plan.md). Tout doit
être coché avant ouverture du PR.
