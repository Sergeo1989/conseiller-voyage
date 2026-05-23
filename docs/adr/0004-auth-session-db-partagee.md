# ADR-0004 — Authentification : Auth.js v5 + session DB partagée Next.js/NestJS

**Date** : 2026-05-22
**Statut** : accepté
**Décideurs** : porteur produit, équipe technique
**Documents liés** :
- [Constitution v2.1.0, Principe IX — Sécurité applicative (NON-NÉGOCIABLE)](../../.specify/memory/constitution.md)
- [Roadmap, feature 002 — Identité, auth conseiller + admin avec MFA, RBAC](../roadmap.md)
- [Spec 001 — Module conformité](../../specs/001-conformite-module/spec.md), dépendance module identité

---

## Contexte

La plateforme repose sur deux applications coordonnées :
- `apps/web` — Next.js (App Router) qui sert les UIs conseiller et admin.
- `apps/api` — NestJS qui expose l'API REST métier.

Les sessions utilisateurs (conseiller authentifié avec MFA, admin
authentifié) sont créées et gérées côté Next.js. Mais le backend NestJS doit
**valider** ces sessions pour chaque mutation API (revue de dossier,
révocation de conseiller, etc.).

Trois options possibles ont été considérées (cf. décision tools batch 3A) :
1. Session DB partagée (les deux apps lisent la même table `auth_sessions`).
2. JWT signé par Auth.js et validé par NestJS via secret partagé.
3. Hybride : Auth.js DB-session côté web + JWT court généré à la demande
   pour les appels NestJS.

---

## Décision

**Adopter Auth.js v5 (NextAuth) avec sessions DB stockées dans Postgres,
lues par NestJS via Prisma.**

Configuration :
- Auth.js v5 côté `apps/web` avec **adapter Prisma**
  (`@auth/prisma-adapter`) qui écrit dans les tables `auth_users`,
  `auth_sessions`, `auth_accounts`, `auth_verification_tokens` de la DB
  principale.
- Stratégie : **`database`** (pas `jwt`).
- Cookie de session : `__Host-cv.session.token`, SameSite=Lax, Secure,
  HttpOnly. Durée 30 jours, sliding refresh.
- Côté NestJS : un `AuthGuard` partagé lit le cookie de session,
  recherche la session dans Postgres via Prisma (`auth_sessions.findUnique`
  + jointure `auth_users`), valide l'expiration, injecte `request.user =
  { id, role, mfaVerifiedAt }` dans le contexte de requête.
- MFA TOTP : implémenté via @simplewebauthn/server (passkeys) ou
  `otplib` (TOTP classique), avec stockage d'un challenge dans
  `auth_verification_tokens`. Vérifié au moment de l'élévation de session
  (`mfaVerifiedAt < 30 min` pour les actions sensibles : approbation de
  dossier, révocation, déclaration de retrait de permis).
- Schema Prisma des tables Auth.js dans `packages/shared/auth/prisma/`
  pour qu'il soit consommé par les deux apps via composition de schémas
  Prisma (multi-file schema, Prisma 5+).

---

## Conséquences

**Positives** :
- **Révocation instantanée** : supprimer une session en DB la rend
  immédiatement invalide pour les deux apps. Pas de blacklist Redis à
  maintenir.
- Pas de JWT à signer, distribuer, faire tourner. Pas de secret partagé à
  rotater.
- Source unique de vérité pour l'identité — pas de désynchronisation
  possible entre web et api.
- Cohérent avec le pattern monolithe modulaire (Principe V) : les deux apps
  partagent une DB, le module identité possède le schéma.
- Cookie strict (SameSite, Secure, HttpOnly, `__Host-` prefix) renforce la
  défense en profondeur Principe IX.

**Négatives** :
- **Couplage au schéma Auth.js**. Si Auth.js bouleverse son modèle (peu
  probable mais possible), il faut migrer la DB. Mitigation : encapsuler
  les lectures NestJS dans un port `AuthSessionReader` (Principe VIII), de
  sorte que seule l'implémentation infrastructure dépend du schéma concret.
- **Latence DB ajoutée à chaque requête authentifiée**. Mitigation :
  cache local très court (5-10 s) côté NestJS sur la session id → user (la
  DB Postgres reste source de vérité, le cache fait juste éviter le hit DB
  sur des requêtes en rafale du même user). Reste sous le seuil d'invalidation
  acceptable pour Principe IX (révocation < 30 s en pire cas).
- **Pas de stateless API**. Si on veut un jour exposer l'API à des tiers
  (mobile, partenaires), il faudra ajouter un layer JWT séparé. Acceptable
  car non-prioritaire (Tier 5 différé dans la roadmap).

---

## Alternatives considérées

### JWT signé par Auth.js + validé par NestJS

- **Avantages** : stateless, plus scalable, pas de hit DB à chaque appel.
- **Pourquoi rejetée** : révocation lente (devra passer par une blacklist
  Redis ou une rotation de clé), plomberie significative (gestion de
  expiration, rotation, JWKS), risque de désynchronisation. Pas un
  avantage net pour une équipe de 1-3 développeurs au MVP.

### Hybride (DB session + JWT court forgé à la demande)

- **Avantages** : meilleur des deux mondes en théorie.
- **Pourquoi rejetée** : complexité doublée pour un gain marginal au MVP.
  À retenir si on ouvre l'API à des tiers (clients mobiles).

### Auth.js v5 avec stratégie `jwt`

- **Avantages** : pas de table, plus simple côté Auth.js.
- **Pourquoi rejetée** : NestJS devrait alors valider le JWT par signature.
  Même complexité que JWT manuel, sans le bénéfice DB. Et la révocation
  reste lente.

---

## Implémentation

Structure proposée dans le code :

```
packages/shared/auth/
├── prisma/
│   └── auth.prisma           # schéma Auth.js (composition multi-file)
├── ports/
│   └── auth-session-reader.port.ts
└── index.ts
```

```
apps/api/src/modules/identite/
├── infrastructure/
│   └── prisma-auth-session-reader.ts
└── interface/
    └── auth.guard.ts          # Nest guard qui consomme AuthSessionReader
```

```
apps/web/src/auth.ts            # configuration Auth.js v5
apps/web/src/middleware.ts      # protect routes auth-required
```

---

## Plan de migration vers JWT (si nécessaire un jour)

1. Créer un nouvel ADR remplaçant celui-ci.
2. Implémenter un endpoint Next.js `/api/auth/token` qui forge un JWT
   court depuis la session DB en cours.
3. NestJS valide JWT en plus de session DB pendant la transition.
4. Bascule progressive des clients vers JWT.
5. Décommissionner la lecture DB côté NestJS.

---

## Références

- [Constitution v2.1.0](../../.specify/memory/constitution.md), Principe IX (Sécurité applicative)
- [Auth.js v5 documentation](https://authjs.dev)
- [Prisma — multi-file schema](https://www.prisma.io/docs/concepts/components/prisma-schema/multi-file-schema)
- [OWASP — Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
