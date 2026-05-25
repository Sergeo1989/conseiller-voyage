# Quickstart — Mentions légales

**Date** : 2026-05-25

Setup local pour la feature 004 + parcours de test minimal des 5 pages,
de l'acceptation conseiller, et du double consentement voyageur.

---

## Prérequis

Le repo doit déjà être configuré pour le développement local de la feature
001 (`pnpm docker:up && pnpm db:seed:dev && pnpm dev`). Cette feature
**étend** ce setup sans le remplacer.

---

## Setup additionnel

```bash
# Installer les nouveaux packages legal + legal-content + dépendance ua-parser-js
pnpm install

# Générer le secret HMAC du cookie middleware en dev (1Password CLI)
pnpm secrets:legal:dev

# Vérifier la cohérence des fichiers MDX (pré-build check)
pnpm legal:verify

# Prévisualiser les MDX en PDF rendus (pour relecture juriste hors-line)
pnpm legal:preview
# Génère packages/legal-content/preview/<locale>/<slug>.pdf

# Seed des LegalDocuments en BD locale (calcule checksum + contentSnapshot)
pnpm --filter @cv/api db:seed:legal

# Lancer le stack complet (idem 001)
pnpm dev
```

---

## Parcours 1 — Lecture des 5 pages publiques (US1, US2, US5)

Sans authentification :

1. Ouvrir http://localhost:3000/fr/comment-ca-marche
   → vérifier l'affirmation « n'est PAS une agence de voyages »
   visible dans le `<h1>` ou un encadré en haut de page.
2. Ouvrir http://localhost:3000/fr/mentions-legales
   → vérifier présence raison sociale, NEQ, adresse, juridiction
   Montréal (valeurs temporaires en dev — remplacées par les vraies
   au moment du `/speckit.tasks`).
3. Ouvrir http://localhost:3000/fr/cgu-voyageur
   → vérifier que le texte cible le voyageur uniquement (langage,
   références à l'intake et au plafond 3 conseillers).
4. Ouvrir http://localhost:3000/fr/cgu-conseiller
   → vérifier que le texte cible le conseiller (abonnement, vérification
   CCV/TICO, conformité réglementaire).
5. Ouvrir http://localhost:3000/fr/confidentialite
   → vérifier le tableau de rétention aligné sur la constitution
   (audit 7 ans, briefs 24 mois, profils désactivés 6 mois).

Pour chaque page :

- Le footer en bas contient les 5 liens vers les pages légales.
- Tab keyboard de l'accueil → focus visible sur chaque lien.
- Lecture mobile (resize Chrome à 375 px) → touch targets ≥ 44 px.
- View source → `<meta name="description">`, OpenGraph, JSON-LD
  `WebPage` présents.

---

## Parcours 2 — Acceptation CGU conseiller au signup (US3)

1. Ouvrir http://localhost:3000/fr/conseiller/inscrire (signup flow
   livré par le module 002 identité — pour le test isolé de cette
   feature, utiliser un harness Vitest dédié à
   `AcceptCguB2bUseCase` avec fake reader/writer).
2. Remplir le formulaire signup sans cocher la case « J'accepte les CGU
   conseiller v1 ».
3. Cliquer « Créer mon compte » → vérifier rejet client (Zod) + rejet
   serveur (test d'intégration Vitest).
4. Cocher la case et soumettre.
5. Vérifier en BD locale :

   ```sql
   SELECT * FROM auth_legal_acceptances WHERE subject_id = '<userId>';
   ```

   Une row avec `document_type='cgu_b2b'`, `document_version=1`,
   `accepted_at` récent, `ip_address='::1'` (localhost).

---

## Parcours 3 — Double consentement voyageur au brief intake (US4)

Ce parcours nécessite que le module 002-voyageur-intake soit également
en cours d'implémentation. Pour le test isolé de cette feature, harness
Vitest dédié à `LegalAcceptanceFacade.acceptForBrief`.

1. POST sur l'endpoint d'intake (livré par 002) avec un payload de
   brief valide mais sans les champs `confidentialite_accepted` et/ou
   `cgu_b2c_accepted` → vérifier rejet 400.
2. POST avec les deux acceptations cochées →
   vérifier 2 rows insérées dans `auth_legal_acceptances` (une pour
   `confidentialite`, une pour `cgu_b2c`) avec le même `subject_id` =
   `briefId`.

---

## Parcours 4 — Bump de version + ré-acceptation après obsolescence (US3 sous-cas)

### Workflow de bump (process explicite)

Le bump de version est **une décision juridique**, pas technique. Process :

1. **Juriste** identifie un changement de fond dans un document légal
   (clarification d'obligation, ajout d'un droit, modification d'une
   finalité de traitement Loi 25, etc.). Distinction explicite :
   - **Bump requis** : changement qui modifie ce que le user a accepté.
   - **Pas de bump** : coquille orthographique, reformulation neutre.
2. **Juriste** rédige la nouvelle version (texte) + tag explicite
   `[BUMP]` ou `[NO-BUMP]` dans le commentaire PR.
3. **Développeur** :
   - Édite `packages/legal-content/<locale>/<slug>.mdx` (texte) ;
   - Bump `version: N → N+1` dans le frontmatter ;
   - Met à jour `publishedAt` à la date actuelle ;
   - Définit `effectiveAt` (≥ `publishedAt`, typiquement +7 jours
     pour préavis aux conseillers) ;
   - Rédige une entrée `changelog` brève (1-3 lignes, lue par le
     conseiller au moment de la ré-acceptation).
4. **Pré-PR** : `pnpm legal:verify` localement (checksum + version
   strictement croissante).
5. **PR review** : le juriste confirme le tag `[BUMP]` dans le PR. Le
   reviewer code confirme que le frontmatter est cohérent et que les
   éventuelles références cross-document (ex: lien vers une autre
   page légale) ne sont pas cassées.
6. **Post-merge déploiement** : `seed-legal-documents.ts` détecte la
   nouvelle version et l'insère en BD (calcule `contentSnapshot` à
   ce moment-là — archive figée).

### Parcours de test local

1. Bumper localement comme décrit ci-dessus (étape 3-4).
2. Re-seed : `pnpm --filter @cv/api db:seed:legal` (idempotent).
3. Vérifier en BD : `SELECT type, version, effectiveAt FROM auth_legal_documents WHERE type = 'cgu_b2b' ORDER BY version;` → 2 rows (v1 et v2 — v1 reste en BD pour archive).
4. Se connecter au tableau de bord conseiller en tant qu'utilisateur
   qui a accepté la version 1.
5. Tenter d'accéder à `/fr/conseiller/leads` → vérifier :
   - Si `effectiveAt` futur → pas encore de redirection (transition
     douce, conseiller voit la v2 annoncée mais pas obligée).
   - Si `effectiveAt` passé → redirection vers
     `/fr/cgu-conseiller/re-accepter` qui affiche le `changelog` du
     frontmatter et un bouton « J'accepte la version 2 ».
6. Cliquer le bouton → vérifier qu'une 2e row est créée dans
   `auth_legal_acceptances` (`document_version=2`), qu'un nouveau cookie
   `__Host-cv.legal-version` est set avec version 2, et que le tableau
   de bord est accessible.

---

## Parcours 5 — Effacement Loi 25 (extension cross-feature)

Ce parcours dépend de l'extension de `EraseConseillerDataUseCase`
(livré en 001) pour anonymiser également les `LegalAcceptance`. Test
d'intégration dédié :

1. Créer un conseiller test + lui faire accepter `cgu_b2b` v1.
2. Déclencher `POST /api/me/erasure-request` (endpoint livré en 001).
3. Attendre que le job BullMQ `EraseConseillerDataJob` complète.
4. Requêter :

   ```sql
   SELECT subject_id, subject_id_hash, ip_address, user_agent
   FROM auth_legal_acceptances
   WHERE id = '<acceptanceId>';
   ```

   Vérifier :

   - `subject_id` est NULL.
   - `subject_id_hash` est un SHA-256 (64 chars hex).
   - `ip_address` est anonymisée (premier octet seul pour IPv4).
   - `user_agent` est anonymisé (famille seulement).

---

## Tests automatisés à exécuter

```bash
# Tests unitaires des fonctions pures + use cases
pnpm --filter @cv/api test

# Tests d'intégration Vitest (incl. trigger append-only)
pnpm --filter @cv/api test:integration

# Tests e2e Playwright des 5 pages + acceptation
pnpm --filter @cv/web test:e2e -- legal

# Tests a11y axe-core
pnpm --filter @cv/web test:a11y -- legal

# Lighthouse CI sur les 5 pages
pnpm lighthouse:legal

# Vérification cohérence MDX
pnpm legal:verify
```

Tous doivent passer avant ouverture du PR (DoD constitution).

---

## Troubleshooting

**`pnpm legal:verify` échoue avec « checksum mismatch »** :
le contenu d'un MDX a été modifié sans bump de `version` dans le
frontmatter. Soit revert la modif, soit incrémenter la version.

**Middleware Next.js redirige en boucle sur `/cgu-conseiller/re-accepter`** :
vérifier que la page de ré-acceptation elle-même est exclue du check
de version (allowlist dans le middleware sur les pathnames legal).

**Test e2e Playwright fail sur le focus visible** : Tailwind purge a
probablement enlevé les classes `focus-visible:*` parce qu'elles ne
sont utilisées dans aucun composant indexé. Ajouter `focus-visible:*`
en safelist dans `tailwind.config.ts`.
