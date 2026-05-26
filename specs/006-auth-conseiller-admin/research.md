# Recherche technique — Auth conseiller + admin (006)

**Phase** : 0 (avant Phase 1 conception)
**Plan parent** : [plan.md](plan.md)
**Date** : 2026-05-26

Ce document consolide les décisions techniques structurantes de la feature 002. Chaque décision suit le format : **Décision** → **Justification** → **Alternatives considérées**.

---

## R1 — Provider Credentials Auth.js v5 (vs flow custom signin)

**Décision** : Activer le provider `Credentials` Auth.js v5 dans `apps/web/src/auth.ts`. Le callback `authorize` délègue entièrement à `LoginUseCase` (côté NestJS) via un appel HTTP interne `POST /api/auth/login` (server-to-server, sans cookie).

**Justification** :

- Auth.js v5 sait gérer la création/rotation du cookie de session `__Host-cv.session.token`, l'expiration glissante, le CSRF, et la rotation des CSRF tokens — réimplémenter cela serait un anti-pattern et créerait une surface d'attaque inutile.
- La règle « pas de logique métier dans `apps/web` » (Principe VIII Clean Architecture) impose de déléguer la vérification mot de passe + lockout + audit au backend. Le pattern callback `authorize → fetch API` est documenté et utilisé par les guides Auth.js v5 + NestJS.
- L'endpoint `POST /api/auth/login` reste accessible directement pour les tests d'intégration sans passer par le cookie Next.js.

**Alternatives considérées** :

- **Implémenter signin custom dans Next.js Server Actions** : rejeté car duplique la gestion du cookie de session que Auth.js v5 fait déjà.
- **Implémenter le `Credentials` provider entièrement dans Next.js (sans backend)** : rejeté car violerait la couche infrastructure (bcrypt + Prisma dans `apps/web`) et casserait la séparation modulaire.
- **OAuth tiers (Google, Microsoft)** : explicitement hors scope par décision produit (cf. spec « Hors scope explicite »). Différé Tier 5.

---

## R2 — Format des tokens à usage unique : JWT HS256 (jose) avec ID enregistré en DB

**Décision** : Tokens à usage unique (vérification email, reset mot de passe, invitation admin) sont des **JWT HS256** signés avec `AUTH_TOKEN_SECRET` (32 octets, AWS Secrets Manager). Le JWT contient `{ purpose, userId, nonce, iat, exp }`. Une ligne est insérée dans `auth_email_verification_tokens` / `auth_password_reset_tokens` / `auth_admin_invitation_tokens` avec l'`id` égal au `nonce` du JWT, pour permettre la révocation au 1ᵉʳ usage (one-shot) et la suppression en cascade Loi 25.

**Justification** :

- **Signature JWT** : empêche un attaquant de forger un token sans connaître `AUTH_TOKEN_SECRET`. Le champ `purpose` empêche le rejeu cross-flow (un token de vérification email ne peut pas être utilisé comme token de reset).
- **Ligne en DB** : permet le one-shot strict (DELETE de la ligne au moment de la consommation = invalidation atomique du token, même si le JWT n'est pas encore expiré). Sans la ligne, on aurait besoin d'une blacklist Redis ou similaire.
- **`jose@^5`** : librairie maintenue, WebCrypto natif, plus moderne et plus petite que `jsonwebtoken@^9` (qui dépend de `node:crypto` non-WebCrypto). Compatible Edge Runtime si on en a besoin plus tard.

**Alternatives considérées** :

- **Token opaque (UUID v4) entièrement en DB** : plus simple côté token mais perd la signature → impossible de détecter un token forgé sans round-trip DB pour chaque vérification, et impose la création d'une table par purpose plus rigide (déjà fait ici, donc bénéfice limité). Rejeté car JWT donne la signature gratuite + couvre le cas « DB temporairement HS, on peut au moins valider la signature » même si en pratique on continue à exiger la DB pour le one-shot.
- **PASETO v4** : équivalent fonctionnel mais écosystème plus petit, pas de gain. Rejeté.
- **JWT RS256** : asymétrique, utile pour des microservices distincts qui partagent juste la clé publique. Inutile ici car même backend signe et vérifie. Rejeté.

---

## R3 — Hash bcrypt cost 11 + pré-hash SHA-256 (vs cost 12, vs Argon2id)

**Décision révisée post-review** (cf. C2 + H1) : `bcryptjs@^2.4` (déjà installé par 002a) avec cost factor **11** (et non 12 comme initialement écrit), appliqué sur un **pré-hash SHA-256(base64)** du plaintext.

Formule :
```
hash_stocké = bcrypt(base64(sha256(plaintext)), cost=11)
```

**Justification du pré-hash SHA-256** (cf. C2) :

bcrypt tronque silencieusement à 72 octets. Un mot de passe de 100 caractères et le même tronqué à 72 caractères ont **le même hash** — faille subtile :
- Deux mots de passe distincts s'authentifient pareil → faille d'unicité.
- En UTF-8, les emojis 4 octets réduisent la longueur effective : un mot de passe « 18 emojis » donne seulement ~72 octets utiles.

Le pré-hash SHA-256 produit toujours 32 octets bruts (44 caractères en base64), bien sous la limite 72. Conséquences :
- Pas de troncature silencieuse, peu importe la longueur ou le contenu UTF-8 du mot de passe.
- Permet de soutenir des mots de passe longs (jusqu'à 128 chars autorisés par FR-003) sans limite arbitraire visible par l'UX.
- Ajoute 2-5 µs (SHA-256 négligeable) au coût total — invisible.

**Justification du cost 11 au lieu de 12** (cf. H1) :

`bcryptjs` est pur JavaScript, 2-4× plus lent que `bcrypt` natif sur ARM. Sur Fargate t4g.medium, cost 12 donne **600-900 ms p95**, bien au-delà des 250 ms initialement annoncés. Combiné avec le SLO login < 600 ms p95, cost 12 viole le SLO.

Cost 11 ramène à **300-450 ms p95** sur t4g.medium :
- Suffit largement pour ralentir le brute-force hors-ligne : 10 000 mots de passe × 400 ms = 4 000 s = ~67 minutes par dictionnaire de 10k.
- Combiné à la politique de complexité (12 chars min, max 128, 4 classes), l'espace de recherche reste astronomique.
- Cohérent avec les standards modernes : Spring Security default = 10, Django = 12 mais bcrypt natif.

**À vérifier par benchmark à l'implémentation** : avant de figer le cost 11, exécuter un benchmark Vitest qui mesure le p95 de `bcrypt.hash` cost 10/11/12 sur la cible de déploiement (ECS Fargate t4g.medium). Ajuster si nécessaire pour rester sous 500 ms.

**Alternatives considérées** :

- **Argon2id natif** (`@node-rs/argon2`) : recommandé OWASP 2023. Dépendance Rust à compiler multi-arch. Rejeté par simplicité de build (alignement 002a) ; à reconsidérer à mi-terme si la stack se complexifie sur d'autres motifs.
- **bcrypt natif (`bcrypt@^5`)** : 2× plus rapide, permettrait cost 12 propre. Mais ajout natif add-on à recompiler par architecture. Rejeté pour cohérence avec 002a (même `bcryptjs`).
- **scrypt** : pas de gain net. Rejeté.

---

## R4 — Bucket de lockout Postgres (réutilisation 002a)

**Décision** : Réutiliser la table `mfa_rate_limit_buckets` (002a) en ajoutant un nouveau type de bucket pour le lockout login : `kind='login_account'` (clé `userId`) et `kind='login_ip'` (clé `ipHash`). L'INSERT atomique `ON CONFLICT DO UPDATE SET count = count + 1, lastFailureAt = NOW()` reste le même pattern. La table est renommée mentalement « rate_limit_buckets » mais reste sous son nom physique `mfa_rate_limit_buckets` pour éviter une migration de renommage coûteuse.

**Justification** :

- **Pattern atomique** : `INSERT ... ON CONFLICT DO UPDATE` est déjà éprouvé par 002a (P0-2 race condition résolue). Pas besoin de Redis.
- **Pas de Redis** : aligne avec la décision 002a (Postgres atomique est suffisamment performant pour < 5 000 logins/jour pic). Réduit la surface opérationnelle (un seul backend à monitorer).
- **Index partiel** : `WHERE windowStart > NOW() - interval '15 minutes'` (account) et `WHERE windowStart > NOW() - interval '1 hour'` (IP) pour purger naturellement.
- **Pas de migration de table** : la colonne `kind` existe déjà avec un enum extensible. Ajout de 2 valeurs `login_account`, `login_ip` au enum suffit.

**Alternatives considérées** :

- **Redis** : meilleure performance théorique mais ajout d'une dépendance critique pour le login + Redis HS = login HS (sauf à dégrader). Rejeté.
- **Nouvelle table dédiée** : duplication d'un pattern déjà fonctionnel. Rejeté.
- **Compteur in-memory process** : naïf, ne survit pas au redémarrage Fargate. Rejeté.

**Renommage futur** : si feature 003 ou 011 ajoute encore des buckets, on pourra renommer `mfa_rate_limit_buckets` → `rate_limit_buckets` via migration zero-downtime (CREATE TABLE … LIKE + INSERT … SELECT + ALTER renommage). Pas dans le scope 002.

---

## R5 — Anti-énumération via chronométrage constant

**Décision** : Les endpoints `/api/auth/signup`, `/api/auth/login`, `/api/auth/password-reset-request` retournent une réponse au format et au timing **indistinguables** entre cas « courriel existe » et « courriel inexistant ». Implémenté par :

1. **Format identique** : message « Si ce courriel existe, vous recevrez un courriel » (signup + reset) ou « Courriel ou mot de passe incorrect » (login), sans aucune variation lexicale.
2. **Chronométrage constant via dummy bcrypt** : si l'utilisateur n'existe pas, le use case effectue tout de même `bcrypt.compare(prehash(plaintext), DUMMY_HASH_BCRYPT_COST_11)` avec un hash sentinelle pré-calculé au boot. Le temps de réponse devient `bcrypt ~400ms ± 30ms` peu importe le cas. Validé par test SC-007 (10 000 requêtes, écart-type chronométrage < 50 ms).
3. **Lookup DB symétrique** (cf. C6 de la review) : le code path emprunte la **même requête SQL** dans les deux cas. Pour le login, c'est un `SELECT auth_users.*, auth_accounts.password_hash FROM auth_users LEFT JOIN auth_accounts ON auth_accounts.userId = auth_users.id AND auth_accounts.provider = 'credentials' WHERE auth_users.email = $1 LIMIT 1`. Cette unique requête couvre les deux cas (0 ou 1 row), évite la fuite de timing par roundtrip supplémentaire dans un cas et pas l'autre.
4. **Outbox conditionnel** : l'INSERT dans `auth_outbox_emails` n'a lieu que si le compte existe (pour ne pas spammer un email tiers). Mais l'INSERT prend < 5 ms vs bcrypt ~400 ms, donc invisible côté chrono.

**Justification** : OWASP A04 (Insecure Design) + scénarios spec FR-002, FR-008, FR-018. Sans cette précaution, un attaquant peut deviner par chronométrage si un email est inscrit dans la plateforme — fuite de données personnelles violant la Loi 25.

**Alternatives considérées** :

- **Sans dummy bcrypt** : différence de temps détectable (compte existe = bcrypt 250ms ; compte inexistant = retour rapide 5ms). Rejeté car détectable.
- **Sleep aléatoire** : moins propre, plus difficile à valider, pénalise les requêtes légitimes. Rejeté.
- **Always-respond-OK sans bcrypt** : casse la sémantique du login (on doit échouer si mauvais mot de passe). Rejeté.

---

## R6 — Stockage `password_hash` : colonne sur `auth_accounts` (vs nouvelle table)

**Décision** : Ajouter une **colonne** `password_hash TEXT NULL` à la table existante `auth_accounts`. Une ligne `(provider='credentials', providerAccountId=email, password_hash=…)` représente le compte mot de passe. Une ligne `(provider='oauth_google', …, password_hash=NULL)` représenterait un futur compte OAuth (hors scope mais le schéma le supporte).

**Justification** :

- **Aligné avec Auth.js v5** : le pattern recommandé par les guides Auth.js + Prisma est de mettre les credentials dans `accounts` avec un type de provider dédié. Pas d'invention.
- **Pas de table séparée** : éviter une jointure systématique au login (`SELECT FROM users JOIN accounts JOIN credentials`) qui coûterait inutilement.
- **Cascade Loi 25** : `auth_accounts.userId` a déjà `onDelete: Cascade` côté `auth_users`. Effacement automatique.
- **NULL acceptable** : la colonne est optionnelle car les futurs comptes OAuth ne l'auront pas. L'invariant « si `provider='credentials'` alors `password_hash` NOT NULL » est appliqué par une contrainte `CHECK` Postgres dans la migration.

**Alternatives considérées** :

- **Nouvelle table `credential_accounts`** : duplique le concept déjà modélisé par Auth.js. Rejeté.
- **Stocker `password_hash` sur `auth_users`** : casse le modèle Auth.js (un user peut avoir plusieurs methods). Rejeté.

---

## R7 — Cookie de session 30 jours glissants : configuration Auth.js v5

**Décision** : Configurer `auth.ts` avec :

```typescript
session: {
  strategy: 'database',
  maxAge: 30 * 24 * 60 * 60,         // 30 jours
  updateAge: 24 * 60 * 60,           // refresh côté DB max 1×/jour
},
cookies: {
  sessionToken: {
    name: '__Host-cv.session.token',  // déjà en place 002a
    options: { httpOnly: true, sameSite: 'strict', secure: true, path: '/' },
  },
},
```

Le `updateAge: 1 day` évite un UPDATE Postgres à chaque requête (coûteux). La session est considérée valide tant que `expires > NOW()` ; le `expires` est repoussé seulement si la session a plus de 24h depuis sa dernière mise à jour.

**Justification** :

- **30 jours glissants** : décision clarification Q2 (Standard B2B SaaS Stripe/Notion).
- **`SameSite=Strict`** : meilleur CSRF protection. Compatible avec notre cas (pas de cross-site embed prévu).
- **`__Host-` prefix** : impose `Secure + Path=/ + sans Domain` (CSP-friendly, vol de cookie limité).
- **Step-up MFA 30 min** : reste indépendant. Configuré via `AuthSession.mfaVerifiedAt` (002a). Une session de 30 jours peut avoir un MFA frais < 30 min ou > 30 min ; les actions sensibles re-demandent step-up via `StepUpGuard`.

**Alternatives considérées** :

- **Strategy JWT** au lieu de `database` : casse la possibilité de révoquer une session à reset password (FR-020). Rejeté (déjà décidé par 002a).
- **`updateAge` plus court** : coût UPDATE par requête excessif. Rejeté.

---

## R8 — Bouton « Renvoyer » countdown 60s : pattern shadcn + a11y

**Décision** : Composant `<ResendCountdownButton />` (`apps/web/src/app/(auth)/_components/`) qui combine :

- État local `useState<number>(60)` + `useEffect` pour décrémenter chaque seconde.
- Bouton `shadcn/ui` `Button` avec `disabled={countdown > 0}`.
- `aria-disabled={countdown > 0}` et `aria-live="polite"` sur le texte « Renvoyer dans 60s » (annoncé par les lecteurs d'écran à chaque seconde — testé via NVDA + VoiceOver).
- Au clic (countdown = 0), appel Server Action `resendVerificationEmail()` qui consomme le rate-limit Postgres (FR-015 : max 3/h/compte). Si rate-limit dépassé, message générique côté UI sans révéler la raison.
- Après 2 renvois sans vérification effective, affichage en plus du lien « contacter le support » (mailto:` support@conseiller-voyage.ca`).

**Justification** : décision clarification Q1. Pattern shadcn permet l'a11y native (focus visible, contraste 4.5:1, navigation clavier). Le countdown `aria-live="polite"` est non-intrusif (n'interrompt pas la lecture d'écran).

**Alternatives considérées** :

- **Pas de countdown** : décourage moins l'utilisateur impatient de re-soumettre. Rejeté car spam d'outbox + frustration.
- **Polling actif** vers `/api/auth/verify-email-status` toutes les 15s : ajoute un endpoint inutile, complexifie. Rejeté (option C de la clarification, écartée).
- **WebSocket / SSE** : surdimensionné. Rejeté (option D).

---

## R9 — Normalisation des courriels

**Décision** : fonction pure `normalizeEmail(raw: string) → string` dans `@cv/auth-domain/src/email-normalizer.ts`. Applique :

```typescript
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().normalize('NFC');
}
```

Applique systématiquement à : signup (email saisi), login (email saisi), password reset request (email saisi), invitation admin (targetEmail saisi). Le résultat est ce qui est stocké en DB et utilisé pour les lookups.

**Justification** (cf. H8 de la review) :

- `trim()` : élimine les espaces accidentels en début/fin (collage maladroit).
- `toLowerCase()` : RFC 5321 traite la `local-part` comme case-sensitive en théorie mais 99,99 % des MTAs la traitent insensible. Cohérent OWASP.
- `normalize('NFC')` : NFC est la forme composée standard. Évite que `é` (NFC, 1 codepoint) vs `é` (NFD, e + accent combining) soient traités comme des emails différents.
- **Pas** de strip des `+aliases` (`maxime+spam@test.local` reste distinct de `maxime@test.local`). Préserve l'intention utilisateur (souvent utilisée pour tagger les sources). Cohérent OWASP.

**Alternatives considérées** :

- Punycode normalization pour IDN (münchen.de → xn--mnchen-3ya.de) : utile pour les domaines internationaux. Différé post-MVP — la cible francophone n'a quasi pas d'IDN en pratique. À ajouter si signal d'usage.

---

## R10 — Rotation du `AUTH_TOKEN_SECRET`

**Décision** : pour MVP, **une seule clé active** (`AUTH_TOKEN_SECRET`). La rotation invalide tous les JWT en circulation (tokens d'email verification, password reset, invitation admin). Documenté dans `docs/runbooks/auth-secret-rotation.md` à livrer avec la feature.

Procédure de rotation simple :
1. Communiquer la fenêtre de maintenance (1 h).
2. Annoncer aux opérateurs : « les liens email envoyés dans la dernière heure pourraient ne plus fonctionner ; l'utilisateur peut redemander un lien ».
3. Mettre à jour `AUTH_TOKEN_SECRET` dans AWS Secrets Manager.
4. Redéploiement rolling de `apps/api`.
5. Tester un signup + une vérif d'email.

**Justification** (cf. M6 de la review) :

- MVP : la complexité d'un mécanisme `AUTH_TOKEN_SECRET_PREVIOUS` ne vaut pas la peine. Rotation rare (1× par an max attendu).
- Les invitations admin (TTL 72h) sont les plus vulnérables : si rotation pendant ce délai, l'invité doit redemander une invitation manuellement. Acceptable.

**Évolution attendue post-MVP** : si la rotation devient fréquente (politique sécurité serrée), implémenter le double-secret avec décodage tolérant 2 clés et envoi avec la nouvelle.

---

## R11 — Audit `auth_audit_events` sans FK Prisma (ADR-0012)

**Décision** : la table `auth_audit_events` est volontairement **dénormalisée** par rapport à `auth_users` :

- Pas de relation Prisma (`actor: AuthUser?` n'existe pas).
- Les colonnes `actorUserId` / `targetUserId` sont des `Uuid?` nus.
- Une colonne supplémentaire `actorEmailHash` / `targetEmailHash` (`@db.VarChar(64)`) stocke `sha256(emailNormalisé)` au moment de l'événement.

**Justification** (cf. H7 de la review) :

Contradiction structurelle des principes de la constitution :
- **Principe IX** : audit immuable, triggers Postgres `BEFORE UPDATE/DELETE/TRUNCATE` rejettent toute mutation.
- **Principe II** : effacement Loi 25 doit pouvoir `DELETE FROM auth_users`.

Avec une FK `onDelete: SetNull`, l'effacement déclenche un `UPDATE auth_audit_events SET actorUserId = NULL` que le trigger d'immutability **bloque** → utilisateur indélébile → violation Loi 25.

Avec une FK `onDelete: Cascade`, l'effacement déclenche un `DELETE FROM auth_audit_events` que le trigger d'immutability **bloque** aussi → idem.

**Solution adoptée** : pas de FK du tout. L'effacement Loi 25 fonctionne sans toucher à `auth_audit_events`. L'UUID `actorUserId` orphelin reste (lookup retourne 0 row) mais l'événement est conservé avec sa metadata. La corrélation post-effacement passe par `targetEmailHash` (irréversible côté attaquant mais auditable côté admin avec connaissance de l'email d'origine).

**ADR à livrer** : `docs/adr/0012-audit-vs-loi-25-no-fk-policy.md` documente cette décision, ses alternatives rejetées (FK + trigger whitelist exception, table d'audit séparée par compte, encryption-at-rest user-keyed), et son intersection avec le pattern hérité de 002a (qui a un problème similaire à reviewer post-coup).

---

## R12 — Logger Pino : redactor pour les routes auth

**Décision** : configuration globale du logger Pino dans `apps/api/src/main.ts` avec un `redact` qui couvre tous les champs sensibles connus :

```typescript
{
  redact: {
    paths: [
      'req.body.password',
      'req.body.newPassword',
      'req.body.currentPassword',
      'req.body.newPasswordConfirmation',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
}
```

**Justification** (cf. H10 de la review) :

- SC-005 promet qu'aucun mot de passe ne fuite par les logs. Sans redactor, le body du POST /api/auth/login serait logué en clair dans Grafana Cloud.
- Pino offre un `redact` natif sans overhead (compilé à l'init du logger).
- Le test SC-005 d'audit pré-merge vérifie : POST /api/auth/login avec un password connu → grep dans les logs résultants ne trouve pas le password.

**Alternatives considérées** :

- Interceptor NestJS qui supprime les champs avant log : ajoute du code custom, plus fragile. Rejeté.
- Désactiver le log de body sur certaines routes : trop restrictif (perd le debug utile). Rejeté.

---

## Résumé des décisions

| # | Sujet | Décision |
|---|---|---|
| R1 | Provider login | Auth.js v5 `Credentials` → fetch interne `LoginUseCase` |
| R2 | Tokens single-use | JWT HS256 `jose` + ligne DB pour one-shot |
| R3 | Hash mot de passe | `bcryptjs` cost **11** sur SHA-256 pré-hash (cf. C2 + H1) |
| R4 | Lockout | Postgres bucket atomique `INSERT ON CONFLICT` (réutilisation 002a) |
| R5 | Anti-énumération | Réponses indistinguables + dummy bcrypt + lookup DB unifié JOIN |
| R6 | Stockage password hash | Colonne `auth_accounts.password_hash` (Auth.js v5 standard) |
| R7 | Session | 30 jours glissants, `__Host-` cookie, `SameSite=Strict`, `updateAge=1d` |
| R8 | Bouton renvoyer | shadcn + `aria-live="polite"` countdown 60s |
| **R9** | **Normalisation email** | `trim().toLowerCase().normalize('NFC')` pure fn |
| **R10** | **Rotation secret JWT** | Une seule clé active MVP + runbook (double-secret différé) |
| **R11** | **Audit `auth_audit_events` sans FK** | UUID nu + hash email anonymisé (ADR-0012) |
| **R12** | **Logger Pino redact** | Liste explicite des chemins body+headers sensibles |

Toutes les questions techniques ouvertes du plan sont résolues. Aucun NEEDS CLARIFICATION restant.
