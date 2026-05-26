# @cv/auth-domain

Domaine pur d'authentification — feature 002 (auth conseiller + admin).

TypeScript pur, zéro framework, zéro I/O, zéro Prisma. Principe VIII
(Clean Architecture) et Principe VI (TDD obligatoire) de la constitution.

## Modules

- `email-normalizer` — `normalizeEmail()` : trim + lower + NFC (R9).
- `password-policy` — `validatePasswordPolicy()` : 12..128 chars, 4 classes,
  refus si contient email/prénom (FR-003).
- `password-hash` — `prehashAndHash()` : SHA-256 prehash + bcrypt cost 11
  (R3 / C2), neutralise le 72-byte limit de bcrypt.
- `single-use-tokens` — `issueToken()` / `verifyToken()` : JWT HS256 via
  `jose`, claim `purpose` empêche le rejeu cross-flow (R2).
- `lockout-policy` — `shouldLockout()` : double bucket account/IP (R4).
- `auth-error-normalizer` — `normalizeAuthError()` : anti-énumération
  uniforme INVALID_CREDENTIALS (R5).
- `dtos/` — schémas Zod partagés API + Web.

## Couverture tests

≥ 95 % lines/functions/statements / 90 % branches (cf. `vitest.config.ts`).

## Complémentarité avec `@cv/mfa`

Les deux packages forment la couche domaine du module identité :

- `@cv/mfa` (feature 002a) — MFA TOTP, codes de récupération, chiffrement
  AES-256-GCM, validation step-up.
- `@cv/auth-domain` (feature 002) — Mot de passe + login flow + tokens
  à usage unique + lockout double bucket.

**Fusion future possible** en `@cv/identite-domain` si le scope du module
identité s'élargit (passkey/WebAuthn, OAuth tiers, SSO). À reconsidérer
quand la taille combinée dépasse ~1000 LOC ou quand un troisième sous-
domaine émerge (cf. M10 review architecte).

## Pas dans ce paquet

- Code Prisma, NestJS, Next.js, Auth.js — rejeté par
  `tools/check-module-boundaries.ts` (T043).
- Lecture de `process.env` — les secrets sont passés en paramètres aux
  fonctions pures.
- Side effects DB / réseau / fichiers.

Les adapters d'infrastructure sont dans `apps/api/src/modules/identite/
infrastructure/` (`PrismaPasswordVerifier`, `JoseTokenIssuer`, etc.).
