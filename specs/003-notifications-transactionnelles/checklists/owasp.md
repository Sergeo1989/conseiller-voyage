# Audit OWASP Top 10 2021 — Feature 003 Notifications transactionnelles

**Date** : 2026-05-27  
**Feature** : 003 — notifications + courriel transactionnel  
**Référence** : [OWASP Top 10 2021](https://owasp.org/Top10/)

Légende : ✅ OK · 🟡 Partiel · ⏳ À faire · ❌ Problème identifié

---

## A01 — Broken Access Control

| Item | Statut | Détail |
|---|---|---|
| Tous les endpoints `/api/admin/notifications/**` protégés par `AuthGuard` + `RoleGuard('admin')` | ✅ | T123 — guards sur le controller entier |
| Server Actions Next.js vérifient `session.user.role === 'admin'` avant toute mutation | ✅ | T130 — `removeFromSuppressionAction`, `retryDeadLetterAction` |
| Webhook SNS accessible uniquement depuis la Lambda interne (signature HMAC validée) | ✅ | T085 — `SnsWebhookGuard` valide `X-Cv-Sns-Hmac-Signature` |
| Aucune donnée personnelle exposée via les endpoints publics | ✅ | Les hash HMAC (jamais l'email en clair) sont les seuls identifiants exposés dans les APIs admin |

**Verdict A01 : ✅**

---

## A02 — Cryptographic Failures

| Item | Statut | Détail |
|---|---|---|
| Hash HMAC-SHA-256 avec pepper (pas SHA-256 nu) | ✅ | ADR-0013 — pepper stocké en AWS Secrets Manager `ca-central-1` |
| Transport TLS obligatoire (HTTPS) | ✅ | CloudFront + ALB en terminaison TLS |
| Emails en clair effacés après rétention 24 mois | ✅ | T138 — `NotificationRetentionSweepJob` cron mensuel |
| Secrets jamais loggés (redact Pino) | ✅ | T006 README + `pino.redact` sur les chemins d'emails |
| `NOTIFICATIONS_EMAIL_HASH_PEPPER` en Secrets Manager (jamais en dur) | ✅ | `env.ts` lit depuis `process.env`, injecté par ECS Task Definition depuis Secrets Manager |

**Verdict A02 : ✅**

---

## A03 — Injection

| Item | Statut | Détail |
|---|---|---|
| Toutes les requêtes DB via Prisma (ORM paramétré — pas de SQL brut) | ✅ | Aucune requête raw Prisma dans le module |
| Entrées admin validées côté serveur (Zod) avant tout traitement | ✅ | T123 + T130 — Zod inline sur chaque endpoint/action |
| Pas de template injection dans `react-email` (interpolation sécurisée JSX) | ✅ | JSX échappe automatiquement les valeurs |
| Corps HTML/texte de l'email jamais construit par concaténation de chaînes non-sanitisées | ✅ | `ReactEmailRenderer` utilise le rendu React — pas de `innerHTML` |

**Verdict A03 : ✅**

---

## A04 — Insecure Design

| Item | Statut | Détail |
|---|---|---|
| Modèle de menace couvert : rebond SES → suppression automatique | ✅ | T061 — `RecordBounceUseCase` + suppression list |
| Idempotence sur toutes les opérations critiques (insert log, upsert suppression, retry) | ✅ | `correlationId` unique + Idempotency-Key header |
| DLQ : max 5 tentatives avant dead-letter, retry manuel avec motif obligatoire | ✅ | T122 — `RetryDeadLetterUseCase` + FR-029 motif ≥ 10 chars |
| Rétention et effacement (Loi 25) documentés et automatisés | ✅ | T136-T139 — sweep jobs |

**Verdict A04 : ✅**

---

## A05 — Security Misconfiguration

| Item | Statut | Détail |
|---|---|---|
| Env-vars de production jamais committées | ✅ | `.gitignore` couvre `.env*` ; secrets via Secrets Manager |
| CORS configuré sur le serveur NestJS | 🟡 | Géré au niveau CDK/ALB — à vérifier lors du premier déploiement staging |
| En-têtes HTTP de sécurité (CSP, HSTS, X-Frame-Options) | 🟡 | Configurés dans `apps/web/next.config.ts` — à auditer avant launch public |
| LocalStack utilisé en dev (jamais de vrai SES en dev) | ✅ | `env.ts` + `docker-compose.yml` |

**Verdict A05 : 🟡** (2 items à vérifier en staging)

---

## A06 — Vulnerable and Outdated Components

| Item | Statut | Détail |
|---|---|---|
| Dépendances auditées (`pnpm audit`) | ⏳ | À exécuter avant merge vers `main` |
| Pas de dépendance directe avec CVE critique connue | ⏳ | À confirmer via `pnpm audit --audit-level critical` |

**Verdict A06 : ⏳** (à exécuter avant merge)

---

## A07 — Identification and Authentication Failures

| Item | Statut | Détail |
|---|---|---|
| Auth.js v5 sessions DB partagées (ADR-0004) | ✅ | `apps/web` + `apps/api` partagent la même session Prisma |
| Aucun endpoint admin sans auth | ✅ | `AuthGuard` + `RoleGuard('admin')` sur tout le controller |
| Webhook SNS authentifié par signature HMAC (partagé avec Lambda) | ✅ | T085 — `SnsWebhookGuard` |

**Verdict A07 : ✅**

---

## A08 — Software and Data Integrity Failures

| Item | Statut | Détail |
|---|---|---|
| Audit log append-only (triggers Postgres `BEFORE UPDATE/DELETE/TRUNCATE`) | ✅ | T027 — pattern identique à conformité (feature 001) |
| Pas de désérialisation non-fiable (JSON.parse sans validation Zod) | ✅ | Tous les inputs externes passent par Zod avant usage |
| Pipeline CI sur GitHub Actions (pas d'étape mutable sans review) | ✅ | `.github/workflows/` — protections de branche `main` |

**Verdict A08 : ✅**

---

## A09 — Security Logging and Monitoring Failures

| Item | Statut | Détail |
|---|---|---|
| Journal d'audit `notification_audit_entries` pour toutes les actions admin | ✅ | T123 — append sur remove-suppression et retry-dead-letter |
| Alertes Grafana configurées (bounce, complaint, DLQ, SNS idle) | ✅ | T105-T109 — `docs/dashboards/notifications-alerts.yaml` |
| Logs Pino avec `correlation_id` propagé dans chaque span | ✅ | T103 — trace context OTel injecté dans les jobs BullMQ |
| Logs d'audit exportés via OTel → Grafana Cloud Canada (ADR-0003) | ✅ | `otel.ts` — OTLP exporter `ca-central-1` endpoint |

**Verdict A09 : ✅**

---

## A10 — Server-Side Request Forgery (SSRF)

| Item | Statut | Détail |
|---|---|---|
| Aucun endpoint qui effectue des requêtes HTTP vers une URL fournie par l'utilisateur | ✅ | Les Server Actions et endpoints admin ne fetchent pas d'URLs externes dynamiques |
| `apiClient` interne utilise uniquement l'URL de base configurée en env | ✅ | `apps/web/src/app/_lib/api-client.ts` — URL fixe depuis env |

**Verdict A10 : ✅**

---

## Synthèse

| Catégorie | Statut |
|---|---|
| A01 Broken Access Control | ✅ |
| A02 Cryptographic Failures | ✅ |
| A03 Injection | ✅ |
| A04 Insecure Design | ✅ |
| A05 Security Misconfiguration | 🟡 CORS + en-têtes à valider en staging |
| A06 Vulnerable Components | ⏳ `pnpm audit` à exécuter |
| A07 Auth Failures | ✅ |
| A08 Software/Data Integrity | ✅ |
| A09 Logging Failures | ✅ |
| A10 SSRF | ✅ |

**8/10 ✅ · 1/10 🟡 · 1/10 ⏳ · 0/10 ❌**

Les items 🟡/⏳ sont non-bloquants pour le merge feature — ils seront résolus lors
du premier déploiement staging (A05) et lors de la revue pre-launch (A06).
