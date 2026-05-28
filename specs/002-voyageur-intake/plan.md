# Implementation Plan: Module Intake / Préqualification voyageur

**Branch**: `002-voyageur-intake` | **Date**: 2026-05-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-voyageur-intake/spec.md`

## Summary

Le module **intake** capture un brief de voyage qualifié d'un voyageur
francophone (FR-CA prioritaire, EN J1) via un formulaire en 5 étapes (≤ 7
min). Le brief structure 9 dimensions (destination, dates, groupe, budget,
langue conseiller, spécialité, familiarité, contact, consentement Loi 25)
dont 5 sont des **différenciateurs nets** vs Mon Voyage Mon Agence : langue,
spécialité, budget fourchette, flexibilité dates, familiarité (cf.
`docs/positioning.md` §3-§5).

**Approche technique** : Server Components Next.js 15 pour le rendu initial,
Server Actions Next.js pour la soumission + validation Zod côté serveur,
NestJS pour les endpoints `/api/intake/*` (validation 2e couche + outbox
events), AWS SES pour le magic link transactionnel, Redis pour le
rate-limit. Magic link signé HMAC (anti-spam 2-step), brief immuable
post-vérification (intégrité scoring matching feature matching (ID roadmap 011)), expiration
J+90 via DataRetentionSweepJob existant. Aucune transaction monétaire,
aucun compte permanent voyageur (feature identité voyageur permanente identité consolidera plus
tard).

Réutilise massivement l'infrastructure 001 : `@cv/db` PrismaClient
singleton + audit log append-only (trigger SQL), `@cv/shared/conformite`
formatters + Zod errors map FR-CA, AWS SES ca-central-1 (ADR-0006),
observabilité OTel + Sentry self-hosted, BullMQ pour les jobs background.

## Technical Context

**Language/Version**: TypeScript ≥ 5.4 strict (déjà figé par 001), Node.js 22 LTS

**Primary Dependencies**:
- **Frontend** : Next.js 15 App Router (RSC), next-intl 3.x, react-hook-form + Zod resolver, tailwindcss 4.x, shadcn/ui (à wirer en feature design-system)
- **Backend** : NestJS 10 (upgrade 11 trackée issue #8), Fastify, Prisma 5.22, Zod
- **Auth voyageur (light)** : magic link HMAC signé + cookie session court (pas Auth.js complet, feature identité voyageur permanente ultérieure)

**Storage**:
- PostgreSQL 16 (ca-central-1 RDS prod, Postgres local docker compose dev)
- Redis 7 (rate-limit + idempotency cache)
- AWS S3 (non utilisé dans cette feature — pas d'upload voyageur v1)

**Testing**: Vitest unit + integration (Testcontainers postgres), Playwright e2e, axe-core a11y (Principe XI bloquant CI), Lighthouse CI

**Target Platform**: Web responsive (mobile-first 375px → desktop 1440px+), pas d'app mobile native v1

**Project Type**: Module monolithe `intake/` au sein du monorepo (Principe V — monolithe modulaire)

**Performance Goals**:
- LCP < 2.0s sur étape 1 du formulaire (Principe XII SEO)
- INP < 200ms sur chaque interaction du formulaire (formulaire 4-5 min utilisé sans frustration)
- p95 endpoint `POST /api/intake/briefs` < 600ms (validation Zod + SES enqueue + DB insert)
- Throughput cible : 100 briefs / heure / region en pic (calibre rate-limit IP)

**Constraints**:
- **i18n natif** FR-CA premier + EN J1, structure extensible ES (Principe IV)
- **WCAG 2.1 AA** intégral (Principe XI NON-NÉGOCIABLE, axe-core CI bloquant)
- **Loi 25** : effacement < 60s confirmation → nullification PII (déjà couvert par le pipeline 001 EraseConseillerDataUseCase, à adapter pour `VoyageurBrief`)
- **Hors transaction** (Principe I) : la feature ne touche jamais à un paiement, une réservation, ou un versement
- **Pas de compte permanent voyageur** : magic link J+7 suffit, feature future identité voyageur permanente ajoutera passkey/email optionnel plus tard

**Scale/Scope**:
- 5 user stories (spec.md US1-US5), 30 functional requirements
- 4 entités principales (VoyageurBrief, VoyageurContact, MagicLinkToken, BriefAuditEntry)
- ~12 endpoints HTTP (création, vérification magic link, suivi statut, effacement, liste briefs même email, admin file non-matché)
- ~6 pages frontend (formulaire 5 étapes, page récap, page email-sent, page magic-link-error, page deletion-confirmed, page admin file)

Volume année 1 (vs MVMA — calibrage roadmap.md) :
- 100 briefs / mois M1 → 2000 briefs / mois M18
- 70% briefs vérifiés via magic link (SC-006)
- 90% briefs avec budget renseigné (SC-003)
- 80% briefs avec langue conseiller renseignée (SC-004)

## Constitution Check

*GATE: Doit passer avant Phase 0 (recherche). Re-vérifier après Phase 1 (design).*

### I. Conformité réglementaire par conception (NON-NÉGOCIABLE)

✅ **Conforme**. La feature ne touche **AUCUNE** transaction monétaire :
pas de réservation, pas d'encaissement client, pas de versement
fournisseur. Le brief est uniquement de la collecte qualifiée pour
matching aval. La frontière transactionnelle est respectée par design.

Le filtrage `verified` côté DB n'est **pas** une responsabilité de ce
module : c'est la feature matching (future, ID roadmap 011) qui appellera
`ConformiteQueryFacade.listVerifiedCompliances()` (port public 001) pour
trouver les conseillers à notifier. Ce module ne consomme aucun
conseiller — il produit uniquement des briefs.

### II. Vie privée et Loi 25 (NON-NÉGOCIABLE)

✅ **Conforme**. PII collectées : prénom, nom, email, téléphone (optionnel),
code postal. Toutes les 5 PII passent la justification de minimisation :
- Prénom + nom : nécessaires au conseiller pour s'adresser au voyageur
- Email : canal de retour obligatoire (devis, magic link)
- Téléphone (optionnel) : préférence du voyageur, le conseiller peut
  ouvrir la conversation par téléphone si reçu
- Code postal : pondère le scoring matching feature matching (ID roadmap 011) (proximité
  conseiller) — sans rue ni ville, donc PII faible

Résidence canadienne **confirmée** : DB Postgres RDS ca-central-1 (ADR-0005),
SES ca-central-1 (ADR-0006) pour les magic links, Sentry self-hosted
ca-central-1 (ADR-0007), Grafana Cloud Canada (ADR-0003). Pas de
sous-traitant hors Canada.

**Consentement explicite Loi 25** : case à cocher non pré-cochée à l'étape 5
du formulaire avec texte clair en FR-CA (FR-010 du spec). Horodatage du
consentement persisté dans `VoyageurBrief.consentGivenAt`.

**Effacement** :
- Le voyageur peut demander l'effacement depuis la page récap (FR-022).
- Pipeline EraseConseillerData (feature 001) sera réutilisé : nullification
  PII + suppression magic link tokens, conservation audit log anonymisé.
- Expiration automatique J+90 sans devis accepté (FR-024) + rappel J-7
  (FR-025).
- Le `DataRetentionSweepJob` (001) sera étendu pour parcourir aussi les
  `VoyageurBrief.erasureRequestedAt`.

**Rétention** : 90 jours brief actif → nullification PII + statut `expired`.
Cohérent avec la politique de rétention du tableau de la constitution
(brief = pré-décision, donc rétention minimale).

### III. Qualité de lead avant volume

✅ **Conforme**. Le brief produit dans cette feature est précisément ce qui
**définit** la qualité du lead (Principe III). Les 5 différenciateurs vs
MVMA (langue, spécialité, budget, flexibilité, familiarité) sont les
critères qui permettront au scoring matching (003) de retourner les 3
conseillers les plus pertinents (cap notification Principe III).

Métriques de succès calibrées :
- SC-003 ≥ 90% briefs budget renseigné (vs ~0% MVMA)
- SC-004 ≥ 80% briefs langue conseiller renseignée (vs ~0% MVMA)
- SC-007 ≤ 3% briefs spam/jetables (rate-limit + email jetables blocklist)

Traçabilité lead → devis → réservation déclarée par feature future devis
qui consommera l'événement `voyageur.brief.activated` produit ici.

### IV. Français d'abord

✅ **Conforme**. FR-CA est le **default** absolu. EN livré dès J1 via
`next-intl` (catalogue séparé `apps/web/src/i18n/messages/en.json`). ES
en feature ultérieure sans modification de structure. Le formulaire,
les messages d'erreur Zod (map FR-CA via `applyFrCAZodErrorMap()` déjà
exportée par `@cv/shared/conformite`), les emails magic link, et les
pages récap sont entièrement bilingues. Aucun fork de gabarits.

Cible SEO : requêtes francophones canadiennes (« conseiller voyage
Pérou Montréal espagnol »). Cf. feature SEO ultérieure.

### V. Architecture : monolithe modulaire

✅ **Conforme**. Le nouveau module `intake/` suit la même structure 4 couches
que `conformite/` (cf. apps/api/src/modules/intake/) :
- `domain/` : entités, value objects, services purs (zéro framework)
- `application/` : use cases + ports (interfaces)
- `infrastructure/` : adapters Prisma, BullMQ, SES, Redis
- `interface/` : controllers NestJS, Server Actions Next.js, facade publique
  `IntakeQueryFacade` consommée par 003 (matching) et 004 (devis)

**Frontières modulaires** : le module `intake` n'importe `conformite` que
via sa facade publique (`ConformiteQueryFacade.listVerifiedCompliances()`),
**pas** directement les adapters Prisma. Vérifié par
`tools/check-module-boundaries.ts` (Principe V enforcement, T030a).

### VI. Logique métier déterministe et testée (NON-NÉGOCIABLE)

✅ **Conforme**. Les fonctions critiques sont testées AVANT implémentation
(TDD strict) :
- `validateBriefSubmission` (pure function, validation business rules au-delà du Zod schema)
- `computeBriefExpiration` (pure, J+90 stable)
- `signMagicLinkToken` / `verifyMagicLinkToken` (HMAC SHA-256 déterministe)
- `mapBriefToOutboxEvent` (sérialisation du brief vers `voyageur.brief.activated`)

Tests commits séparés visibles dans git (RED-GREEN-REFACTOR enforced).
Coverage threshold 85% lines / 80% branches (issue #2 follow-up 001 à
appliquer dès ce module).

### VII. Observabilité de la boucle économique

✅ **Conforme**. Métriques d'instrumentation OTel ajoutées dès J1 :
- `intake_brief_submitted_total` (counter, par locale FR/EN, par spécialité)
- `intake_brief_form_step_dropped_total` (counter, par étape 1→5 — calibre SC-001 ≥ 65%)
- `intake_brief_completion_duration_seconds` (histogram, calibre SC-002 ≤ 6 min)
- `intake_brief_verified_total` (counter, magic link cliqué — calibre SC-006 ≥ 70%)
- `intake_brief_rejected_validation_total` (counter, par champ — calibre SC-005 ≤ 5%)
- `intake_brief_erasure_completed_seconds` (histogram — calibre SC-008 ≤ 60s)
- `intake_brief_abuse_blocked_total` (counter, par raison: rate_limit_ip, rate_limit_email, disposable_email — calibre SC-007 ≤ 3%)

Dashboard Grafana provisionné via CDK (extension de
`docs/dashboards/conformite.json` → `intake.json`).

### VIII. Clean Architecture et SOLID

✅ **Conforme**. Structure 4 couches identique à 001 (validée par revue
constitution). Aucun import framework (`@nestjs/*`, `next`, `@prisma/client`)
dans `domain/`. Les `application/use-cases/*` sont des classes injectables
NestJS qui dépendent de ports (interfaces) — jamais des adapters concrets.

### IX. Sécurité applicative (NON-NÉGOCIABLE)

✅ **Conforme** par héritage + spécifiques :

Hérité de 001 (déjà câblé dans `AppModule`) :
- `CsrfProtectionMiddleware` global sur api/* mutations
- `ThrottlerGuard` 100 req/min/IP global (sera spécialisé sur `/api/intake/*`)
- `IdempotencyInterceptor` sur header `Idempotency-Key`
- Helmet headers HTTPS-strict, CSP, HSTS
- Sessions DB pour les magic links (préfixe `__Host-cv.intake.token` en prod)

Spécifique intake :
- **Magic link HMAC** signé avec `INTAKE_MAGIC_LINK_SECRET` (Secrets Manager).
  Format : `<briefId>.<expiresAtUnix>.<HMACSHA256>` — non-falsifiable sans clé.
- **Rate-limit granulaire** (issue #5 sera appliquée ici dès J1) :
  - POST /api/intake/briefs : 3/24h/email, 5/24h/IP (FR-019, FR-020)
  - POST /api/intake/briefs/:id/resend-magic-link : 5/heure/IP
- **Anti-spam emails jetables** : liste publique (mailinator, 10minutemail, etc.) updated mensuellement (cron BullMQ).
- **Validation Zod côté serveur** sur **chaque** Server Action et chaque controller NestJS (double-validation).
- **Audit log append-only** : toutes les actions brief (created, verified, deleted, expired, push admin manuel) loggées via réutilisation du writer 001 `prisma-audit-log-writer.ts` (table partagée vs séparée — décision dans research.md R2).

### X. Fiabilité et résilience

✅ **Conforme**.
- **Outbox pattern** réutilisé : événements `voyageur.brief.activated`,
  `voyageur.brief.deleted`, `voyageur.brief.expired` publiés en transaction
  avec la mutation Prisma, drainés par `OutboxPublisherJob` (5s).
- **Idempotence** sur création de brief (FR-018 multi-briefs sans
  duplication) via clé client `Idempotency-Key` + scoping par email
  (issue #5 follow-up).
- **SLO** : p95 endpoint < 600ms (cible interne plus stricte que la
  constitution car formulaire interactif), disponibilité 99,5% hérité.
- **RPO 24h, RTO 4h** hérités du backup RDS quotidien.
- **Magic link retry** : si SES échoue (rate-limit, bounce), le job
  `IntakeMagicLinkRetryJob` retente 3× avec backoff exponentiel.

### XI. Accessibilité WCAG 2.1 AA (NON-NÉGOCIABLE)

✅ **Conforme**.
- Formulaire **navigable au clavier intégralement** (Tab/Shift+Tab entre
  étapes, Enter pour Next, Escape pour annuler).
- Chaque champ a un `<label>` associé (`htmlFor`/`id`).
- Erreurs Zod annoncées par `aria-live="polite"`.
- Touch targets ≥ 44×44px (héritage de la baseline `<style>` globale
  ajoutée en 001).
- Contrastes ≥ 4.5:1 sur tous les badges/messages (palette éprouvée 001).
- `prefers-reduced-motion` respecté (baseline 001).
- Tests `axe-core` CI bloquant via `@axe-core/playwright` (issue #9).
- **Audit lecteur d'écran** (NVDA + VoiceOver) manuel avant release.

### XII. Optimisation SEO (NON-NÉGOCIABLE)

🟡 **Partiellement conforme**. La feature intake **n'est pas le sujet
SEO principal** (la page intake `/voyage/nouveau` ne ciblera pas un
mot-clé fort — elle est l'aboutissement d'un funnel acquisition).
Mais :
- SSR via Server Components (pas SPA client-only)
- Métadonnées `next-intl` + `hreflang` FR/EN sur la page d'entrée
- JSON-LD Schema.org `BreadcrumbList` sur la page récap
- Aucune dégradation des budgets Lighthouse CI hérités

La cible SEO long-tail (« conseiller voyage Pérou Montréal espagnol »)
sera attaquée par la feature profil mergée (007 spec, 005 roadmap — pages SEO publiques
indexables `/conseillers/<slug>`) — pas par intake.

---

## Project Structure (alignée Principe V + VIII.a — constitution v2.3.0)

### Backend (`apps/api`) — 4 couches par module (Principe VIII)

```
apps/api/src/modules/intake/
├── domain/
│   ├── entities/
│   │   ├── voyageur-brief.entity.ts        # immuable post-vérification
│   │   ├── voyageur-contact.entity.ts      # PII isolée
│   │   └── magic-link-token.entity.ts
│   ├── value-objects/
│   │   ├── travel-budget.vo.ts             # enum < 2k, 2-5k, 5-10k, 10-20k, 20k+
│   │   ├── travel-speciality.vo.ts         # 11 enum values canoniques
│   │   ├── travel-familiarity.vo.ts        # 3 enum
│   │   └── dates-flexibility.vo.ts         # bool + amplitude 1-30j
│   ├── services/
│   │   ├── validate-brief-submission.ts    # règles business (pure)
│   │   ├── compute-brief-expiration.ts     # pure
│   │   └── sign-magic-link.ts              # HMAC SHA-256 pure
│   └── events/
│       ├── brief-submitted.event.ts
│       ├── brief-verified.event.ts
│       ├── brief-deleted.event.ts
│       └── brief-expired.event.ts
├── application/
│   ├── ports/
│   │   ├── voyageur-brief-writer.port.ts
│   │   ├── voyageur-brief-reader.port.ts
│   │   ├── magic-link-mailer.port.ts
│   │   ├── disposable-email-checker.port.ts
│   │   └── rate-limiter.port.ts
│   └── use-cases/
│       ├── submit-brief.use-case.ts
│       ├── verify-magic-link.use-case.ts
│       ├── view-brief-status.use-case.ts
│       ├── list-briefs-by-email.use-case.ts
│       ├── resend-magic-link.use-case.ts
│       ├── request-brief-erasure.use-case.ts
│       └── push-brief-to-conseiller.use-case.ts (admin manual flow)
├── infrastructure/
│   ├── prisma-voyageur-brief-repository.ts
│   ├── ses-magic-link-mailer.ts            # AWS SES (réutilise client 001)
│   ├── disposable-email-checker.ts         # checker liste publique
│   ├── redis-intake-rate-limiter.ts
│   └── jobs/
│       └── intake-magic-link-retry.job.ts  # BullMQ retry SES
└── interface/
    ├── http/
    │   ├── voyageur-intake.controller.ts   # /api/intake/briefs, /verify, /by-email
    │   └── admin-intake.controller.ts      # /api/intake/admin/unmatched
    └── public-api/
        └── intake-query.facade.ts          # consommée par feature matching future
```

### Frontend (`apps/web`) — feature slicing vertical (Principe VIII.a)

```
apps/web/src/features/intake/
├── domain/                                 # ré-exports packages/shared/intake si besoin
├── application/                            # wizards multi-étapes côté client
├── infrastructure/
│   └── api-client.ts                       # wrapper typé /api/intake/*
├── actions/                                # 1 verbe = 1 fichier <verbe>.action.ts
│   ├── submit-brief.action.ts
│   ├── verify-magic-link.action.ts
│   ├── resend-magic-link.action.ts
│   ├── request-brief-erasure.action.ts
│   └── push-to-conseiller.action.ts        # admin
├── hooks/                                  # useBriefDraft, useBriefStatus (TanStack Query)
├── ui/
│   ├── BriefFormWizard.tsx                 # Client Component multi-étapes (5)
│   ├── BriefStep1Destination.tsx
│   ├── BriefStep2Dates.tsx
│   ├── BriefStep3Groupe.tsx
│   ├── BriefStep4Preferences.tsx
│   ├── BriefStep5ContactConsentement.tsx
│   ├── BriefRecap.tsx                      # affichage récap (Server Component)
│   ├── BriefStatusBadge.tsx
│   ├── PushToConseillerForm.tsx            # admin
│   └── EmailSentNotice.tsx
├── lib/                                    # helpers internes (form state, FR-CA dates)
├── schemas/                                # ré-exports Zod depuis packages/shared/intake
└── index.ts                                # API publique du slice (barrel)

apps/web/src/app/[locale]/
├── (public)/                               # SEO indexable — page entrée intake
│   └── voyage/
│       └── nouveau/page.tsx                # Server Component → BriefFormWizard
├── (voyageur)/                             # nouveau route group — magic link sessions
│   ├── layout.tsx                          # noindex (sessions courtes voyageur)
│   └── voyage/
│       ├── [token]/page.tsx                # récap brief (magic link)
│       ├── email-envoye/page.tsx
│       └── lien-expire/page.tsx
└── (admin)/                                # déjà existant
    └── admin/
        └── intake/
            ├── non-matche/page.tsx         # file briefs admin
            └── [briefId]/page.tsx          # détail + push admin
```

**Règles VIII.a respectées** :
- Server Actions vivent UNIQUEMENT dans `features/intake/actions/<verbe>.action.ts` (jamais co-localisées dans `app/`).
- Pages dans `app/` restent **minces** : Server Component qui `await` un use case et compose des composants du slice `features/intake/`.
- Composants spécifiques à l'intake (BriefFormWizard, Steps 1-5) vivent dans `features/intake/ui/`.
- Imports cross-feature passent UNIQUEMENT par le barrel `@/features/intake` — `tools/check-feature-boundaries.ts` valide.

### Packages partagés

```
packages/shared/src/intake/
├── schemas.ts                              # Zod : SubmitBriefSchema, etc.
├── branded-ids.ts                          # VoyageurBriefId, MagicLinkTokenId
├── contracts.ts                            # IntakeQueryPort interface
├── formatters.ts                           # i18n FR-CA/EN
└── email/templates/intake/
    ├── magic-link.ts
    ├── brief-confirmation.ts
    ├── expiration-reminder.ts              # J-7 avant J+90
    └── erasure-confirmation.ts

packages/db/prisma/schema/
└── intake.prisma                           # VoyageurBrief, VoyageurContact, MagicLinkToken
                                            # (intake_audit_entries séparée — ADR-0018 du plan)
```

---

## Décisions architecturales référées

- **ADR-0017** (à créer) : Magic link signé HMAC vs JWT vs token aléatoire
  → décision dans research.md R1
- **ADR-0018** (à créer) : Audit log partagé `conformite_audit_entries` vs
  table `intake_audit_entries` séparée → décision dans research.md R2
- **ADR-0019** (à créer, optionnel) : Captcha / hCaptcha si rate-limit ne
  suffit pas → à reporter après mesure premier mois

---

## Dependencies

**Code dependencies** :
- Feature 001 mergée vers `main` (FAIT 2026-05-25, PR #1)
- Module `conformite/` : facade publique `ConformiteQueryFacade` (utilisée
  par feature matching (ID roadmap 011) matching, pas par intake directement)
- `@cv/db` : tables `auth_users`, `auth_sessions`, audit pipeline
- `@cv/shared/conformite` : Zod error map FR-CA réutilisée
- AWS SES ca-central-1 (ADR-0006) déjà provisionné

**Feature dependencies** :
- ⏳ Feature 003 (matching) consommera `voyageur.brief.activated` — pas
  pré-requis pour cette feature, les événements s'accumulent dans
  l'outbox en attendant.
- ⏳ Feature 006 (identité) — feature optionnelle si voyageur veut un
  compte permanent. Reporté.

---

## Phase 0 — Research

→ Voir [`research.md`](./research.md) après exécution de Phase 0.

**Items à résoudre** :
- R1 : Magic link signé HMAC vs JWT vs random token (sécurité + simplicité + débuggabilité)
- R2 : Audit log partagé vs séparé (intake vs conformite — Principe V module boundaries)
- R3 : Bibliothèque de disposable email blocklist (NPM `disposable-email-domains` à jour ? fetch GitHub raw ? maintenir custom ?)
- R4 : Captcha — nécessaire en J1 ou seulement après mesure abus ?
- R5 : Multi-step form state management — formData en RAM client vs server cache (SQLite ? Redis ? PostgreSQL temp ?) si user reprend le formulaire après 24h
- R6 : Telephone format E.164 strict côté serveur ou libre côté client ?
- R7 : Liste fermée des 11 spécialités voyage — source de vérité (enum Prisma vs table de référence DB) ?
- R8 : Liste fermée des langues conseiller — FR/EN/ES/autre — comment gérer "autre" en scoring matching feature matching (ID roadmap 011) ?

---

## Phase 1 — Design & Contracts

→ Voir [`data-model.md`](./data-model.md), [`contracts/http-endpoints.md`](./contracts/http-endpoints.md), [`quickstart.md`](./quickstart.md) après exécution de Phase 1.

---

## Gates & Sign-off

- [X] Constitution Check pré-recherche : tous principes adressés (12/12, 1 partiel justifié XII)
- [X] Phase 0 complète (research.md résout les 8 items R1-R8) — voir [research.md](./research.md)
- [X] Phase 1 complète (data-model + contracts + quickstart) — voir [data-model.md](./data-model.md), [contracts/http-endpoints.md](./contracts/http-endpoints.md), [quickstart.md](./quickstart.md)
- [X] Constitution Check post-design : ré-évaluation
  - Principes I, II, III, IV, V, VI, VII, VIII, IX, X, XI : confirmés
    après design — aucune dérive vs pré-recherche
  - Principe XII (SEO) : reste partiellement conforme (intake n'est pas
    page SEO cible, SSR + métadonnées + JSON-LD posés). Justifié.
  - **Nouveau** : R2 décide `intake_audit_entries` séparée → cohérent
    avec Principe V (frontières modulaires). ADR-0017 à créer en
    `/speckit-tasks` pour formaliser.
- [ ] Prêt pour `/speckit-tasks`
