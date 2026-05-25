# @cv/legal-content

Contenu éditorial des 5 documents légaux de Conseiller Voyage en MDX.

## Structure

```
packages/legal-content/
├── fr-CA/                           # contenu canonique (FR-CA primary, Principe IV)
│   ├── mentions-legales.mdx
│   ├── cgu-voyageur.mdx
│   ├── cgu-conseiller.mdx
│   ├── confidentialite.mdx
│   └── comment-ca-marche.mdx
└── en/                              # placeholders vides au MVP, traduction différée
    └── (idem, contenu à traduire post-MVP)
```

## Frontmatter obligatoire

Cf. [`specs/004-mentions-legales/contracts/mdx-frontmatter.md`](../../specs/004-mentions-legales/contracts/mdx-frontmatter.md) pour le contrat complet.

Champs requis :

```yaml
---
type: cgu_b2b                  # LegalDocumentType (enum)
version: 3                     # int monotone par type
slug: cgu-conseiller           # URL slug
title: Conditions générales d'utilisation — Conseiller
description: ≤ 160 chars meta description
publishedAt: 2026-05-25T00:00:00Z
effectiveAt: 2026-06-01T00:00:00Z
locale: fr-CA
changelog: |
  - (optionnel) résumé des changements vs version précédente
---
```

## Workflow de bump de version

Cf. [`docs/runbooks/legal-version-bump.md`](../../docs/runbooks/legal-version-bump.md) (à venir, T101).

Procédure synthétique :

1. Juriste annote modification + tag `[BUMP]` ou `[NO-BUMP]` dans le PR.
2. Développeur édite MDX + bumpe `version` dans frontmatter si `[BUMP]`.
3. `pnpm legal:verify` localement (vérifie checksum + cohérence).
4. PR review : reviewer code confirme le tag.
5. Post-merge déploiement : `seed-legal-documents.ts` insère la
   nouvelle version en BD (`auth_legal_documents`).

## Validation CI

- `pnpm legal:verify` (alias `tsx tools/check-legal-mdx.ts`) vérifie :
  - Frontmatter conforme au schéma Zod
  - Unicité `(type, version)` à travers tous les MDX
  - Strict-croissance par type
  - `effectiveAt >= publishedAt`
  - **Drift de checksum** : si version inchangée mais contenu modifié,
    erreur bloquante (force le bump explicite).

Wired en CI dans `.github/workflows/ci.yml`.
