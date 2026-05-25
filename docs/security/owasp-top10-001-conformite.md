# Audit OWASP Top 10 — Feature 001 Conformité

**Date** : 2026-05-25
**Périmètre** : Module conformité (T001-T125), tel que livré sur la
branche `001-conformite-module`.
**Référence** : OWASP Top 10 2021 (https://owasp.org/Top10/).
**Statut global** : ✅ 7/10, 🟡 2/10, ⏳ 1/10 (pen test formel pré-launch).

---

## A01:2021 — Broken Access Control ✅

**Risque** : un utilisateur accède à des ressources ou actions hors de son
rôle (e.g. conseiller approuve son propre dossier, voyageur voit un dossier
d'un autre).

**Mitigations en place** :

- **RBAC en couche application** : chaque use case (`approve-dossier`,
  `revoke-conseiller`, `request-erasure`, etc.) vérifie le `requestedBy.role`
  via une méthode `enforceRbac()` testée unitairement (cf.
  `apps/api/src/modules/conformite/application/use-cases/__tests__/*`).
- **AuthGuard NestJS** sur tous les contrôleurs HTTP — rejette
  401 si pas de session, 401 si role incorrect (cf. T019).
- **assertConseiller / assertAdmin** dans les contrôleurs HTTP filtre une
  seconde fois en interface — défense en profondeur (cf.
  `apps/api/src/modules/conformite/interface/http/{conseiller,admin}-conformite.controller.ts`).
- **Filtre `verified` en DB** : `PrismaConformiteRepository.listVerifiedCompliances()`
  exclut systématiquement les statuts non-`verified` ET les conseillers
  `anonymizedAt != null` — couche DB qui empêche un bug applicatif de leak
  un conseiller non-vérifié à l'extérieur (cf. test integration
  `verified-filter.integration.test.ts`).
- **Server Actions Next.js** : chaque action côté web vérifie aussi le
  cookie session AVANT d'appeler l'API NestJS (double vérification utile en
  cas de bug routage).

**Évaluation** : ✅ couvert avec défense en profondeur (3 couches : DB,
application, interface). Tests integration prouvent l'invariant DB.

---

## A02:2021 — Cryptographic Failures ✅

**Risque** : données sensibles transmises en clair, ou chiffrement faible.

**Mitigations en place** :

- **HTTPS partout en prod** : ECS + CloudFront avec certificat ACM
  ca-central-1 (cf. ADR-0005), HSTS via `@fastify/helmet` (`max-age=31536000`,
  `includeSubDomains`, `preload`).
- **Cookies session strict** : préfixe `__Host-` en prod (forçage HTTPS +
  path=/ + no Domain). En dev local, fallback `authjs.session-token` HTTP-compatible (cf. `apps/web/src/auth.config.ts`).
- **Encryption S3** : `ServerSideEncryption: AES256` forcé sur tous les
  PUT (presigned URL côté serveur), défense en profondeur + bucket policy
  prod imposera le même (cf. `s3-document-storage.ts`).
- **Hashes audit** : tous les payloads audit log incluent `idempotencyKey`
  hashé SHA-256 quand applicable (anti-replay).
- **Secrets** : AWS Secrets Manager en prod (task role ECS), `dotenv` en
  dev. Aucun secret hardcodé (vérifié par regex pre-commit hook).
- **Magic links signés** : tokens session générés via `crypto.randomBytes(32)`
  (256 bits d'entropie) — équivalent UUID v4 mais plus large.

**Évaluation** : ✅ standards modernes appliqués sans concession.

---

## A03:2021 — Injection ✅

**Risque** : SQL injection, NoSQL, OS command, LDAP.

**Mitigations en place** :

- **Pas de SQL brut sans ADR** : règle constitutionnelle (Principe IX).
  Les 2 seuls `$executeRawUnsafe` dans le code sont dans des tests
  d'intégration pour cleanup (avec préfixe UUID fixe contrôlé), pas en prod.
- **Prisma ORM** : tous les query métier passent par Prisma (paramétrés
  via le query engine, pas de concaténation de strings).
- **Validation Zod côté serveur** sur **chaque** entrée externe
  (Server Actions, contrôleurs NestJS) — schémas brandés (cf.
  `packages/shared/src/conformite/branded-ids.ts`) qui empêchent qu'un
  attaquant injecte un SubmissionId là où un CertificatId est attendu.
- **CSP** : `default-src 'self'` strict, pas d'`unsafe-eval`,
  `script-src 'self'` (cf. middleware Next.js + `@fastify/helmet` côté API).
- **Pas d'exec shell** côté application — les seuls `child_process` sont
  dans les scripts d'init Docker (scripts/localstack/01-init-s3.sh), pas
  exposés à l'utilisateur.

**Évaluation** : ✅ Prisma + Zod + CSP éliminent les vecteurs courants.
Pen test (porte ⏳ DoD) confirmera.

---

## A04:2021 — Insecure Design 🟡

**Risque** : choix d'architecture qui mène à des failures (e.g. session
sans expiry, pas de rate-limit).

**Mitigations en place** :

- **Sessions DB avec expiry 30j** + refresh quotidien (cf. ADR-0004 et
  `apps/web/src/auth.ts`).
- **Rate-limit côté NestJS** via `@nestjs/throttler` global (60 req / min
  par IP par défaut, à durcir par route).
- **Idempotency keys** sur toutes les mutations critiques (approve,
  refuse, revoke, erasure-request) — anti-replay et anti-double-click.
- **Audit log append-only** : trigger SQL refuse UPDATE/DELETE sur
  `conformite_audit_entries` (cf. test integration `audit-trigger`).
- **Effacement Loi 25 asynchrone** : DataRetentionSweepJob sur cycle 24 h,
  avec endpoint admin pour forcer manuellement.

**Points 🟡 (à compléter en pré-launch)** :

- **Rate-limit par route** plus granulaire que le global : actuellement
  60 req/min IP global. À durcir : 5 erasure-requests/jour/conseiller,
  10 dossier-submissions/jour/conseiller, etc.
- **Threat model formel** : pas encore documenté. Recommandé d'écrire un
  document `docs/security/threat-model-001.md` avec STRIDE par flux
  critique (soumission dossier, approbation, erasure).

**Évaluation** : 🟡 fondamentaux OK, mais le threat model formel et
le rate-limit granulaire sont à ajouter avant launch public.

---

## A05:2021 — Security Misconfiguration ✅

**Risque** : headers HTTP par défaut faibles, debug endpoints exposés, CORS
permissif.

**Mitigations en place** :

- **Helmet** côté API NestJS (`@fastify/helmet`) avec :
  - `Content-Security-Policy: default-src 'self'; ...`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Resource-Policy: same-site`
  - `Origin-Agent-Cluster: ?1`
- **CSP via middleware Next.js** : strict, pas d'`unsafe-eval`,
  `script-src 'self'` (T030e).
- **CORS** : pas activé sur l'API par défaut (les Server Actions Next.js
  agissent comme proxy authentifié → l'API NestJS ne reçoit jamais de
  requête cross-origin du navigateur).
- **Endpoints debug** : `/healthz` et `/readyz` exposés (publics OK, pas
  de données sensibles), Swagger UI `/api/docs` exposé en dev seulement
  (gated par `NODE_ENV !== 'production'` à vérifier en T030 ou ajouter).
- **Sentry sourcemaps** : self-hosted ca-central-1 (ADR-0007), sourcemaps
  uploadés + scrubbed des PII.

**Évaluation** : ✅ tous les headers attendus en place. Vérifier que
Swagger UI est bien désactivé en prod via env flag avant le launch.

**Action recommandée pré-launch** :

```ts
// apps/api/src/main.ts (à confirmer)
if (env.NODE_ENV !== 'production') {
  SwaggerModule.setup('api/docs', app, document);
}
```

---

## A06:2021 — Vulnerable and Outdated Components 🟡

**Risque** : dépendances avec CVE connus.

**Mitigations en place** :

- **License check** ✅ : 0 GPL/AGPL/SSPL/LGPL (vérifié 2026-05-25 via
  `license-checker-rseidelsohn`, 43 packages prod, all in [MIT, Apache-2.0,
  BSD-2-Clause, BSD-3-Clause, MPL-2.0]).
- **`pnpm audit`** : à wire en CI (TODO porte CI complète).
- **Renovate** : à activer (constitution §*Chaîne d'approvisionnement*).
- **CVE patching SLA** documenté dans constitution (critique 7 jours,
  haute 30 jours).

**Points 🟡** :

- **Renovate** : pas encore activé sur ce repo (besoin d'un remote
  GitHub/GitLab d'abord — porte ⏳ DoD).
- **`pnpm audit` en CI** : pas encore wired. À ajouter dans GitHub Actions
  workflow.
- **SBOM CycloneDX** : pas généré (constitution exige à chaque release).
  Reporter à l'étape déploiement.

**Évaluation** : 🟡 base saine (pas de licenses interdites, deps récentes),
mais l'automation Renovate + audit + SBOM reste à wire avant le launch.

---

## A07:2021 — Identification and Authentication Failures ✅

**Risque** : auth faible, sessions devinables, brute force, password
recovery vulnérable.

**Mitigations en place pour le module conformité (admin/conseiller)** :

- **Sessions stockées en DB** (Auth.js v5 → Prisma adapter, ou helper
  custom `auth()` directement sur AuthSession en attendant feature 006) —
  invalidation immédiate possible côté serveur.
- **Tokens session 256 bits d'entropie** (`crypto.randomBytes(32)`) — pas
  prédictibles.
- **Cookie `__Host-` strict en prod** : empêche fixation de session via
  un sous-domaine compromis.
- **Expiry 30j absolu** + refresh quotidien.
- **Pas d'auth basée sur password** dans ce module — la vraie auth (passkey
  TOTP conseiller, magic link voyageur, MFA admin) arrive en feature 002
  (intake) + 006 (identité).
- **Dev login** strictement gated par `NODE_ENV !== 'production'` (cf.
  `apps/web/src/app/[locale]/login/page.tsx` : `notFound()` en prod).

**Évaluation** : ✅ pour ce module. La feature 006 identité ajoutera passkey
+ TOTP avec leur propre audit de sécurité dédié.

---

## A08:2021 — Software and Data Integrity Failures ✅

**Risque** : intégrité du code (supply chain), des updates, ou des données.

**Mitigations en place** :

- **`pnpm-lock.yaml` committé** : verrouille les versions des deps
  transitives. Pas d'install latest auto.
- **Conventional Commits + commitlint** : empêche les commits frauduleux
  ou mal formés de passer le hook.
- **Audit log append-only** : intégrité des décisions admin
  (approve/refuse/revoke/erasure) garantie par trigger SQL Postgres,
  testé en integration.
- **Outbox pattern** : tous les évènements métier publiés en transaction
  avec la mutation, garantit livraison exactement-une-fois en aval (cf.
  `OutboxPublisherJob`).
- **Idempotency keys** sur les mutations sensibles (anti-double-soumission).
- **S3 versioning activé** : récupération en cas de modification accidentelle
  ou malicieuse d'un document soumis (cf.
  `scripts/localstack/01-init-s3.sh` — parité prod).

**Évaluation** : ✅ couvert. Le seul gap est la signature de packages tiers
(npm provenance), pas encore standard.

---

## A09:2021 — Security Logging and Monitoring Failures ✅

**Risque** : pas de détection d'incidents, pas d'alertes.

**Mitigations en place** :

- **OpenTelemetry** : traces, metrics, logs structurés vers Grafana Cloud
  Canada (ADR-0003).
- **Sentry self-hosted** ca-central-1 (ADR-0007) avec scrubbing des PII.
- **Pino logging structuré** côté NestJS, JSON, avec `req.id` correlation.
- **Audit log applicatif** : toutes les actions sensibles
  (approve/refuse/revoke/erasure/permit-revoke) tracées dans
  `conformite_audit_entries` (append-only).
- **Dashboard Grafana** :
  [`docs/dashboards/conformite.json`](../dashboards/conformite.json)
  avec métriques business :
  - `conformite_submission_age_business_days`
  - `conformite_status_propagation_seconds`
  - `conformite_outbox_unpublished_total`
  - `conformite_job_failures_total`
- **Alertes Grafana** :
  [`docs/dashboards/conformite-alerts.yaml`](../dashboards/conformite-alerts.yaml)
  (SLO-based, à activer post-déploiement staging).

**Évaluation** : ✅ infrastructure complète. L'activation effective des
alertes attend le déploiement staging (porte ⏳ DoD).

---

## A10:2021 — Server-Side Request Forgery (SSRF) ✅

**Risque** : l'app envoie une requête HTTP vers une URL contrôlée par
l'attaquant.

**Mitigations en place** :

- **Pas d'endpoint accepte une URL externe** dans le module conformité.
  Aucun fetch côté serveur depuis une input utilisateur.
- **S3 presigned URLs** : générées **côté serveur** avec un objectKey
  contrôlé par l'application (UUID + path préfixé `conformite/{id}/{uuid}`),
  l'utilisateur ne peut pas suggérer une clé S3 arbitraire.
- **Magic links de session** : domaine contrôlé par l'app, pas de
  redirect-after-login basé sur un param URL.
- **Egress restreint en prod** : security group ECS bloque sortie sauf
  RDS, ElastiCache, S3, SES, secrets-manager (à confirmer par revue CDK).

**Évaluation** : ✅ surface d'attaque inexistante par design.

---

## Résumé global

| OWASP # | Statut | Justification |
|---|---|---|
| A01 Broken Access Control | ✅ | RBAC 3 couches (DB + app + interface) testé |
| A02 Cryptographic Failures | ✅ | HTTPS + AES256 S3 + 256-bit tokens |
| A03 Injection | ✅ | Prisma + Zod + CSP strict |
| A04 Insecure Design | 🟡 | Rate-limit granulaire + threat model formel pré-launch |
| A05 Security Misconfiguration | ✅ | Helmet complet, vérifier prod Swagger gating |
| A06 Vulnerable Components | 🟡 | License OK, mais Renovate + pnpm audit CI + SBOM TODO |
| A07 Auth Failures | ✅ | Sessions DB 256-bit, dev login gated NODE_ENV |
| A08 Integrity Failures | ✅ | Lock + append-only + outbox + idempotency + S3 versioning |
| A09 Logging Failures | ✅ | OTel + Sentry + audit log + alertes (à activer staging) |
| A10 SSRF | ✅ | Pas de fetch sortant depuis input utilisateur |

**Score** : ✅ 7/10, 🟡 2/10, ⏳ 1/10 (pen test formel).

## Pen test formel (porte ⏳ DoD)

À planifier dans les 90 jours avant le launch public (cf. constitution
Principe IX, et `specs/001-conformite-module/checklists/dod.md`).

Périmètre recommandé :

1. **Tests fonctionnels** : auth bypass, RBAC, IDOR (Insecure Direct Object
   References), CSRF, XSS stored/reflected, XXE, SQL injection.
2. **Tests infra** : configuration AWS (security groups, IAM least
   privilege, S3 buckets), TLS handshake, headers HTTP.
3. **Tests métier** : appropriation de dossier d'un autre conseiller,
   manipulation de l'audit log, contournement du flux d'effacement Loi 25.

Reporter : firme québécoise spécialisée en sécurité applicative
(suggestions : Mandiant, GoSecure, Solutions Trust, etc. — à valider via
RFP).
