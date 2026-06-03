# Conseiller Voyage — Guide projet pour agents IA

> Source de vérité contraignante : `.specify/memory/constitution.md` (v2.3.0).
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

## Stack figée (cf. constitution v2.1.0, *Stack canonique* + *Infrastructure et opérations*)

**Fondations** — TypeScript ≥ 5 strict · pnpm workspaces · **Turborepo** · **Biome** (lint+format) · Husky + lint-staged · Conventional Commits + commitlint · Zod · GitHub Actions.

**Frontend** — Next.js App Router (RSC par défaut) · hybride RSC + TanStack Query (state serveur) · **Zustand** (state client) · react-hook-form + Zod resolver · **shadcn/ui** (Radix UI) · Tailwind CSS v4 · lucide-react · date-fns (`fr-CA`) · **next-intl** · **Auth.js v5** (sessions DB).

**Backend** — NestJS + **Fastify** · Prisma · Pino · @nestjs/swagger · **react-email** · session DB partagée lue via Prisma · MFA TOTP/passkey conseiller.

**Données et services externes** — PostgreSQL ≥ 16 · Redis ≥ 7 + BullMQ · **AWS S3 ca-central-1** (ADR-0001) · **AWS SES ca-central-1** (ADR-0006) · LLM derrière `LlmProvider`. Tout en région canadienne.

**Tests** — Vitest · Playwright · **Testcontainers** · **MSW** · axe-core (CI bloquant).

**Infrastructure** — **AWS ECS Fargate ca-central-1** (ADR-0005) · **AWS CDK** (IaC TypeScript) · **CloudFront** · OTel → **Grafana Cloud Canada** (ADR-0003) · **Sentry self-hosted ca-central-1** (ADR-0007) · AWS Secrets Manager (prod) + 1Password CLI (dev) · Docker Compose + LocalStack (dev local).

Tout changement de composant nommé ici = amendement MINEUR de la constitution.

## Architecture en 4 couches (Principe VIII)

```
interface  →  application  →  domaine  ←  infrastructure
```

- `domaine/` : pur, zéro framework. **Aucun** import NestJS, Next.js, Prisma.
- `application/` : un cas d'usage = une classe avec une méthode `execute`
  (`CreateLeadUseCase`, `MatchAdvisorsUseCase`).
- `infrastructure/` : adaptateurs (`PrismaLeadRepository`, `RedisCache`,
  `BedrockLlmProvider`, `SesMailer`).
- `interface/` : contrôleurs NestJS, Server Actions Next.js. Mince, déléguer
  à un cas d'usage.

SOLID appliqué concrètement : voir Principe VIII de la constitution.

### Conventions front `apps/web` (Principe VIII.a, depuis v2.3.0)

- **Feature slicing** : chaque domaine vit dans `apps/web/src/features/<f>/{domain,application,infrastructure,actions,hooks,ui,schemas,index.ts}`.
- **Routing mince** : `src/app/` ne contient que layouts, pages et boundaries — zéro logique métier, zéro Prisma direct, zéro fetch direct.
- **Server Actions** : un seul lieu, `features/<f>/actions/<verbe>.action.ts` (jamais `app/`, jamais `lib/`). Validation Zod, vérification autorisation, retour `ActionResult<T>` (discriminated union), pas de `throw` métier.
- **State boundaries** : RSC + TanStack Query (serveur), `searchParams` (URL), react-hook-form + Zod (forms), `useState` (local), Zustand (global rare, justifié).
- **Design system** : `packages/ui` ou `packages/shared/ui/` en trois calques — *primitives* (shadcn/Radix), *patterns*, *layouts*. Extraction physique obligatoire si une 2e app consomme.
- **Inter-slice** : couplage uniquement via `packages/*-domain/`, `packages/shared/`, `packages/ui`, ou l'`index.ts` du slice. Pas d'import profond cross-feature.
- **Autorisation graduée** : middleware → layout (`require-<role>`) → action / use case → DB (filtre `verified`).
- **Migration progressive** : nouvelles features = convention immédiate ; existantes refactorisées au prochain `touch` fonctionnel, jamais en big bang.

## Portes NON-NÉGOCIABLES (rejet automatique à la revue)

| # | Principe | Garde-fou |
|---|---|---|
| I | Conformité OPC/TICO | Aucune touche à la transaction de voyage (réservation, paiement client, versement fournisseur). Conseillers visibles uniquement si statut "vérifié" filtré en couche DB. |
| II | Vie privée / Loi 25 | Données personnelles en région canadienne. Consentement explicite. Effacement implémenté. Rétention selon le tableau de la constitution. |
| VI | Logique métier testée | Scoring matching + validation brief = fonctions pures, tests écrits AVANT implémentation (commits séparés visibles dans git). |
| IX | Sécurité applicative | RBAC en couche application. Validation Zod côté serveur. En-têtes HTTP en place. Aucun secret en clair. Aucun SQL brut sans ADR. |
| XI | Accessibilité WCAG 2.1 AA | axe-core CI bloquant. Navigation clavier intégrale. Contraste ≥ 4.5:1. Audit lecteur d'écran à chaque release majeure. |
| XII | Optimisation SEO | SSR/SSG obligatoire pour pages publiques. CWV LCP/INP/CLS strictement dans les budgets. Lighthouse CI bloquant (Perf ≥ 90, SEO ≥ 95, A11y ≥ 95). Métadonnées + Schema.org JSON-LD complets. Trafic organique = valeur cœur. |

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
- `docs/roadmap.md` — backlog stratégique vivant ; source de vérité pour
  les prochains `/speckit.specify`

<!-- SPECKIT START -->
**Plan courant** : [`specs/008-matching-scoring/plan.md`](specs/008-matching-scoring/plan.md)
(Module matching — feature 011 roadmap, Tier 2 boucle économique cœur ;
branche `008-matching-scoring`). Fonction pure domaine (TDD strict Principe VI)
qui calcule top 3 conseillers vérifiés pour un brief via 4 axes pondérés
(destination 0.35 / géo Haversine FSA 0.25 / spécialité 0.25 / familiarité 0.15)
+ filtre dur langue + boost ≤ +10 % sur cookie `cv_suggested` (007).
Plafond 3 strict (SC-003 invariant), idempotence par briefId,
append-only Loi 25, 4 événements outbox distincts
(`voyageur.brief.matched|partially_matched|unmatched|all_matches_revoked`)
consommés par feature 012 (notifications) et l'extension US5 du dashboard
admin de 008. Aucune UI livrée dans 011 (lecture voyageur arrivera en 015).

Pour le contexte technologique détaillé et la structure de répertoires de la
feature courante, lire ce plan ainsi que `research.md`, `data-model.md`,
`contracts/{matching-query.port,http-endpoints,outbox-events}.md`, et
`quickstart.md` du même répertoire `specs/008-matching-scoring/`.

**Features précédentes mergées** (Tier 0 fermé) :
- `001-conformite-module` (PR #1, squash `8592922`). Source de vérité pour
  le statut `verified` des conseillers ; consommée via `ConformiteQueryPort`
  par les modules matching et SEO. **Étendu par 007** : nouveau port
  `ConformiteNomLegalReader` pour lecture du nom légal vérifié (cf. R9 +
  contracts/conformite-nom-legal.port.md).
- `005-mfa-conseiller` (PR #13, MFA conseiller TOTP). Module `identite`
  étendu — `MfaSecret`, `BackupCode`, ports MFA.
- `006-auth-conseiller-admin` (PR #14). Auth conseiller + admin + RBAC
  AuthGuard NestJS partagé Auth.js v5 (ADR-0004) ; 7 user stories
  (signup, login, verify, logout, reset/change password, admin bootstrap).
  Module `identite` enrichi de ~20 ports applicatifs.
- `003-notifications-transactionnelles` (PR #15). AWS SES ca-central-1
  (ADR-0006). Draine `mfa_outbox_emails` (002a) + `auth_outbox_emails`
  (002) + outbox conformité (001). **Consommé par 007** pour les relances
  onboarding J+3/J+7/J+14 et les notifications de modération admin (FR-024).
- `004-mentions-legales` (PR #12). Mentions légales + CGU B2B/B2C +
  politique Loi 25 + page « Comment ça marche ». **Consommé par 007** via
  le middleware CGU déjà en place sur `/(conseiller)/**` (FR-019) et le
  lien `/comment-ca-marche` dans la section pédagogique (FR-009).
- `007-profil-conseiller` (PR #16, squash `702828e`). Vue publique
  anti-marketplace (ADR-0002), dashboard conseiller, édition profil,
  aperçu, modération admin, slug `prenom-nom` immuable (SC-007 Loi 25,
  ADR-0015), cookie `cv_suggested` HMAC pour boost soft scoring matching.
  Étend 001 via `ConformiteNomLegalReader`. Consomme 003 (relances
  onboarding J+3/J+7/J+14) et 004 (middleware CGU + `/comment-ca-marche`).
- **Architecture VIII.a** (PRs #17, #18). Feature slicing front + route
  groups par audience + Server Actions par verbe + `tools/check-feature-boundaries.ts`
  + `shared/auth/{getSession,requireSession,requireConseiller,requireAdmin}`
  + ADR-0016. Constitution v2.2.0 → v2.3.0 (Principe VIII.a).

- `002-voyageur-intake` (PR #20, squash `f3bff79`). Module intake voyageur
  feature 008 roadmap. 5 US livrées (submit + verify magic-link, mes-briefs,
  anti-spam multi-briefs + disposable 3-tier, effacement Loi 25 brief seul +
  global, file admin briefs non-matchés + push manuel). 3 ADRs (0017 audit
  table séparée, 0018 magic-link random DB, 0019 disposable emails list).
  Publie outbox `voyageur.brief.activated` consommée par 011 matching.

**Features en cours / à venir** :
- `008-matching-scoring` (cette branche) : voir *Plan courant* ci-dessus.
<!-- SPECKIT END -->
