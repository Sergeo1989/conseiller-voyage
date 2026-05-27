# ADR-0011 — Validation TOTP RFC 6238 : bibliothèque `otplib`

**Date** : 2026-05-25
**Statut** : accepté
**Décideurs** : porteur produit, équipe technique
**Documents liés** :
- [Constitution v2.2.0, Principe IX — Sécurité applicative (NON-NÉGOCIABLE)](../../.specify/memory/constitution.md)
- [Constitution v2.2.0, Principe VI — Logique métier déterministe et testée (NON-NÉGOCIABLE)](../../.specify/memory/constitution.md)
- [Spec 005 — MFA conseiller](../../specs/005-mfa-conseiller/spec.md)
- [Contracts 005 — TotpValidatorPort](../../specs/005-mfa-conseiller/contracts/totp-validator.port.md)
- [Research 005 R1](../../specs/005-mfa-conseiller/research.md)

---

## Contexte

La feature 005 doit implémenter la génération et la vérification de
codes TOTP conformes à la RFC 6238 (Time-Based One-Time Password,
HMAC-SHA1 par défaut, fenêtre de 30 secondes, 6 chiffres). C'est de la
crypto bien rodée mais sensible — toute implémentation maison doit être
testée contre les vecteurs RFC, et tout bug subtil (off-by-one sur la
fenêtre temporelle, désynchronisation timing) compromet directement la
sécurité du second facteur.

Trois options ont été évaluées :

1. **`otplib@^12`** — bibliothèque dédiée TOTP/HOTP, ~1M téléchargements/semaine, maintenue
2. **`@auth/core` (Auth.js v5) TOTP natif** — provider TOTP intégré au framework
3. **Implémentation manuelle** — code crypto custom, ~150 lignes

---

## Décision

**Adopter `otplib@^12` comme bibliothèque TOTP, exposée derrière le
port `TotpValidatorPort` dans `apps/api`.**

### Configuration

```typescript
import { authenticator } from 'otplib';

// Configuration fixe pour toute la feature 005 :
authenticator.options = {
  step: 30,    // pas de 30 secondes (RFC 6238 standard)
  window: 1,   // tolérance ±1 pas = ±30 s (FR-009)
  digits: 6,   // codes à 6 chiffres (FR-002)
  algorithm: 'sha1',  // HMAC-SHA1 (RFC 6238 default, compatible Google
                       // Authenticator / 1Password / Authy / Microsoft
                       // Authenticator)
};
```

### Encapsulation via port

Le port `TotpValidatorPort` (cf.
[`contracts/totp-validator.port.md`](../../specs/005-mfa-conseiller/contracts/totp-validator.port.md))
expose 3 méthodes pures :
- `verify(secret, code): boolean`
- `generateSecret(): string` (Base32, 160 bits)
- `buildKeyUri(label, secret): string` (URL `otpauth://` pour le QR)

L'implémentation `OtplibTotpValidator` est une fine couche d'injection
NestJS qui délègue à un module pur de `packages/mfa/src/totp.ts`. Cela
permet de tester la logique pure sans NestJS et de migrer vers une autre
bibliothèque sans toucher le domaine (Principe VIII).

---

## Conséquences

### Positives

- **Bibliothèque éprouvée** : ~1M téléchargements/semaine, maintenue
  activement, conforme RFC 6238. Pas de risque de bug crypto subtil
  introduit par notre code.
- **API minimaliste** : 3 fonctions suffisent — pas de surface d'attaque
  ni de complexité non utilisée.
- **Compatible standards** : tous les apps TOTP du marché (Google
  Authenticator, 1Password, Authy, Microsoft Authenticator, Bitwarden)
  consomment l'URL `otpauth://` standard générée par
  `authenticator.keyuri()`.
- **Zéro dépendance native** : pas de `node-gyp`, compatible ECS
  Fargate sans friction.
- **Constant-time comparison interne** : otplib utilise
  `crypto.timingSafeEqual` côté vérification — pas de side-channel
  timing exploitable.
- **Fenêtre configurable** : `window: 1` couvre les décalages d'horloge
  ±30 s naturels (smartphone vs serveur). Configurable per-call si
  besoin futur (p. ex. tolérance plus large pour reset admin).

### Négatives

- **Dépendance externe** : un compromis de la chaîne d'approvisionnement
  otplib affecterait directement notre sécurité MFA. Mitigation : pin de
  version exacte dans `package.json` (`^12.0.1` → bumps mineurs uniquement),
  audit `pnpm audit` dans CI, lock file revu en PR.
- **Algorithme SHA-1** : `algorithm: 'sha1'` est le défaut RFC 6238.
  SHA-1 est connu pour ses faiblesses en signature, MAIS HMAC-SHA1
  reste sûr pour TOTP (le secret reste protégé, l'attaque sur SHA-1
  exigerait des préimages que HMAC neutralise). Compatible 100 % apps
  existantes. Migration vers SHA-256 possible plus tard (otplib le
  supporte) si écosystème suit.

---

## Alternatives rejetées

### Alternative 1 : `@auth/core` TOTP provider

Auth.js v5 expose un provider TOTP expérimental qui pourrait s'intégrer
naturellement avec notre flow Auth.js existant (ADR-0004).

**Rejeté car** :
- API encore en bêta en 2026-05, signatures susceptibles de bouger.
- Pas de support natif des **backup codes** (FR-004 à FR-006). Il
  faudrait quand même implémenter cette partie nous-mêmes.
- Pas de support natif du **step-up intra-session** (FR-016 à FR-020).
  Le provider est conçu pour le second facteur au login, pas pour
  l'élévation continue.
- Coupling fort avec Auth.js — empêcherait une migration future si
  Auth.js change de modèle (peu probable mais possible).

### Alternative 2 : Implémentation manuelle

Coder HMAC-SHA1 RFC 4226 (HOTP) + dérivation TOTP RFC 6238 à la main
(~150 lignes de code crypto).

**Rejeté car** :
- Risque de bug subtil (off-by-one sur la fenêtre, mauvais encodage
  Base32, timing leak) qui compromettrait le second facteur.
- Vecteurs de test RFC à valider manuellement → travail déjà fait par
  otplib, audité par sa communauté.
- Pas de gain mesurable — otplib n'a pas de dépendances natives, ne
  pèse rien sur le bundle.
- Aurait été acceptable comme exercice de Principe VI (pure logique
  testable), mais le port `TotpValidatorPort` permet déjà ce niveau
  d'abstraction sans réinventer.

---

## Notes opérationnelles

### Audit de la dépendance

- `pnpm audit --filter @cv/mfa` exécuté en CI à chaque PR (T128 audit
  OWASP).
- Surveillance des CVE otplib via Renovate / Dependabot (à configurer
  dans une feature ultérieure d'observabilité supply chain).
- Pin de version exacte dans `package.json` avec contrainte `^12.x.x`
  — pas de bump majeur sans review explicite (potentiel changement
  d'API).

### Migration future éventuelle

Si une CVE majeure d'otplib survient ou si on souhaite passer à un
algorithme plus moderne (TOTP-SHA-256 ou WebAuthn), la migration est
isolée :
1. Implémenter un nouvel adapter (`AuthCoreTotpValidator`,
   `ManualTotpValidator`, …).
2. Swap du provider dans `identite.module.ts`.
3. Les use cases et le domaine sont inchangés.

L'inversion de dépendance via `TotpValidatorPort` (Principe VIII) rend
cette migration triviale en code, même si la migration des secrets
existants nécessite une attention particulière (les secrets TOTP en BD
restent identiques — c'est l'algorithme de génération/validation côté
serveur qui change).
