# Plan d'implémentation : Module Conformité

**Branche** : `001-conformite-module` | **Date** : 2026-05-22 | **Spec** : [spec.md](./spec.md)

**Entrée** : Spécification fonctionnelle issue de `specs/001-conformite-module/spec.md`

---

## Résumé

Le module `conformité` est le **gardien réglementaire** de la plateforme
(Principe I de la constitution) : source de vérité du statut « vérifié » d'un
conseiller, condition nécessaire à toute visibilité publique ou inclusion dans
un matching.

**Approche technique** : module NestJS isolé dans
`apps/api/src/modules/conformite/`, organisé en quatre couches selon le
Principe VIII (`domain` / `application` / `infrastructure` / `interface`).
Persistance Prisma sur PostgreSQL `ca-central-1`. Documents stockés en S3
`ca-central-1` (ADR-0001). Surveillance des expirations via job BullMQ
quotidien. Cache du statut publié via Redis avec invalidation explicite par
pub/sub (FR-022 : < 10 s pour transitions négatives). UI conseiller et admin
en Next.js App Router sous `apps/web/app/(conseiller)/conformite/` et
`apps/web/app/(admin)/conformite/`.

La fonction de calcul de statut (`computeConformiteStatus`) est implémentée
comme fonction pure dans la couche domaine, testée avant implémentation
conformément au Principe VI (NON-NÉGOCIABLE).

---

## Technical Context

Stack figée par la constitution v2.1.0 — détails par domaine ci-dessous.

| Élément | Valeur |
|---|---|
| Langage / version | TypeScript ≥ 5, mode `strict` |
| Build & quality | Turborepo (orchestration), Biome (lint+format), Husky + lint-staged, commitlint |
| Backend principal | NestJS 10+ avec **Fastify** (`@nestjs/platform-fastify`), Prisma 5+, BullMQ, ioredis, Zod, Pino, `@nestjs/swagger`, OpenTelemetry SDK |
| Backend AWS SDKs | `@aws-sdk/client-s3` + presigner (documents), `@aws-sdk/client-sesv2` (email), `@aws-sdk/client-secrets-manager` (secrets) |
| Frontend principal | Next.js 15 (App Router) + React 19, **Tailwind CSS v4**, react-hook-form + Zod resolver, **shadcn/ui** (Radix UI), Zustand, TanStack Query, lucide-react, date-fns (`fr-CA`), **next-intl**, **Auth.js v5** |
| Email templates | **react-email** rendu HTML statique + plain-text auto-généré |
| Paquet partagé | `packages/shared/conformite` — Zod schemas, types, contrats ; `packages/shared/auth` — schéma Prisma Auth.js partagé |
| DB primaire | PostgreSQL 16 en `ca-central-1` |
| Stockage objet | AWS S3 en `ca-central-1`, SSE-KMS, URLs signées 5 min (cf. [ADR-0001](../../docs/adr/0001-stockage-objet-canadien.md)) |
| Email transactionnel | AWS SES en `ca-central-1` (cf. [ADR-0006](../../docs/adr/0006-pivot-resend-vers-aws-ses.md)) |
| Cache et pub/sub | Redis 7 en `ca-central-1` (BullMQ + canal pub/sub d'invalidation) |
| Auth (web + API) | Auth.js v5 sessions DB lues par NestJS via Prisma (cf. [ADR-0004](../../docs/adr/0004-auth-session-db-partagee.md)) |
| Tests | Vitest (unit + intégration `@nestjs/testing`), Playwright (e2e), **Testcontainers** (Postgres + Redis isolés), **MSW** (mocks HTTP outbound) |
| Plateforme cible | Node.js 22 LTS, conteneurs Docker (distroless), **AWS ECS Fargate `ca-central-1`** (cf. [ADR-0005](../../docs/adr/0005-deploiement-aws-ecs-fargate.md)) |
| Infrastructure as Code | **AWS CDK** TypeScript |
| CDN | **AWS CloudFront** (assets statiques + image optimization Next.js via custom loader) |
| Observabilité | OTel SDK → **Grafana Cloud Canada** (cf. [ADR-0003](../../docs/adr/0003-observabilite-grafana-cloud-ca.md)) |
| Error tracking | **Sentry self-hosted** sur AWS `ca-central-1` (cf. [ADR-0007](../../docs/adr/0007-sentry-self-hosted.md)) |
| Secrets | AWS Secrets Manager `ca-central-1` (prod) ; 1Password CLI (dev) |
| Dev local | Docker Compose + LocalStack (S3/SES/KMS émulés) |
| Type de projet | Application web modulaire (Next.js + NestJS, monorepo pnpm + Turborepo) |
| Performance | p95 < 800 ms (Principe X) ; propagation statut < 60 s général / < 10 s négatives (FR-022) ; job quotidien d'expiration < 60 s pour 500 conseillers |
| Contraintes | Région CA obligatoire ; aucune transaction de voyage ; audit append-only 7 ans ; documents 5 MB × 5 max (PDF/JPG/PNG/HEIC) |
| Volumétrie année 1 | 50–500 conseillers, ~50 soumissions/mois en croissance, < 50 admins |

Aucun item « NEEDS CLARIFICATION » — la stack est figée par la constitution
v2.1.0 et toutes les décisions spécifiques à ce module sont documentées
dans `research.md` ou dans les ADR 0001 à 0007.

---

## Constitution Check

*Réalisé avant Phase 0. Re-vérifié après Phase 1 (cf. section finale).*

Source de vérité : [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v2.1.0.

### I. Conformité réglementaire par conception (NON-NÉGOCIABLE)

Ce module **EST** l'incarnation du Principe I. Il ne franchit en aucun cas la
frontière transactionnelle : aucune réservation, aucun encaissement client,
aucun versement à un fournisseur de voyage. Le seul flux financier mentionné
dans le spec (abonnement conseiller) est explicitement hors scope de ce
module et appartient au module `facturation`.

Le filtrage du statut « vérifié » est appliqué en couche de données (FR-007)
via l'interface publique `ConformiteQueryPort` (FR-006). Aucun accès direct
aux tables internes du module n'est permis — les autres modules consomment
exclusivement le port public.

✅ **Conforme.**

### II. Vie privée et Loi 25 (NON-NÉGOCIABLE)

Données personnelles collectées :
- Identifiant du conseiller (clé étrangère vers le module `identité`, pas de duplication PII).
- Certificat provincial (numéro, dates, province, document scanné).
- Affiliations (nom d'agence en clair, numéro de permis, document scanné).
- Journal d'audit (acteur admin, événement, payload pseudonymisé).

Justification par minimisation : chaque champ sert directement à la
vérification (Principe II + spec FR-016). Aucun champ marketing ou
démographique.

Résidence canadienne (FR-020) : PostgreSQL + S3 + Redis en `ca-central-1`
(cf. ADR-0001). Aucun sous-traitant tiers ne reçoit de PII identifiable
sans contrat de résidence canadienne.

Effacement (FR-017) : implémenté comme cas d'usage `EraseConseillerDataUseCase`.
Anonymisation du profil + des documents (overwrite + delete) ; conservation
du journal d'audit 7 ans (arbitrage légal documenté dans le spec).

Rétention conforme au tableau de la constitution : profil conseiller actif
(tant qu'actif), profil désactivé (pseudonymisation après 6 mois), audit
(7 ans, archivage chiffré).

**Pseudonymisation des payloads d'audit** (B5 du review résolu — cf.
[research.md R10](./research.md) et
[data-model.md](./data-model.md#règles-de-pseudonymisation-du-payload-auditentry-b5))
: la colonne `payload` de `conformite_audit_entries` ne peut JAMAIS contenir
de PII direct (email, téléphone, nom, adresse) ni de champ libre saisi.
Uniquement des références par UUID + énumérations + valeurs structurées
non-identifiantes. Schémas Zod par `eventType` enforcés à l'écriture +
test CI d'invariant.

✅ **Conforme.**

### III. Qualité de lead avant volume

**Non applicable directement** — ce module ne crée ni ne route de lead. Mais
il **conditionne** l'éligibilité au matching : aucun lead n'est routé vers
un conseiller dont `ConformiteQueryPort.isVerified()` retourne `false`.
L'impact est indirect mais critique.

✅ **Conforme par non-application.**

### IV. Français d'abord

Toute UI conseiller et admin livrée en FR-CA. Clés i18n dans
`packages/shared/conformite/i18n/fr-CA.json` ; structure prête pour ajout
EN ultérieur. Courriels transactionnels (résultat de revue, rappels
d'expiration, notification de révocation) livrés en FR-CA. Messages d'erreur
serveur en FR-CA (rendus par le DTO).

Formats régionaux : dates `dd MMMM yyyy` en FR-CA, heure 24h.

✅ **Conforme.**

### V. Architecture : monolithe modulaire

Module `conformite` dans le monolithe NestJS, situé sous
`apps/api/src/modules/conformite/`. Interface publique exposée via une
classe façade `ConformiteQueryFacade` (`apps/api/src/modules/conformite/interface/public-api/`)
qui implémente le contrat `ConformiteQueryPort` partagé dans
`packages/shared/conformite/`.

Aucun appel LLM dans ce module (validation des documents = manuelle par
admin). La sous-section *Coût et cache LLM* de la constitution est sans objet
ici.

**Enforcement de la frontière modulaire** (B4 du review résolu — cf.
[research.md R9](./research.md)) : règle Biome configurée pour interdire
l'import direct de tables Prisma préfixées d'un autre module. Test CI
dédié vérifie qu'aucun fichier sous `apps/api/src/modules/<X>/` n'importe
de type Prisma préfixé `<autre>_`. Les accès cross-module **DOIVENT**
passer par les façades `PublicApi`.

✅ **Conforme.**

### VI. Logique métier déterministe et testée (NON-NÉGOCIABLE)

La logique métier critique de ce module est :

1. **`computeConformiteStatus(certificats, affiliations, permitRevocations, now): Status`** — fonction pure dans `domain/services/`. Pas d'I/O, pas d'horloge sauvage (le paramètre `now` est injecté).
2. **`isTransitionAllowed(from, to): boolean`** — table de transitions du statut, fonction pure.
3. **`validateDossierSubmission(input): Result`** — validation Zod + règles métier (au moins 1 certificat, au moins 1 affiliation, formats).

Les tests **DOIVENT** être écrits avant l'implémentation dans des commits
séparés visibles dans git (cycle Red-Green-Refactor). Couverture par cas
métier explicite : cas nominal **et** cas d'erreur pour chaque branche.

✅ **Conforme — porte 2 de la constitution s'appliquera au moment des PR.**

### VII. Observabilité de la boucle économique

**Métriques de la boucle économique (intake / leads / conversion / churn)** :
ce module n'en alimente aucune directement. Les modules consommateurs
(`matching`, `intake`) sont responsables de leurs propres métriques.

**Métriques propres au module conformité** (ajoutées au tableau de bord) :
- Nombre de soumissions/jour, en cours, en file.
- Délai moyen et p95 de la revue admin (cible SC-001 : 95 % en < 5 j ouvrables).
- Nombre de bascules automatiques `→ suspended` / jour (SC-002).
- Latence p99 de propagation d'un changement de statut (SC-010 : < 60 s général, < 10 s négatives).
- Nombre de cascades de retrait de permis et conseillers impactés (FR-015).
- Erreurs du job quotidien d'expiration et taux de redrive dead-letter.

Seuils d'alerte :
- File `pending` qui dépasse 5 jours ouvrables → WARN.
- Latence propagation > 10 s sur transition négative → CRITICAL (Principe I).
- Job d'expiration en échec 2 jours consécutifs → CRITICAL.

Tableau de bord lié dans `apps/api/src/modules/conformite/README.md` à la
mise en production (porte 4).

✅ **Conforme — instrumentation détaillée dans data-model.md et research.md.**

### VIII. Clean Architecture et SOLID

Structure en quatre couches strictes (cf. *Project Structure* plus bas) :

- `domain/` : entités (`ConseillerCompliance`, `Certificat`, `Affiliation`, `AuditEntry`), value objects (`ConformiteStatus`, `Province`, `PermitNumber`), événements de domaine. Zéro import NestJS, Prisma, Zod.
- `application/` : 10 cas d'usage nommés `*UseCase`, chacun avec une méthode `execute`. Ports déclarés (`ConformiteRepository`, `DocumentStoragePort`, `AuditLogWriter`, `NotificationPort`, `ConformiteEventPublisher`, `Clock`).
- `infrastructure/` : 6 adaptateurs concrets (`PrismaConformiteRepository`, `S3DocumentStorage`, `PrismaAuditLogWriter`, `BullmqNotification`, `RedisConformiteEventPublisher`, `SystemClock`) + 2 jobs BullMQ.
- `interface/` : 3 contrôleurs HTTP NestJS (conseiller, admin, public-api), 1 façade module interne.

SOLID appliqué concrètement :
- **S** : un cas d'usage = une action (`SubmitDossierUseCase` ≠ `ApproveDossierUseCase` ≠ `RefuseDossierUseCase`). Pas de fourre-tout.
- **O** : ajout d'une nouvelle action métier = nouveau cas d'usage, pas de modification d'une classe chargée de `if`.
- **L** : les ports ont des fakes en mémoire utilisés dans les tests Vitest, interchangeables sans effet de bord caché.
- **I** : `ConformiteRepository` est scindé en `ConformiteReader` et `ConformiteWriter` (un consommateur lecture pure ne dépend pas du writer).
- **D** : application dépend uniquement des ports (interfaces TypeScript dans `application/ports/`), jamais d'une classe Prisma ou AWS.

✅ **Conforme.**

### IX. Sécurité applicative (NON-NÉGOCIABLE)

- **RBAC en couche application** : chaque cas d'usage vérifie le rôle de
  l'acteur (paramètre `requestedBy: { id, role }`). Les contrôleurs NestJS
  ne font que router et passer le contexte ; pas de logique d'autorisation
  dans le contrôleur.
- **AuthN** : Auth.js v5 côté Next.js avec sessions DB ; NestJS lit la
  même table `auth_sessions` via Prisma pour valider (cf.
  [ADR-0004](../../docs/adr/0004-auth-session-db-partagee.md)). Conseiller
  MFA TOTP/passkey obligatoire avant accès aux leads (élévation de session
  < 30 min pour les actions sensibles : approbation, refus, révocation,
  déclaration de retrait de permis).
- **CSRF** (B6 du review résolu — cf.
  [research.md R11](./research.md)) : double défense — cookie
  `__Host-cv.session.token` avec `SameSite=Lax` + header obligatoire
  `X-Requested-By: web` sur toute mutation, vérifié par
  `CsrfProtectionMiddleware`.
- **Validation Zod côté serveur** : tous les DTO d'entrée passent par un
  pipe NestJS Zod. Les schémas sont partagés avec le frontend via
  `packages/shared/conformite/schemas.ts`. **Aucun `class-validator`** —
  cohérence Stack canonique v2.1.0.
- **En-têtes HTTP** : configuration de sécurité Fastify (CSP strict, HSTS,
  X-Content-Type-Options, Referrer-Policy, Permissions-Policy) appliquée
  globalement, ajustée par environnement.
- **Checklist OWASP Top 10** revue pour chaque endpoint (cf.
  `contracts/http-endpoints.md`).
- **Secrets** : aucun en clair. AWS Secrets Manager `ca-central-1` en prod,
  1Password CLI en dev. Rotation annuelle minimum, mensuelle pour clés LLM.
- **Aucun SQL brut** : Prisma exclusivement. Tout besoin de SQL paramétré
  doit passer par `prisma.$queryRaw` avec template literal (qui échappe les
  paramètres) — utilisation à justifier par ADR si nécessaire.
- **Uploads** : URLs signées S3 PUT de durée 5 minutes, **persistées en DB
  via `UploadIntent`** (B2 du review résolu — cf.
  [research.md R8](./research.md) et [data-model.md](./data-model.md)).
  Validation MIME et Content-Length côté serveur après upload contre le
  registre `UploadIntent`. Scan antivirus différé à un spec ultérieur (cf.
  recherche, R5).

✅ **Conforme.**

### X. Fiabilité et résilience

**SLO** :
- Disponibilité du module : 99,5 % mensuel (constitution).
- Latence p95 sur tous les endpoints HTTP de ce module : < 800 ms.
- Latence propagation statut : < 60 s général / < 10 s pour transitions négatives (spec FR-022, SC-010).

**Idempotence** obligatoire (cf. constitution, Principe X) sur :
- Soumission de dossier (`POST /api/conformite/submissions`)
- Approbation, refus, révocation par admin
- Déclaration de retrait de permis
- Demande d'effacement Loi 25

Implémentation : middleware NestJS `IdempotencyInterceptor` qui lit le header
`Idempotency-Key`, persiste `(key, response)` 7 jours dans Redis, et retourne
la réponse cachée pour les rejeux.

**Fiabilité des événements de domaine** (B1 du review résolu — cf.
[research.md R7](./research.md)) : pattern **outbox transactionnel**. Toute
mutation métier (`ConformiteStatusChanged`, `PermitRevoked`, etc.) écrit dans
la table `conformite_outbox` dans la **même transaction Prisma** que la
mutation. Un worker BullMQ `OutboxPublisherWorker` lit les rows non publiées,
les diffuse via `ConformiteEventPublisher`, marque `publishedAt`. Garantit
at-least-once même en cas de crash entre commit DB et publication. Les
consommateurs doivent être idempotents (filtre par `event.id`).

**Modes dégradés** :
- **S3 HS** → soumissions impossibles, bannière UI explicite, file BullMQ
  d'upload différé pour retry quand S3 revient ; consultation d'un dossier
  existant reste possible (la DB Postgres a les métadonnées).
- **Redis HS** → l'invalidation de cache de statut peut prendre jusqu'à 60 s
  via le fallback TTL court (5 s ; sous le seuil de 60 s général de FR-022).
  Les transitions négatives basculent en mode « lecture DB directe » pour
  garantir < 10 s, avec impact latence p95 (acceptable en dégradé).
- **DB primaire HS** → bascule lecture seule depuis réplique, UI en mode
  consultation, soumissions et décisions admin bloquées avec message clair.
- **Outbox worker HS** → les événements s'accumulent dans `conformite_outbox`
  (la mutation métier réussit quand même puisqu'elle est transactionnelle).
  Au redémarrage, le worker rattrape le retard. Alerte ops si la
  profondeur dépasse 100 lignes ou si une row stagne > 5 minutes.

**Circuit breakers** sur appels S3, SES, et le module identité (publication
événement) : ouverture après 5 échecs en 60 s.

**Health checks** : `/healthz` (Node up + connexion Prisma OK) et `/readyz`
(Prisma + Redis + S3 PutObject test).

✅ **Conforme.**

### Definition of Done

La DoD complète de la constitution (section *Flux de développement et portes
qualité*) **sera cochée intégralement** avant le merge du PR final
d'implémentation. Items spécifiques à surveiller pour ce module :

- Tests TDD écrits **avant** implémentation pour `computeConformiteStatus`
  et `isTransitionAllowed` (commits visibles).
- Tableau de bord d'observabilité créé et lié dans le README du module.
- ADR-0001 (stockage objet) accepté avant déploiement.
- Migration Prisma testée en staging avec rollback applicatif vérifié.
- Audit `axe-core` sur les pages UI conseiller et admin.
- Lighthouse CI sur les pages publiques (espace conseiller exposé via
  authentification — pas indexé public, donc CWV mesuré en interne).

---

## Issues du review du plan résolues

Le review interne du plan v1 (avant amendement constitution v2.1.0) a
identifié 6 blockers techniques. Tous sont désormais résolus dans ce plan
ou dans les artefacts associés. Récapitulatif pour traçabilité :

| ID | Sujet | Résolution | Référence |
|---|---|---|---|
| **B1** | Pattern outbox pour fiabilité des événements | Table `conformite_outbox`, worker `OutboxPublisherWorker`, transaction Prisma unique mutation + outbox | [research.md R7](./research.md), [data-model.md `OutboxEntry`](./data-model.md), Principe X ci-dessus |
| **B2** | Registre des intentions d'upload (uploadId non forgeable) | Table `conformite_upload_intents`, validation post-upload (HEAD S3 + correspondance MIME / size) | [research.md R8](./research.md), [data-model.md `UploadIntent`](./data-model.md), [contracts/http-endpoints.md](./contracts/http-endpoints.md) |
| **B3** | Topologie Next.js ↔ NestJS (passage de session) | Auth.js v5 stocke les sessions dans Postgres ; NestJS lit la même table via Prisma. Pas de JWT, pas de secret partagé | [ADR-0004](../../docs/adr/0004-auth-session-db-partagee.md) |
| **B4** | Enforcement de la frontière modulaire (Principe V) | Règle Biome interdisant l'import direct de Prisma tables `<autre_module>_*` + test CI bloquant | [research.md R9](./research.md), Principe V ci-dessus |
| **B5** | Pseudonymisation des payloads d'audit (Loi 25 + 7 ans) | Règle stricte : aucun PII direct dans `payload` ; schémas Zod par `eventType` ; test CI d'invariant | [research.md R10](./research.md), [data-model.md *Règles de pseudonymisation*](./data-model.md), Principe II ci-dessus |
| **B6** | CSRF protection sur l'API NestJS (cookies de session) | Cookie `SameSite=Lax` + header obligatoire `X-Requested-By: web` vérifié par middleware | [research.md R11](./research.md), [contracts/http-endpoints.md *Défenses transversales*](./contracts/http-endpoints.md), Principe IX ci-dessus |

Aucun blocker restant. Les hauts (H1–H7) et nice-to-have (N1–N8) du review
sont traités au fil de l'implémentation et n'imposent pas de refonte
préalable.

---

## Project Structure

### Documentation de cette feature

```text
specs/001-conformite-module/
├── plan.md                # Ce fichier
├── spec.md                # Spécification fonctionnelle (mergée)
├── research.md            # Phase 0 — décisions techniques motivées
├── data-model.md          # Phase 1 — entités, schéma Prisma, machine d'état
├── contracts/             # Phase 1 — contrats d'interface
│   ├── conformite-query.port.md    # Port public consommé par les autres modules
│   ├── http-endpoints.md           # Endpoints HTTP conseiller + admin
│   └── events.md                   # Événements de domaine publiés
├── quickstart.md          # Setup local + parcours de test
├── checklists/
│   └── requirements.md    # Validation post-spec et post-clarification
└── tasks.md               # Phase 2 (à venir, généré par /speckit-tasks)
```

ADR associé :

```text
docs/adr/
└── 0001-stockage-objet-canadien.md   # Choix S3 ca-central-1
```

### Code source

```text
conseiller-voyage/                        # racine du monorepo pnpm
├── apps/
│   ├── api/                              # NestJS — backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   └── conformite/           # ← MODULE CIBLE
│   │   │   │       ├── domain/
│   │   │   │       │   ├── entities/
│   │   │   │       │   │   ├── conseiller-compliance.entity.ts
│   │   │   │       │   │   ├── certificat.entity.ts
│   │   │   │       │   │   ├── affiliation.entity.ts
│   │   │   │       │   │   └── audit-entry.entity.ts
│   │   │   │       │   ├── value-objects/
│   │   │   │       │   │   ├── conformite-status.vo.ts
│   │   │   │       │   │   ├── province.vo.ts
│   │   │   │       │   │   └── permit-number.vo.ts
│   │   │   │       │   ├── events/
│   │   │   │       │   │   ├── conformite-status-changed.event.ts
│   │   │   │       │   │   └── permit-revoked.event.ts
│   │   │   │       │   └── services/
│   │   │   │       │       ├── compute-conformite-status.ts        # PURE
│   │   │   │       │       └── is-transition-allowed.ts             # PURE
│   │   │   │       ├── application/
│   │   │   │       │   ├── use-cases/
│   │   │   │       │   │   ├── submit-dossier.use-case.ts
│   │   │   │       │   │   ├── request-upload-urls.use-case.ts       # B2 du review
│   │   │   │       │   │   ├── approve-dossier.use-case.ts
│   │   │   │       │   │   ├── refuse-dossier.use-case.ts
│   │   │   │       │   │   ├── revoke-conseiller.use-case.ts
│   │   │   │       │   │   ├── declare-permit-revoked.use-case.ts
│   │   │   │       │   │   ├── propagate-expirations.use-case.ts
│   │   │   │       │   │   ├── send-expiration-reminders.use-case.ts
│   │   │   │       │   │   ├── get-verification-status.use-case.ts
│   │   │   │       │   │   ├── view-conseiller-dossier.use-case.ts
│   │   │   │       │   │   └── erase-conseiller-data.use-case.ts
│   │   │   │       │   ├── audit/
│   │   │   │       │   │   └── payload-schemas.ts                    # B5 du review
│   │   │   │       │   └── ports/
│   │   │   │       │       ├── conformite-reader.port.ts
│   │   │   │       │       ├── conformite-writer.port.ts
│   │   │   │       │       ├── document-storage.port.ts
│   │   │   │       │       ├── audit-log-writer.port.ts
│   │   │   │       │       ├── notification.port.ts
│   │   │   │       │       ├── conformite-event-publisher.port.ts
│   │   │   │       │       └── clock.port.ts
│   │   │   │       ├── infrastructure/
│   │   │   │       │   ├── prisma-conformite-repository.ts
│   │   │   │       │   ├── s3-document-storage.ts
│   │   │   │       │   ├── prisma-audit-log-writer.ts
│   │   │   │       │   ├── bullmq-notification.ts
│   │   │   │       │   ├── redis-conformite-event-publisher.ts
│   │   │   │       │   ├── system-clock.ts
│   │   │   │       │   └── jobs/
│   │   │   │       │       ├── expiration-sweep.job.ts
│   │   │   │       │       ├── reminder-fanout.job.ts
│   │   │   │       │       ├── outbox-publisher.job.ts                # B1 du review
│   │   │   │       │       └── upload-intent-cleanup.job.ts           # B2 du review
│   │   │   │       ├── interface/
│   │   │   │       │   ├── http/
│   │   │   │       │   │   ├── conseiller-conformite.controller.ts
│   │   │   │       │   │   ├── admin-conformite.controller.ts
│   │   │   │       │   │   └── dto/
│   │   │   │       │   ├── public-api/
│   │   │   │       │   │   └── conformite-query.facade.ts
│   │   │   │       │   └── conformite.module.ts          # wiring NestJS DI
│   │   │   │       └── README.md
│   │   │   ├── main.ts
│   │   │   └── app.module.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── test/
│   │       ├── unit/conformite/         # Vitest unit tests
│   │       ├── integration/conformite/  # NestJS module tests
│   │       └── e2e/                     # Playwright (cross-app)
│   └── web/                             # Next.js — frontend
│       ├── app/
│       │   ├── (conseiller)/
│       │   │   └── conformite/
│       │   │       ├── page.tsx         # Statut + dossier (US5)
│       │   │       ├── soumettre/page.tsx   # Soumission (US1)
│       │   │       └── renouveler/page.tsx  # Renouvellement (US2 partiel)
│       │   └── (admin)/
│       │       └── conformite/
│       │           ├── page.tsx         # File paginée (FR-003)
│       │           ├── [dossierId]/page.tsx   # Revue d'un dossier (US1)
│       │           ├── conseillers/[id]/page.tsx   # Vue + actions (US4)
│       │           └── permis/page.tsx  # Déclaration retrait (FR-015)
│       └── ...
└── packages/
    └── shared/
        └── conformite/
            ├── schemas.ts               # Zod schemas (DTO partagés)
            ├── contracts.ts             # TypeScript types + ports publics
            ├── i18n/
            │   └── fr-CA.json
            └── index.ts
```

**Decision de structure** : monorepo pnpm avec backend NestJS dans `apps/api`,
frontend Next.js dans `apps/web`, contrats et schémas Zod partagés dans
`packages/shared/conformite/`. La séparation `apps/api` ↔ `apps/web` est
imposée par la *Stack canonique* de la constitution.

---

## Phase 0 — Recherche

Cf. [`research.md`](./research.md). Décisions traitées :

1. Stockage objet en région canadienne (formalisé dans ADR-0001).
2. Pattern d'audit log append-only en PostgreSQL.
3. Stratégie de cache et propagation pour FR-022 (< 10 s négatives).
4. Mécanisme inter-module pour notifier le conseiller (domain event ↔ module identité).
5. Scan antivirus des documents soumis (différé, décision motivée).
6. Dépendance au module identité (Auth.js v5, session DB partagée — cf. ADR-0004).
7. **Pattern outbox transactionnel** pour la fiabilité des événements (B1 résolu).
8. **Registre `UploadIntent`** pour empêcher la forge d'`uploadId` (B2 résolu).
9. **Enforcement Biome** de la frontière modulaire (B4 résolu).
10. **Règles de pseudonymisation** des payloads d'audit (B5 résolu).
11. **Stratégie CSRF** par cookie SameSite + custom header (B6 résolu).

---

## Phase 1 — Design & Contrats

### Artefacts générés

- [`data-model.md`](./data-model.md) — entités du domaine (incluant `OutboxEntry`, `UploadIntent`), schéma Prisma proposé, machine d'état, règles de pseudonymisation audit (B5).
- [`contracts/conformite-query.port.md`](./contracts/conformite-query.port.md) — port public consommé par les autres modules.
- [`contracts/http-endpoints.md`](./contracts/http-endpoints.md) — endpoints HTTP conseiller + admin avec défenses transversales (CSRF, en-têtes), checklist OWASP par endpoint.
- [`contracts/events.md`](./contracts/events.md) — événements de domaine publiés.
- [`quickstart.md`](./quickstart.md) — setup local + parcours de test minimal pour validation manuelle.

### ADRs liés

- [ADR-0001](../../docs/adr/0001-stockage-objet-canadien.md) — Stockage objet AWS S3 ca-central-1.
- [ADR-0003](../../docs/adr/0003-observabilite-grafana-cloud-ca.md) — Backend d'observabilité Grafana Cloud Canada.
- [ADR-0004](../../docs/adr/0004-auth-session-db-partagee.md) — Auth.js + session DB partagée NestJS.
- [ADR-0005](../../docs/adr/0005-deploiement-aws-ecs-fargate.md) — Déploiement AWS ECS Fargate ca-central-1.
- [ADR-0006](../../docs/adr/0006-pivot-resend-vers-aws-ses.md) — Pivot Resend → AWS SES.
- [ADR-0007](../../docs/adr/0007-sentry-self-hosted.md) — Sentry self-hosted ca-central-1.

ADRs additionnels à créer pendant ou après l'implémentation, selon le besoin :

- ADR-0008 (à venir) — Choix de fournisseur LLM pour la feature 009 (intake-LLM). AWS Bedrock `ca-central-1` (Claude / Anthropic) probable défaut, à valider.

### Mise à jour du contexte agent

`CLAUDE.md` à la racine pointe désormais vers ce plan via le bloc
`<!-- SPECKIT START / END -->`.

---

## Re-vérification Constitution Check (post-design)

Toutes les contraintes adressées en pré-design restent satisfaites. Les 6
blockers techniques du review (B1-B6) sont résolus dans la section *Issues
du review du plan résolues* ci-dessus. La stack canonique v2.1.0 (Biome,
Turborepo, Fastify, Auth.js v5, AWS SES, AWS ECS Fargate, Grafana Cloud
Canada, Sentry self-hosted, AWS CDK, CloudFront) est intégrée dans
*Technical Context*. Aucun ajout de violation, aucune dérogation à
justifier.

✅ **Le plan est prêt pour `/speckit.tasks`.**

---

## Complexity Tracking

> Aucune violation du Constitution Check. Aucune dérogation à justifier.
> *Section laissée vide intentionnellement.*
