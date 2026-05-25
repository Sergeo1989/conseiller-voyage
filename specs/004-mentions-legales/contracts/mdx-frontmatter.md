# Contract — Format frontmatter des fichiers MDX

**Localisation** : `packages/legal-content/<locale>/<slug>.mdx`

**Date** : 2026-05-25

Tous les fichiers MDX éditoriaux de cette feature respectent le même
format de frontmatter YAML pour permettre un build deterministe et un
seed automatique de la table `auth_legal_documents`.

---

## Format

```yaml
---
type: cgu_b2b                  # LegalDocumentType (enum)
version: 3                     # Entier positif monotone par type
slug: cgu-conseiller           # Slug URL (FR-CA primary)
title: Conditions générales d'utilisation — Conseiller   # Titre court
description: >                 # Meta description SEO (≤ 160 chars)
  Conditions d'utilisation de la plateforme pour les conseillers en
  voyage vérifiés CCV/TICO.
publishedAt: 2026-05-25T00:00:00Z       # ISO 8601 UTC
effectiveAt: 2026-06-01T00:00:00Z       # ISO 8601 UTC, ≥ publishedAt
locale: fr-CA                  # ISO 639-1 + ISO 3166-1
changelog: |                   # Optionnel — résumé des changements vs version précédente
  - Clarification de la clause de juridiction (Montréal explicite).
  - Mise à jour du tableau de rétention (alignement constitution v2.2.0).
---

# Conditions générales d'utilisation — Conseiller

[corps MDX standard ici]
```

---

## Champs

| Champ | Type | Obligatoire | Validation |
|---|---|---|---|
| `type` | string | ✅ | Un de `mentions_legales`, `cgu_b2c`, `cgu_b2b`, `confidentialite`, `comment_ca_marche` |
| `version` | int ≥ 1 | ✅ | Strictement croissant par `type` (vérifié par script de build) |
| `slug` | string | ✅ | URL-safe (a-z, 0-9, tiret), unique par locale |
| `title` | string | ✅ | Utilisé comme `<title>` HTML et `<h1>` |
| `description` | string | ✅ | ≤ 160 caractères pour meta description SEO |
| `publishedAt` | ISO 8601 | ✅ | Date d'insertion en BD |
| `effectiveAt` | ISO 8601 | ✅ | ≥ `publishedAt`. Date à partir de laquelle l'acceptation devient requise. |
| `locale` | string | ✅ | `fr-CA` au MVP, `en` placeholder, autres différés |
| `changelog` | string | ❌ | Texte libre, affiché côté UI de ré-acceptation conseiller |

---

## Garanties build

Un script de pré-build (`tools/check-legal-mdx.ts`) **DOIT** :

1. Parser chaque MDX sous `packages/legal-content/**`.
2. Vérifier que le frontmatter respecte ce schéma Zod (rejet sinon).
3. Vérifier que les couples `(type, version)` sont uniques.
4. Vérifier que `version` est strictement croissant par `type` (la
   version 3 implique l'existence des versions 1 et 2 dans le repo
   ou dans la table `auth_legal_documents` — au moins une des deux).
5. Vérifier que `effectiveAt >= publishedAt`.
6. Calculer le checksum SHA-256 du corps MDX (hors frontmatter) et le
   comparer à celui stocké dans `auth_legal_documents` pour la même
   version. **Si checksum différent et version inchangée → ERREUR
   bloquante** (modification silencieuse). Le développeur doit soit
   revert la modif, soit bumper la version dans le frontmatter.

Ce script est wiré dans CI comme étape `pnpm legal:verify` avant
`pnpm build`.

---

## Seed initial

Un script `tools/seed-legal-documents.ts` (idempotent) inspecte
`packages/legal-content/**/*.mdx`, et pour chaque entrée :

- Calcule le checksum.
- Vérifie si une row `auth_legal_documents` existe pour
  `(type, version)`.
- Si oui et `checksum` inchangé : no-op.
- Si oui et `checksum` différent : erreur (le check de pré-build aurait
  déjà rejeté).
- Si non : insert `{ type, version, checksum, mdxPath, publishedAt,
  effectiveAt }` ; si une row précédente existe pour le même `type`
  (version inférieure), set son `supersededById` à l'id de la nouvelle.

Le script s'exécute en post-deploy (étape de release CD) après la
migration Prisma.

---

## Exemple — bump de version

État initial : `cgu_b2b` v2 publié.

Le juriste demande une clarification de juridiction. Workflow :

1. Édition de `packages/legal-content/fr-CA/cgu-conseiller.mdx` :
   - Modification du texte.
   - Bump `version: 2` → `version: 3` dans le frontmatter.
   - Mise à jour `publishedAt` à la date actuelle.
   - Set `effectiveAt` à publishedAt + 7 jours (préavis aux
     conseillers).
   - Ajout d'une entrée `changelog`.
2. `pnpm legal:verify` localement : passe (checksum différent + version
   incrémentée).
3. PR mergée sur main.
4. Pipeline CD applique la migration Prisma (si schema change — ici
   non), puis exécute `seed-legal-documents.ts` qui :
   - Insère la row `(cgu_b2b, 3)`.
   - Met `(cgu_b2b, 2).supersededById = 3.id`.
5. À partir de `effectiveAt`, le middleware Next.js redirige les
   conseillers ayant accepté v2 vers `/cgu-conseiller/re-accepter`.
   Avant `effectiveAt` : la v2 reste valide, la v3 est annoncée mais
   pas obligatoire.

---

## Tests

`packages/legal-content/__tests__/mdx-validation.test.ts` :

- Vérifie que tous les MDX sous `packages/legal-content/**` parsent.
- Vérifie que chaque frontmatter respecte le schéma Zod.
- Vérifie l'unicité `(type, version)`.
- Vérifie la croissance stricte par type.

Lance via `pnpm --filter @cv/legal-content test`. Wired en CI.
