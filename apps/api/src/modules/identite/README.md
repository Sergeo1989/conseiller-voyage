# Module `identite`

Gestion de l'identité, de l'authentification, de l'authentification
forte (MFA), du RBAC et des acceptances légales (Loi 25). Module Tier 0
qui fournit l'`AuthSessionReader` et l'`AuthGuard` consommés par tous
les autres modules métier.

## Sous-domaines

| Sous-domaine | Feature spec | Statut |
|---|---|---|
| Sessions Auth.js v5 (lecture côté NestJS) | 001 | ✅ livré |
| Auth conseiller + admin (signup/login/verify/password) | 006 | ✅ mergé PR #14 |
| MFA conseiller TOTP + step-up + admin reset | 005 | ✅ mergé PR #13 |
| Acceptances légales + cookie HMAC version + anonymisation Loi 25 | 004 | 🔵 PR #12 en cours |

## Sous-module Legal Acceptances (feature 004)

### Quoi

- Ce sous-module enregistre l'acceptation explicite des documents
  légaux (CGU B2B / CGU B2C / politique de confidentialité) par les
  conseillers/admins (authentifiés) et les briefs voyageur (anonymes).
- Les acceptances sont **append-only** (triggers PostgreSQL bloquent
  UPDATE/DELETE) — cf. ADR-0008.
- L'anonymisation Loi 25 (RGPD-équivalent québécois) se fait par
  **insertion** d'une row d'anonymisation dans une table séparée, sans
  toucher la row originale.
- La vérification de version courante côté `apps/web` utilise un
  **cookie HMAC signé** `__Host-cv.legal-version` (TTL 5 min) pour
  éviter un round-trip API par requête — cf. ADR-0009.

### Comment

- Pour enregistrer une acceptance conseiller : `AcceptCguB2bUseCase` →
  POST `/api/me/legal/accept`.
- Pour vérifier le statut : `CheckCguUpToDateUseCase` → GET
  `/api/me/legal/version-status` (consommé par le middleware Next.js).
- Pour les briefs voyageur (cross-module 002) : façade publique
  `LegalAcceptanceFacade.acceptForBrief` / `.getCurrentVersion`.
- Anonymisation Loi 25 : `AnonymizeLegalAcceptancesUseCase` orchestré
  par `EraseConseillerDataUseCase` (extension feature 001) et le futur
  job d'effacement transverse (023).

### Sécurité

- **Salt anonymisation** : `LOI25_SUBJECT_ANONYMIZATION_SALT` lu depuis
  AWS Secrets Manager `ca-central-1`. **Ne jamais rotater en routine**
  (cf. runbook [`legal-incident-response.md`](../../../../docs/runbooks/legal-incident-response.md)).
- **HMAC cookie** : `LEGAL_COOKIE_HMAC_SECRET` lu depuis AWS Secrets
  Manager. Rotation 90 jours (cf. runbook
  [`legal-secrets-setup.md`](../../../../docs/runbooks/legal-secrets-setup.md)).
- **Forge detection** : alerte Grafana CRITICAL sur
  `legal_cookie_forge_detected_total > 5/h`. Voir
  [`legal-alerts.yaml`](../../../../docs/dashboards/legal-alerts.yaml).

### Observabilité

- Métriques exposées par
  [`observability/legal-metrics.ts`](./observability/legal-metrics.ts).
- Dashboard Grafana :
  [`docs/dashboards/legal.json`](../../../../docs/dashboards/legal.json).
- Runbook bump de version :
  [`docs/runbooks/legal-version-bump.md`](../../../../docs/runbooks/legal-version-bump.md).

### ADRs

- [ADR-0008 — Anonymisation Loi 25 par hash salé immutable](../../../../docs/adr/0008-anonymisation-loi25-hash-sale-immutable.md)
- [ADR-0009 — Middleware Next.js + cookie HMAC vérification version CGU](../../../../docs/adr/0009-middleware-cookie-hmac-version-cgu.md)
