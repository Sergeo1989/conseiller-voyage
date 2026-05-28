# ADR-0016 — Feature slicing vertical côté `apps/web` (Principe VIII.a)

**Date** : 2026-05-28
**Statut** : accepté
**Décideurs** : porteur produit, équipe technique
**Documents liés** :
- [Constitution v2.3.0 — Principe VIII et VIII.a](../../.specify/memory/constitution.md)
- [Roadmap produit](../roadmap.md)
- PR [#17](https://github.com/Sergeo1989/conseiller-voyage/pull/17) — implémentation

---

## Contexte

Au lancement du projet, le front `apps/web` s'organisait selon les
conventions Next.js par défaut :

```
apps/web/src/
├── app/[locale]/<route>/{page.tsx, actions.ts, _action.ts, _components/}
├── components/<domaine>/*.tsx
├── lib/<domaine>/{server-actions.ts, helpers.ts}
└── app/_lib/api-client.ts
```

Cette organisation a fonctionné jusqu'à la fin de feature 007 (profil
conseiller, ~50 fichiers TS/TSX par feature). À ce stade, **trois
frictions étaient mesurables** :

1. **Server Actions dispersées sur 3 lieux distincts** :
   - `src/lib/<domaine>/server-actions.ts`
   - `app/[locale]/<route>/actions.ts`
   - `app/[locale]/<route>/_action.ts`

   Conséquence : un même verbe pouvait être implémenté à deux endroits
   sans qu'on le détecte à la revue. Recherche `grep` non triviale.

2. **Pas de frontière entre logique et UI** : `components/<domaine>/`
   et `lib/<domaine>/` étaient liés implicitement par convention orale,
   sans garde-fou. Un import depuis `auth/ui` vers `profil/lib` ne
   levait aucune alerte.

3. **`app/_lib/api-client.ts`** : fuite de couche infrastructure dans
   le répertoire de routing. Conceptuellement, le client HTTP est une
   primitive partagée, pas un détail du routing.

L'API NestJS (`apps/api`) appliquait déjà depuis 001 le découpage en
4 couches `{domain, application, infrastructure, interface}` par module
(Principe VIII). La traduction côté Next.js n'avait pas été formalisée.

---

## Décision

Inscription d'une **sous-section VIII.a** dans la constitution
(v2.2.0 → v2.3.0, bump MINEUR) qui formalise les conventions
structurelles côté `apps/web`, et migration intégrale des 9 features
existantes vers cette structure.

### Structure cible

```
apps/web/src/
├── app/[locale]/
│   ├── (public)/      ← pages indexables SEO (Principe XII)
│   ├── (legal)/       ← CGU, mentions, confidentialité
│   ├── (auth)/        ← flows authentification (noindex)
│   │   └── (private)/ ← pages auth privées (changement mdp, gestion MFA)
│   ├── (conseiller)/  ← espace privé conseiller (noindex)
│   └── (admin)/       ← console admin (noindex)
├── features/<f>/
│   ├── domain/         ← règles pures, VO, ré-exports packages/*-domain
│   ├── application/    ← cas d'usage client (multi-step forms, wizards)
│   ├── infrastructure/ ← api-client typé, lecteurs read-only
│   ├── actions/        ← Server Actions, 1 verbe = 1 fichier <verbe>.action.ts
│   ├── hooks/          ← hooks client (TanStack Query, RHF)
│   ├── ui/             ← composants spécifiques au feature
│   ├── lib/            ← helpers internes au slice
│   ├── schemas/        ← Zod (ré-exports packages/shared/)
│   └── index.ts        ← API publique du slice (seul import autorisé)
└── shared/
    ├── auth/           ← getSession, requireSession, requireConseiller, requireAdmin
    ├── lib/{http, seo, revalidation, result.ts}
    ├── ui/             ← composants transverses (Footer, primitives DS)
    └── i18n, hooks, observability
```

### 8 règles inscrites au Principe VIII.a

1. **Feature slicing vertical** — chaque domaine dans `features/<f>/`.
2. **Routing mince** — `app/` ne contient que layouts, pages, boundaries.
3. **Server Actions normalisées** — `features/<f>/actions/<verbe>.action.ts`,
   directive `'use server'`, validation Zod, `ActionResult<T>` typé,
   pas de `throw` métier.
4. **Frontières d'état explicites** — RSC + TanStack Query (serveur),
   `searchParams` (URL), RHF + Zod (forms), `useState` (local),
   Zustand (global, réservé aux cas justifiés).
5. **Design system isolé** — `shared/ui` ou `packages/ui` selon
   consommateurs ; trois calques *primitives* / *patterns* / *layouts*.
6. **Pas de couplage inter-slice direct** — couplage uniquement via
   `packages/*-domain/`, `packages/shared/`, ou `index.ts` du slice.
   **Check CI** : `tools/check-feature-boundaries.ts`.
7. **Autorisation graduée** — middleware → layout (`require-<role>`) →
   action → DB (filtre `verified`).
8. **Migration progressive** — features existantes refactorisées au
   prochain `touch` fonctionnel, jamais en big bang.

### Stratégie de préservation d'URL

Les route groups Next.js (`(name)/`) ne changent pas les URLs. Pour
éviter de casser SEO/bookmarks/redirects email, j'ai préservé les
segments d'audience après le route group :

| Avant | Après | URL |
|---|---|---|
| `app/[locale]/conseiller/profil/page.tsx` | `app/[locale]/(conseiller)/conseiller/profil/page.tsx` | `/conseiller/profil` (inchangée) |
| `app/[locale]/admin/profils/page.tsx` | `app/[locale]/(admin)/admin/profils/page.tsx` | `/admin/profils` (inchangée) |
| `app/[locale]/connexion/page.tsx` | `app/[locale]/(auth)/connexion/page.tsx` | `/connexion` (inchangée) |

Le coût visuel (segment doublé `(conseiller)/conseiller/`) est jugé
acceptable face au coût d'une migration cassante des URLs.

---

## Alternatives considérées

### Alt. A — Garder la structure actuelle, ajouter une convention orale

Status quo + un paragraphe dans CLAUDE.md disant « préférer une seule
maison pour les Server Actions ». **Rejeté** : sans garde-fou
automatisé, la convention dérive au premier oubli. Les trois lieux
historiques pour les Server Actions étaient justement le résultat
d'une convention orale jamais formalisée.

### Alt. B — Big bang URL-breaking

Adopter exactement la structure cible suggérée (`(conseiller)/conformite/`
sans préservation du segment), ce qui change les URLs vers `/conformite/`,
`/profil/`, etc. **Rejeté** : casserait SEO (Principe XII), bookmarks,
liens en cours dans les courriels transactionnels (003), et tous les
redirects internes du middleware. Le coût-bénéfice n'est pas favorable.

### Alt. C — Extraction immédiate de `packages/ui`

Sortir le design system dans un package workspace dès maintenant.
**Différé** : YAGNI tant qu'une seule app (`apps/web`) consomme. La
constitution prévoit que l'extraction devient obligatoire dès qu'un
2e front consomme. Pour l'instant, `apps/web/src/shared/ui/` joue
ce rôle avec la même structure trois calques.

### Alt. D — Adopter ESLint + `eslint-plugin-import` au lieu du tool maison

Pour la règle d'isolation cross-feature. **Rejeté pour l'instant** :
le projet utilise Biome (constitution, *Stack canonique*) ; ajouter
ESLint pour une seule règle introduirait une seconde toolchain de
lint à maintenir. Le tool maison `tools/check-feature-boundaries.ts`
fait le job en ~120 LOC, avec messages d'erreur localisés FR-CA.

---

## Conséquences

### Positives

- **Une seule maison pour les Server Actions** — `grep -r actions/` retrouve
  tout, pas de duplication possible.
- **Frontière de couplage automatiquement enforced en CI** —
  `tools/check-feature-boundaries.ts` ajouté au job
  `module-boundaries`. Un PR qui introduit un import deep cross-feature
  est bloqué.
- **Convention identique back/front** — l'API NestJS et le Web utilisent
  tous deux les 4 couches `{domain, application, infrastructure, interface}`
  par module/feature. Onboarding plus simple, mental model unique.
- **URLs préservées** — zéro impact SEO, zéro lien cassé.
- **Mise à mort de la duplication `apiFetch` / `getSessionCookieHeader`** —
  5 copies dans MFA + 1 dans profil + variantes auth ont été consolidées
  dans `features/<f>/lib/api*.ts`.

### Négatives

- **Verbosité** des chemins : `app/[locale]/(conseiller)/conseiller/profil/`
  est moins ergonomique que `app/[locale]/conseiller/profil/`. Compensé
  par l'amélioration de la lisibilité conceptuelle.
- **Coût d'écriture initial d'un nouveau slice** — ~6 dossiers à
  scaffold + `index.ts` à maintenir. Compensé par la régularité (un
  template suffit).
- **Imports parfois verbeux** — `import { X, Y, Z } from '@/features/<f>'`
  recompile l'ensemble du barrel. Mitigation : si bottleneck mesuré,
  on autorisera des sous-barrels (`@/features/<f>/ui`) avec le check
  CI ajusté en conséquence.

### Neutres / suite

- **TODO suivi** :
  - Splitter le ré-export self-barrel dans `features/<f>/ui/*.tsx`
    (consume du `@/features/<f>` depuis l'intérieur du même slice) →
    remplacer par imports relatifs `../actions/<v>.action`. Pas urgent
    (ne viole pas VIII.a §6 strictement, simplement style).
  - Câbler `composition.ts` (composition root) le jour où TanStack
    Query / Zustand sont introduits.
  - Extraction `packages/ui` quand 2e app web apparaît (marketing site,
    admin séparé).
  - Migrer les retours `{ kind: 'ok'/'invalid'/'error' }` legacy
    (héritage US1-US7) vers le helper `ActionResult<T>` de
    `shared/lib/result.ts` — équivalence fonctionnelle, gain
    uniformisation pur.

### Métriques

- **3 commits** sur la branche `refactor/web-feature-slicing`
  (PR #17 mergée le 2026-05-28).
- **~211 fichiers touchés**, dont ~80 renames préservant l'historique git.
- **70 pages statiques** générées au `pnpm build` post-migration,
  identique au build pré-migration.
- **0 régression** détectée par typecheck, Biome strict, ou build.
- **0 changement d'URL** sur les 70 pages.

---

## Références

- [Constitution v2.3.0, Principe VIII.a — Conventions structurelles côté apps/web](../../.specify/memory/constitution.md)
- [PR #17 — implémentation de la migration](https://github.com/Sergeo1989/conseiller-voyage/pull/17)
- [Commit 7462f95 — feature slicing + constitution](https://github.com/Sergeo1989/conseiller-voyage/commit/7462f95)
- [Commit 289d007 — route groups](https://github.com/Sergeo1989/conseiller-voyage/commit/289d007)
- [Commit 4e18b10 — split par verbe](https://github.com/Sergeo1989/conseiller-voyage/commit/4e18b10)
