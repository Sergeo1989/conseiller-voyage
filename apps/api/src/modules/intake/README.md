# Module `intake` — Préqualification voyageur

Feature 002 — `002-voyageur-intake`. Capture un brief de voyage qualifié
d'un voyageur francophone (FR-CA prioritaire, EN J1) via un formulaire
5 étapes (≤ 7 min), et le rend consommable par la feature matching
future (ID roadmap 011).

## Périmètre

- ✅ Soumission brief 5 étapes (US1)
- ✅ Vérification email magic link (US1)
- ✅ Récap brief + liste mes-briefs (US2, FR-017)
- ✅ Multi-briefs anti-spam (US3 — rate-limit FR-019/020/020a +
  disposable emails FR-021)
- ✅ Effacement Loi 25 brief seul (US4, FR-022) + global (FR-022a, C1)
- ✅ File admin briefs non-matchés + push manuel vers conseiller vérifié
  (US5, FR-026 + FR-027 + FR-028)
- ⏳ Jobs background (Phase 8 — expiration sweep, reminder J-7, retry SES)

## Architecture (Principe VIII — 4 couches)

```
src/modules/intake/
├── domain/
│   ├── entities/       # VoyageurBrief, VoyageurContact, MagicLinkToken
│   ├── value-objects/  # TravelBudget, TravelSpeciality, TravelFamiliarity, DatesFlexibility
│   ├── services/       # signMagicLink, computeBriefExpiration, validateBriefSubmission
│   └── events/         # brief-submitted, brief-verified
├── application/
│   ├── ports/          # 10 ports applicatifs (Reader/Writer + Mailer + Checker + Limiter + Audit + Outbox)
│   └── use-cases/      # 10 use cases (Submit, Verify, View, List, Resend, Erase, EraseAll, ListUnmatched, PushManual, …)
├── infrastructure/
│   ├── prisma-*.ts     # 5 adapters Prisma (Brief, Contact, Token, Audit, Outbox)
│   ├── redis-intake-rate-limiter.ts
│   ├── disposable-email-checker.ts
│   ├── ses-magic-link-mailer.ts
│   └── jobs/           # 4 BullMQ jobs (refresh disposable, sweep expiration, reminder, retry)
└── interface/
    └── http/
        ├── voyageur-intake.controller.ts  # public + voyageur authentifié
        ├── admin-intake.controller.ts     # admin RBAC
        ├── intake-auth.guard.ts           # validation cookie session voyageur
        ├── rolling-session-cookie.interceptor.ts  # FR-014a Q5
        └── skip-rolling-renewal.decorator.ts
```

## Endpoints HTTP

| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/intake/briefs` | public | Soumettre un brief (FR-001-013) |
| POST | `/api/intake/briefs/verify` | public | Consommer magic link (FR-014) |
| POST | `/api/intake/briefs/:id/resend-magic-link` | public | Renvoyer magic link (FR-015, anti-énumération) |
| GET | `/api/intake/briefs/:briefId` | voyageur cookie | Récap brief (US2) |
| GET | `/api/intake/briefs/by-email` | voyageur cookie | Liste briefs actifs (FR-017) |
| POST | `/api/intake/briefs/:id/erasure-request` | voyageur cookie | Effacement brief seul (FR-022) |
| POST | `/api/intake/voyageur/erase-all-data` | voyageur cookie | Effacement global (FR-022a) |
| GET | `/api/intake/admin/unmatched` | admin RBAC | File briefs > 4h sans match (FR-026) |
| GET | `/api/intake/admin/briefs/:briefId` | admin RBAC | Détail brief admin |
| POST | `/api/intake/admin/briefs/:id/push-manual` | admin RBAC + Idempotency-Key | Push manuel (FR-027 + FR-028) |

## Dépendances cross-module

| Module | Port consommé | Usage |
|---|---|---|
| `identite` | `AuthGuard`, `RoleGuard`, `AUTH_SESSION_READER` | Endpoints admin US5 |
| `conformite` | `CONFORMITE_QUERY_PORT.getVerificationStatus` | Push manuel — lookup conseiller vérifié (FR-027) |
| `common` | `Clock`, `UuidGenerator`, `REDIS_CLIENT` | Testabilité + rate-limit + disposable |

Le module **n'expose** qu'une seule facade publique : aucune. Les
événements outbox sont la source d'intégration aval :

- `voyageur.brief.activated` — consommé par feature matching (011)
- `voyageur.brief.deleted` — consommé par audit Loi 25 + SEO (016)
- `voyageur.brief.expired` — consommé par matching + nettoyage
- `voyageur.brief.pushed_manual` — consommé par devis (012)

## Migrations DB

3 migrations Prisma append-only :

1. `20260528170001_init_intake` — 5 tables + enums + indexes + FK
2. `20260528170002_intake_audit_append_only` — trigger + rôle `app_intake`
   least privilege + grants cross-module
3. `20260528170003_intake_anonymisation_trigger` — idempotence Loi 25
   sur contact + brief

## Tests

- **Unit** : 360+ tests Vitest (domain VO/services, use cases avec fakes
  en mémoire, interceptor)
- **Integration** : 6 fichiers Testcontainers Postgres + Redis (golden
  paths + rate-limit + disposable + erasure + admin guards)
- **E2e** : 4 fichiers Playwright (submit + verify + erasure + admin)
- **A11y** : 3 fichiers axe-core (form 5 steps + erasure + admin)

## Variables d'environnement

Cf. `apps/api/src/env.ts` :

| Var | Défaut | Description |
|---|---|---|
| `INTAKE_MAGIC_LINK_SECRET` | dev-only-... | HMAC SHA-256 token (ADR-0018) |
| `INTAKE_DISPOSABLE_EMAILS_REFRESH_INTERVAL_HOURS` | 168 | Cron refresh (7j) |
| `INTAKE_RATE_LIMIT_EMAIL_PER_24H` | 3 | Plafond email (FR-019) |
| `INTAKE_RATE_LIMIT_IP_PER_24H` | 5 | Plafond IP (FR-020) |
| `INTAKE_BRIEF_EXPIRATION_DAYS` | 90 | Rétention active (FR-024) |

## ADRs

- [ADR-0017](../../../../../docs/adr/0017-intake-audit-table-separee.md) — Table audit séparée
- [ADR-0018](../../../../../docs/adr/0018-intake-magic-link-token-db.md) — Magic link random DB
- [ADR-0019](../../../../../docs/adr/0019-intake-disposable-emails-list.md) — Liste disposable 3-tier

## Enrichissement LLM (feature 016 / roadmap 009)

Couche best-effort au-dessus du brief : `EnrichBriefJob` (sur `voyageur.brief.activated`)
scrub PII → `LlmProvider` (Bedrock ca-central-1) → validation Zod → `BriefEnrichment` →
publie `voyageur.brief.enriched` (consommé par le matching repointé). Résout
`speciality='autre'` → canonique + augmente les destinations, sans toucher aux règles de
scoring. Mode dégradé sûr par défaut (`DegradedLlmProvider`) tant que Bedrock (T031) n'est
pas branché. Aucun texte libre ni PII persisté ; cascade Loi 25 par trigger. Détail :
[`docs/runbooks/intake-enrichment.md`](../../../../../docs/runbooks/intake-enrichment.md) +
[`specs/016-intake-llm-enrichment/`](../../../../../specs/016-intake-llm-enrichment/).

## Notifications voyageur (feature 017 / roadmap 010)

Couche de **notification + suivi côté voyageur** au-dessus du matching. Sur l'issue du
brief (`matched`/`partially_matched`/`unmatched`), le matching — déjà dédupliqué — appelle
le port public `VoyageurMatchNotifier` (`@cv/shared/intake`) ; `NotifyBriefOutcomeUseCase`
applique l'anti-spam (issue inchangée → supprimée) et enfile une `VoyageurNotification`
(table `intake_voyageur_notifications`). À l'activation du brief, `VerifyMagicLinkUseCase`
enfile un accusé `accuse_activation`. Un drain périodique (`VoyageurNotificationDispatcher`)
crée **un job BullMQ par notification** ; le `Sender` rend le gabarit react-email FR-CA/EN
(prénom + spécialités **publics+vérifiés** via `ConseillerPublicDisplayReader`, **0 contact /
0 montant** — ADR-0002) et envoie via SES ca-central-1 (003). Le CTA renvoie au récap via un
**magic-link `view_brief_status` durable** (réutilisable 7 j, distinct du `verify_email`
one-time). Mode dégradé (SES HS → réessai), idempotence (UNIQUE `idempotencyKey`), cascade
Loi 25 (effacement → `annulee`), métriques OTel `cv.intake.voyageur_notification.*`. Détail :
[`docs/runbooks/intake-voyageur-notifications.md`](../../../../../docs/runbooks/intake-voyageur-notifications.md)
+ [`specs/017-voyageur-notif-suivi/`](../../../../../specs/017-voyageur-notif-suivi/) + ADR-0029.

## Runbooks

- [`intake-secrets-rotation`](../../../../../docs/runbooks/intake-secrets-rotation.md)
- [`intake-anonymisation-loi25`](../../../../../docs/runbooks/intake-anonymisation-loi25.md)
- [`intake-disposable-emails-monitoring`](../../../../../docs/runbooks/intake-disposable-emails-monitoring.md)
- [`intake-enrichment`](../../../../../docs/runbooks/intake-enrichment.md)
- [`intake-voyageur-notifications`](../../../../../docs/runbooks/intake-voyageur-notifications.md)
