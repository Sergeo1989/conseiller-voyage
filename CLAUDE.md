# Conseiller Voyage — Guide projet pour agents IA

> Source de vérité contraignante : `.specify/memory/constitution.md` (v2.0.0).
> Ce fichier en est un résumé opérationnel pour orienter rapidement les agents IA.

## Règle d'or

**Pas de code sans spec.** Pour toute fonctionnalité, suivre strictement le flux
Spec Kit :

```
/speckit.specify  →  /speckit.plan  →  /speckit.tasks  →  /speckit.implement
```

Ouvrir un PR de code sans `spec.md` et `plan.md` mergés au préalable entraîne un
rejet automatique à la revue.

## Langue

FR-CA par défaut pour toute copie utilisateur, message d'erreur, courriel,
libellé, README de module. L'anglais et les autres langues sont ajoutés via
i18n (clés/catalogues séparés), jamais par fork de gabarits. Cibler les requêtes
francophones en priorité côté SEO.

## Stack figée (cf. constitution, *Stack canonique*)

- **Langage** : TypeScript ≥ 5 en mode strict
- **Frontend** : Next.js (App Router), RSC par défaut
- **Backend** : NestJS (le conteneur DI applique le Principe VIII)
- **Monorepo** : pnpm workspaces — `apps/web`, `apps/api`, `packages/shared`
- **ORM** : Prisma sur PostgreSQL ≥ 16 (région canadienne)
- **Cache + file** : Redis + BullMQ
- **Validation** : Zod (schémas partagés serveur/client)
- **Tests** : Vitest (unit + intégration) + Playwright (e2e)
- **Lint/format** : ESLint + Prettier
- **CI** : GitHub Actions
- **LLM** : derrière interface `LlmProvider` (fournisseur fixé par ADR, résidence canadienne)
- **Hébergement** : région canadienne obligatoire (Loi 25)

Tout changement de composant nommé ici = amendement MINEUR de la constitution.

## Architecture en 4 couches (Principe VIII)

```
interface  →  application  →  domaine  ←  infrastructure
```

- `domaine/` : pur, zéro framework. **Aucun** import NestJS, Next.js, Prisma.
- `application/` : un cas d'usage = une classe avec une méthode `execute`
  (`CreateLeadUseCase`, `MatchAdvisorsUseCase`).
- `infrastructure/` : adaptateurs (`PrismaLeadRepository`, `RedisCache`,
  `BedrockLlmProvider`, `ResendMailer`).
- `interface/` : contrôleurs NestJS, Server Actions Next.js. Mince, déléguer
  à un cas d'usage.

SOLID appliqué concrètement : voir Principe VIII de la constitution.

## Portes NON-NÉGOCIABLES (rejet automatique à la revue)

| # | Principe | Garde-fou |
|---|---|---|
| I | Conformité OPC/TICO | Aucune touche à la transaction de voyage (réservation, paiement client, versement fournisseur). Conseillers visibles uniquement si statut "vérifié" filtré en couche DB. |
| II | Vie privée / Loi 25 | Données personnelles en région canadienne. Consentement explicite. Effacement implémenté. Rétention selon le tableau de la constitution. |
| VI | Logique métier testée | Scoring matching + validation brief = fonctions pures, tests écrits AVANT implémentation (commits séparés visibles dans git). |
| IX | Sécurité applicative | RBAC en couche application. Validation Zod côté serveur. En-têtes HTTP en place. Aucun secret en clair. Aucun SQL brut sans ADR. |

## Avant tout merge : Definition of Done

Cocher intégralement la checklist DoD de la constitution (section *Flux de
développement et portes qualité*). Couvre : tests, lint, type-check, a11y
(axe-core), perf (Lighthouse CI), métriques produit, sécurité OWASP,
documentation FR-CA, ADR si décision architecturale, migration testée en
staging.

## SLO et fiabilité (Principe X)

- Disponibilité 99,5 % mensuel
- Latence p95 < 800 ms sur endpoints synchrones (hors LLM)
- RPO 24 h, RTO 4 h
- Idempotence obligatoire sur création de lead, notification conseiller,
  paiement abonnement, effacement Loi 25
- Modes dégradés : LLM HS, Courriel HS, DB primaire HS

## Modules de premier niveau (Principe V — monolithe modulaire)

`conformité` · `préqualification` (intake) · `matching` · `SEO` ·
`facturation` · `identité`

Imports cross-module uniquement via interfaces publiques. Microservices
**interdits par défaut** — extraction seulement sur preuve mesurée d'un
goulot, documentée dans le plan.

## ADR (Architecture Decision Records)

Toute décision avec impact > 1 module : créer `docs/adr/NNNN-titre.md` au
format MADR. Lier depuis le plan. Ne jamais modifier rétroactivement.

## Contexte additionnel par feature

- `specs/<###-feature>/spec.md` — le QUOI
- `specs/<###-feature>/plan.md` — le COMMENT (avec section *Constitution Check*)
- `specs/<###-feature>/tasks.md` — l'exécution
- `docs/adr/` — les décisions structurantes

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
