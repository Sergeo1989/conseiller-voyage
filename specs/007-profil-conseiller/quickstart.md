# Quickstart — Profil conseiller (feature 005)

**Branche** : `007-profil-conseiller` | **Date** : 2026-05-27

Parcours de démonstration end-to-end pour le reviewer, exécutable en
local sur la stack standard (Docker Compose + LocalStack + Postgres +
Redis).

---

## Prérequis

- pnpm ≥ 9 et Node.js ≥ 22.
- Docker Desktop lancé.
- 1Password CLI installé et `op signin` complété (lecture des secrets dev).
- Repo cloné, branche `007-profil-conseiller` checkout, `pnpm install` exécuté.

---

## 1. Lancer l'environnement local

```bash
# Démarre Postgres + Redis + LocalStack (S3/SES/KMS émulés)
pnpm dev:infra:up

# Applique les migrations Prisma (inclut profil.prisma)
pnpm db:migrate:dev

# Seed les énumérations (spécialités, langues, zones) + un compte admin
pnpm db:seed
```

Vérification :

```bash
# Doit afficher les enums seedées
psql $DATABASE_URL -c "SELECT code, label_fr FROM profile_specialities ORDER BY ordre;"
```

---

## 2. Seed un conseiller `verified`

Le module conformité (001) a sa propre commande de seed. On l'utilise
pour créer un conseiller en statut `verified` avec un dossier complet.

```bash
pnpm conformite:seed-verified --email marie.dupont@example.com --prenom "Marie" --nom "Dupont"
```

Le script :

1. Crée un `AuthUser` (module identité 002) avec mot de passe par défaut.
2. Inscrit le conseiller en conformité avec un certificat CCV factice.
3. Approuve le dossier conformité → transition `pending → verified`.
4. **Émet l'event** `ConseillerConformiteChangedEvent` qui :
   - Crée automatiquement un `ConseillerProfile` (statut `incomplet`,
     pas de slug encore).
   - Planifie 3 jobs BullMQ `onboarding_reminder` (J+3, J+7, J+14).

Vérification :

```bash
psql $DATABASE_URL -c "
  SELECT cp.id, cp.statut, cp.slug, au.email
  FROM conseiller_profiles cp
  JOIN auth_users au ON au.id = cp.auth_user_id
  WHERE au.email = 'marie.dupont@example.com';
"
# Attendu : 1 ligne, statut = incomplet, slug = NULL

psql $DATABASE_URL -c "
  SELECT etape, etat, scheduled_for
  FROM profile_onboarding_reminder_schedules
  WHERE profile_id = (SELECT id FROM conseiller_profiles WHERE auth_user_id = (SELECT id FROM auth_users WHERE email = 'marie.dupont@example.com'));
"
# Attendu : 3 lignes (j3, j7, j14) en etat 'planifie'
```

---

## 3. Démarrer apps/api et apps/web

Dans deux terminaux séparés :

```bash
# Terminal 1 — API
pnpm --filter @cv/api dev

# Terminal 2 — Web
pnpm --filter @cv/web dev
```

API tourne sur `http://localhost:3001`, Web sur `http://localhost:3000`.

---

## 4. Connexion conseiller + édition de profil

1. Ouvrir `http://localhost:3000/connexion`.
2. Login `marie.dupont@example.com` + mot de passe seed (cf.
   1Password `[dev] cv-seed-conseiller-password`).
3. Compléter le step-up MFA (les codes TOTP de seed sont aussi dans
   1Password).
4. Atterrissage sur `/conseiller` (dashboard).
5. Observer :
   - Widget conformité : **vérifié**.
   - Widget profil : **incomplet** (avertissement persistant FR-012a avec
     champs manquants).
   - Widget leads : « Bientôt disponible — feature 012 ».
   - Widget facturation : « Bientôt disponible — feature 006-007 ».

6. Cliquer « Compléter mon profil ».

7. Remplir :
   - Titre : `Conseillère spécialisée croisières et famille`.
   - Biographie : (au moins 100 caractères, libre).
   - Spécialités : `Croisière`, `Famille`.
   - Langues : `Français`, `Anglais`.
   - Zones : `Caraïbes`, `Europe de l'Ouest`.
   - Années d'expérience : `8`.
   - Photo : uploader une image JPEG ≤ 5 Mo.
   - **`Afficher mon nom complet`** : décocher (= `false`, défaut FR-CA).

8. Cliquer « Sauvegarder ».

Vérification :

```bash
psql $DATABASE_URL -c "
  SELECT cp.statut, cp.slug, cp.afficher_nom_complet, cp.published_at
  FROM conseiller_profiles cp
  JOIN auth_users au ON au.id = cp.auth_user_id
  WHERE au.email = 'marie.dupont@example.com';
"
# Attendu : statut = 'pret', slug = 'marie-dupont', afficher_nom_complet = false, published_at = NOW()
```

Et les relances doivent être annulées :

```bash
psql $DATABASE_URL -c "
  SELECT etape, etat, cancelled_at
  FROM profile_onboarding_reminder_schedules
  WHERE profile_id = (SELECT id FROM conseiller_profiles WHERE slug = 'marie-dupont');
"
# Attendu : 3 lignes en etat 'annule'
```

---

## 5. Vérifier la page publique

1. Ouvrir `http://localhost:3000/conseiller/marie-dupont` (anonyme, en
   navigation privée).
2. Observer :
   - Nom affiché : **`Marie D.`** (FR-006a — `afficherNomComplet = false`).
   - Photo, biographie, spécialités, langues, zones, années visibles.
   - Certifications visibles (lues depuis conformité).
   - Section « Pourquoi je ne peux pas contacter ce conseiller
     directement ? » présente avec lien vers `/comment-ca-marche`.
   - CTA unique « Décrivez votre projet » qui pointe vers
     `/intake?suggested=<conseillerId>`.
   - **Aucun email, téléphone, ni formulaire de contact direct.**

3. Inspection HTML (DevTools) :
   - `<title>` : `Marie D. — Conseillère spécialisée croisières et famille`
   - `<meta name="description">` : extrait biographie ≤ 160 chars.
   - `<link rel="canonical" href="https://localhost:3000/conseiller/marie-dupont">`
   - JSON-LD `Person` avec `name = "Marie D."`, sans `contactPoint`.

4. Test invariant anti-marketplace :

```bash
pnpm exec tsx tools/check-no-contact-fields-profile.ts http://localhost:3000/conseiller/marie-dupont
# Sortie attendue : "OK — aucun canal de contact direct détecté."
```

---

## 6. Vérifier l'opt-in nom complet

1. Retour dashboard `/conseiller/profil`, cocher « Afficher mon nom
   complet sur ma page publique ». Sauvegarder.
2. Lire le texte d'aide : « Le nom dans l'URL de votre page publique
   reste basé sur votre nom légal, indépendamment de ce choix. » (cf.
   edge case asymétrie spec).
3. Rafraîchir `http://localhost:3000/conseiller/marie-dupont` :
   - Nom affiché passe à **`Marie Dupont`**.
   - URL inchangée (`marie-dupont`).
   - Toutes les balises meta + JSON-LD utilisent maintenant `Marie Dupont`.

---

## 7. Tester le middleware `?suggested=`

1. Naviguer (anonyme) vers `http://localhost:3000/conseiller/marie-dupont`.
2. Cliquer le CTA « Décrivez votre projet ».
3. Observer :
   - Redirection 302 vers `/intake` (URL propre, pas de `?suggested=`).
   - Cookie `cv_suggested` posé, HttpOnly + SameSite=Lax, signé HMAC.

4. Inspecter le cookie (DevTools / Application / Cookies) :
   - Valeur : `<base64>.<hmac>`.
   - Décoder le base64 pour voir le payload `{v: 1, entries: [{cid: ..., ts: ...}]}`.

5. Tester FIFO : visiter `marie-dupont` puis `un-autre-conseiller-seed`
   (à seeder), revenir à `marie-dupont` (l'entrée est déplacée en queue,
   pas dupliquée).

6. Tester sécurité : forger un cookie invalide (tamper HMAC) via
   DevTools, recharger `/intake` — le cookie est traité comme absent
   (pas d'erreur visible au voyageur, juste perte du boost).

---

## 8. Tester l'aperçu public depuis le dashboard

1. Connecté en tant que `marie.dupont`, naviguer
   `/conseiller/profil/apercu`.
2. Observer : la page rend exactement ce que le voyageur verrait, SANS
   bandeau (profil prêt + vérifié).
3. Tester l'autre cas : déconnecter, seeder un conseiller `verified`
   mais sans photo (`pnpm conformite:seed-verified --skip-photo`),
   reconnecter en tant que ce conseiller, ouvrir `/conseiller/profil/apercu` :
   - Bandeau jaune « Aperçu — non encore visible publiquement »
     avec liste « Photo manquante ».

---

## 9. Tester l'anti-énumération 404

```bash
# Slug inexistant
curl -sI http://localhost:3000/conseiller/inexistant-12345 | head -5
# Attendu : HTTP/1.1 404 Not Found

# Slug d'un profil en statut incomplet (créer un conseiller verified sans compléter le profil)
pnpm conformite:seed-verified --email pierre.tremblay@example.com --prenom "Pierre" --nom "Tremblay"
# Le profil reste incomplet (pas d'édition)
# Pierre n'a pas encore de slug (cf. immuabilité — slug généré au premier 'pret')
# Mais on peut tester un slug en réservation Loi 25 :
psql $DATABASE_URL -c "INSERT INTO slug_reservations (slug, raison) VALUES ('test-reserve', 'loi25');"
curl -sI http://localhost:3000/conseiller/test-reserve | head -5
# Attendu : HTTP/1.1 404 Not Found

# Vérifier que les deux réponses 404 sont identiques en taille
curl -s http://localhost:3000/conseiller/inexistant-12345 | wc -c
curl -s http://localhost:3000/conseiller/test-reserve | wc -c
# Attendu : valeurs identiques à l'octet près

# Test automatisé invariant
pnpm exec tsx tools/check-anti-enum-profile.ts
# Sortie attendue : "OK — 5 cas 404 produisent le même corps HTTP."
```

---

## 10. Tester la modération admin

1. Login admin (depuis `1Password [dev] cv-admin-seed-credentials`) à
   `/connexion` puis MFA.
2. Naviguer `/admin/profils`.
3. Cliquer sur `marie-dupont` dans la liste.
4. Cliquer « Masquer profil temporairement ».
5. Saisir raison : `Contenu inapproprié — test`.
6. Confirmer.
7. Observer :
   - Statut profil → `masqué_admin`.
   - Page publique `/conseiller/marie-dupont` → 404.
   - Une entrée dans `profil_moderation_audits`.
   - Un courriel transactionnel dans LocalStack SES
     (`aws --endpoint-url=http://localhost:4566 ses list-templates` ou
     vérification via Mailhog si configuré).
8. Marie connectée en tant que conseillère voit le warning :
   « Votre profil a été temporairement masqué par un administrateur.
   Raison : Contenu inapproprié — test. ».
9. Admin clique « Rétablir » → statut profil retombe à `prêt` (calcul
   dérivé), page publique redevient accessible.

---

## 11. Tester l'anonymisation Loi 25 (interne)

```bash
# Simuler l'orchestrateur 023 future
curl -X POST http://localhost:3001/api/internal/profil/<conseillerId>/anonymiser-loi25 \
  -H "X-Internal-Service-Token: $(op read 'op://Dev/cv-internal-service-token/credential')" \
  -H "Content-Type: application/json" \
  -d '{"orchestrateurReference": "loi25-test-001"}'
```

Vérifier :

```bash
psql $DATABASE_URL -c "
  SELECT statut, anonymized_at, biographie, photo_s3_key
  FROM conseiller_profiles
  WHERE slug = 'marie-dupont';
"
# Attendu : statut = 'anonymise', anonymized_at = NOW(), biographie = NULL, photo_s3_key = NULL

psql $DATABASE_URL -c "
  SELECT slug, raison FROM slug_reservations WHERE slug = 'marie-dupont';
"
# Attendu : 1 ligne, raison = 'loi25'

# Tenter de re-créer un conseiller "Marie Dupont"
pnpm conformite:seed-verified --email marie2.dupont@example.com --prenom "Marie" --nom "Dupont"
# À l'édition du profil + sauvegarde, le slug généré devrait être 'marie-dupont-2'
# (slug 'marie-dupont' réservé Loi 25 — invariant SC-007)
```

---

## 12. Lancer les tests automatisés

```bash
# Tests unitaires domaine (TDD obligatoire — Principe VI)
pnpm --filter @cv/profil-domain test

# Tests d'intégration apps/api
pnpm --filter @cv/api test:integration -- --grep profil

# Tests e2e Playwright (édition, vue publique, dashboard, modération)
pnpm --filter @cv/web test:e2e -- --grep profil

# Tests a11y (axe-core CI bloquant — Principe XI)
pnpm --filter @cv/web test:a11y -- --routes profil

# Lighthouse CI (Principe XII)
pnpm --filter @cv/web lighthouse -- --url http://localhost:3000/conseiller/marie-dupont
```

Attendus :

- `@cv/profil-domain` : ≥ 95 % de couverture.
- `@cv/api` : 100 % de tests verts.
- `@cv/web` : 100 % e2e verts, 0 violation axe-core serious/critical.
- Lighthouse : Performance ≥ 90, SEO ≥ 95, Accessibility ≥ 95.

---

## 13. Cleanup

```bash
pnpm dev:infra:down
```

---

## Démo récapitulative pour reviewer

Si le reviewer veut une démo en < 5 min :

1. `pnpm dev:infra:up` + `pnpm db:migrate:dev` + `pnpm db:seed`.
2. `pnpm conformite:seed-verified --email marie.dupont@example.com --prenom Marie --nom Dupont`.
3. `pnpm --filter @cv/web dev` (terminal 2).
4. Login → édition profil → sauvegarde → ouvrir page publique
   `/conseiller/marie-dupont` → constater anti-marketplace (CTA unique).
5. Masquer via admin → constater 404 → rétablir → constater 200.

C'est l'essence MVP. Le reste (modération, Loi 25, relances) sont des
flows périphériques mais critiques pour la conformité.
