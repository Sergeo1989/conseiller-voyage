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
**Plan courant** : [`specs/015-dashboard-conseiller/plan.md`](specs/015-dashboard-conseiller/plan.md)
(Feature roadmap **014** — tableau de bord conseiller ; modules `matching` × `identité` ;
Tier 2 ; branche `015-dashboard-conseiller`). **Couche interface/présentation** réunissant
*Mes leads* (liste + détail + actions de transition de 012) et *Mes conversations*
(liste + fil + envoi + pièces jointes de 013). Lecture **exclusivement** via les endpoints
HTTP conseiller existants (012/013) et les ports publics `MatchingLeadQueryPort` (012) +
`ConversationQueryPort` (013) — **aucune** logique métier ré-implémentée, **aucune** nouvelle
table/machine d'état. **Anti-marketplace strict** (ADR-0002) : 0 montant/paiement/réservation
affiché, devis = fichier opaque, mention permanente de neutralité. **Loi 25** : 0 PII de
contact (résumé non nominatif). **Cloisonnement** RBAC (un conseiller ne voit que ses
leads/fils). Front **VIII.a** : route group `(conseiller)` (déjà protégé auth 006 + CGU 004 +
vérifié 001), slices `features/leads` (nouveau) + `features/conversation` (réutilisé de 013),
Server Actions par verbe, RSC + TanStack Query, i18n FR-CA/EN, a11y AA. **Seul ajout backend** :
endpoint `GET /api/matching/conseiller/conversations` exposant `ConversationQueryPort.listForConseiller`.

Pour le contexte détaillé, lire ce plan ainsi que `research.md`, `data-model.md`,
`contracts/{http-endpoints,ui-routes-actions}.md`, et `quickstart.md` du même répertoire
`specs/015-dashboard-conseiller/`.

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
- `008-matching-scoring` = **feature 011 matching** (PR #21 squash `a854c81` +
  satellite T093 PR #23 squash `e2e598c`). Module `matching` : scoring top 3
  conseillers vérifiés (4 axes pondérés + filtre langue + boost cookie), plafond
  3 strict, idempotence briefId, append-only Loi 25, 4 événements outbox
  (`voyageur.brief.matched|partially_matched|unmatched|all_matches_revoked`)
  drainés vers le bus Redis `matching.events` (T093). ADRs 0020-0024.
  `MatchingQueryPort` public + `fsa-centroids.json` complet (1 643 FSA StatCan).
  Consommé par 012. Avant déploiement prod : validations staging (charge +
  migrations) restantes.
- `012-lead-notifications-state-machine` (PR #24, squash `a521ac7`). Module
  `matching` — feature 012 roadmap. Consomme les 4 événements outbox de 011 sur
  le bus `matching.events`, crée une entité **Lead** par (conseiller vérifié ×
  MatchingResultEntry), notifie chaque conseiller individuellement (un job
  BullMQ par destinataire, courriel FR-CA SES sans PII), pilote une machine
  d'état de lead append-only (ADR-0025, property-tests SC-003/FR-020),
  supersession re-match + sweep réconciliation bus HS (ADR-0026), cascade
  anonymisation Loi 25, concurrence optimiste, idempotence at-least-once.
  Expose le port public `MatchingLeadQueryPort` + endpoints HTTP conseiller
  (consommés par 014). Avant déploiement prod : tests intégration Testcontainers
  + charge en staging restants.
- `013-homepage-differenciante` = **feature 026 roadmap** (PR #25, squash `d67b34a`).
  Page d'accueil publique différenciante (module SEO × matching) : héro + sections
  différenciation + « côté humain » + FAQ, JSON-LD `Organization`/`WebSite`/`FAQPage`,
  SSR/SSG statique cacheable, anti-marketplace (CTA unique → intake, 0 contact).
  **Active l'infra front** : Tailwind CSS v4 (PostCSS), `next dev` en **Turbopack**
  (corrige `import.meta` des packages `@cv/*`), lucide-react ; typo serif Fraunces +
  Geist sans. Règles globales dans `@layer base` (cascade Tailwind). Reste post-MVP :
  image OG, ratification libellés OPC/TICO, audit lecteur d'écran.
- `014-conversation-conseiller-voyageur` = **feature 013 roadmap** (PR #26, squash `2f375f8`).
  Module `matching` — conversation post-acceptation. Ouvre un **fil** par couple (conseiller ×
  lead `accepté`) : messages texte + **pièces jointes** (devis PDF, **S3 ca-central-1**, URL
  signées courtes) ; **1 notification/destinataire** (outbox + BullMQ → SES via 003, template
  FR-CA sans PII) ; éligibilité d'écriture **lue** via `MatchingLeadQueryPort` (012) +
  conformité (001) ; cascade **anonymisation Loi 25** (audit préservé) ; idempotence ;
  cloisonnement. **Anti-marketplace** (ADR-0002, invariant testé). Expose le **port public**
  `ConversationQueryPort` (consommé par 014/015) + endpoints HTTP conseiller + UI minimale
  (slice `features/conversation`). Déclencheur d'ouverture = hook in-process sur la transition
  `accepté` (012). ADR-0027. Côté voyageur déféré à 015. Avant prod : intégration Testcontainers
  + charge staging.

**Features en cours / à venir** :
- `015-dashboard-conseiller` (cette branche, feature roadmap 014) : voir *Plan courant* ci-dessus.
<!-- SPECKIT END -->
