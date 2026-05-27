# ADR-0009 — Middleware Next.js + cookie HMAC signé pour la vérification de version CGU obsolète

**Date** : 2026-05-25
**Statut** : accepté
**Décideurs** : porteur produit, équipe technique
**Documents liés** :
- [Constitution v2.2.0, Principe IX — Sécurité applicative (NON-NÉGOCIABLE)](../../.specify/memory/constitution.md)
- [Spec 004 — Mentions légales](../../specs/004-mentions-legales/spec.md), US3, FR-013
- [Plan 004 — Phase 0 R4 + R8](../../specs/004-mentions-legales/research.md)
- [Contracts 004 — Middleware version-check](../../specs/004-mentions-legales/contracts/middleware-version-check.md)
- [ADR-0004 — Auth.js v5 + session DB partagée](./0004-auth-session-db-partagee.md) (consommé par ce middleware)

---

## Contexte

La feature 004 introduit deux CGU versionnées (`cgu_b2b` pour
conseillers, `cgu_b2c` pour voyageurs). Lorsqu'une nouvelle version est
publiée et atteint sa date de prise d'effet (`effectiveAt`), les
utilisateurs qui ont accepté la version précédente doivent **ré-accepter**
avant de pouvoir accéder aux actions sensibles. Pour le conseiller, ces
actions sont l'accès au tableau de bord, aux leads, au profil éditable.

Le problème : le conseiller a une session persistante (Auth.js v5, durée
30 jours sliding). Sans mécanisme dédié, un conseiller peut traverser
un bump de version sans s'en rendre compte. Il faut un check explicite
de version à chaque requête vers les routes conseiller authentifiées.

Plusieurs options possibles :

1. **Server Component check sur chaque page** — duplique la logique,
   risque d'oubli sur les nouvelles pages.
2. **Interceptor NestJS sur chaque endpoint** — duplique côté backend,
   coûteux en latence.
3. **Middleware Next.js sur Edge Runtime** — centralisé, exécuté avant
   tout rendu RSC.
4. **Client Component avec polling** — casse SSR, dégrade UX.
5. **Trigger PostgreSQL** — logique métier dans la BD, refusé Principe VIII.

Le voyageur n'est pas concerné : son acceptation est liée au `briefId`
(one-shot par brief), pas de ré-acceptation rétroactive.

---

## Décision

**Middleware Next.js Edge Runtime** sur `apps/web/src/middleware.ts`
qui intercepte les routes `/[locale]/(conseiller)/**` (à l'exception
des routes du segment `(legal)` elles-mêmes, pour éviter les boucles de
redirection), et qui consomme **un cookie HMAC signé** pour cacher la
version `cgu_b2b` acceptée pendant 5 minutes.

### Format du cookie

- **Nom** : `__Host-cv.legal-version`
- **Attributs** : `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=300`
- **Format du contenu** :

```text
base64url(JSON.stringify(payload)) + '.' + hex(HMAC-SHA256(payload, secret))

payload = {
  userId: string (UUID),
  cguB2bVersion: number,
  exp: number (unix timestamp UTC, ms),
}
```

### Secret HMAC

- **Nom** : `LEGAL_COOKIE_HMAC_SECRET`
- **Type** : 32 bytes aléatoires (256 bits d'entropie)
- **Stockage** : AWS Secrets Manager `ca-central-1`, distinct du salt
  d'anonymisation Loi 25 (ADR-0008) et distinct du secret Auth.js.
- **Accès** : rôle IAM ECS Fargate de l'app backend uniquement.
- **Rotation** : annuelle planifiée (les cookies signés avec l'ancien
  secret deviennent invalides → fallback API). Rotation immédiate en
  cas d'incident.

### Logique du middleware

```
Requête vers /[locale]/(conseiller)/*
   │
   ▼
1. Lire la session Auth.js (existant via ADR-0004)
   │
   ├── Pas de session → redirect login (comportement existant)
   │
   ▼
2. Lire cookie __Host-cv.legal-version
   │
   ├── Cookie absent / signature HMAC invalide / TTL expiré
   │     → 3a. Fallback API
   │
   └── Cookie valide + userId match + non expiré
         │
         ├── cguB2bVersion === version courante (cache process 60s)
         │     → next() ✓
         │
         └── cguB2bVersion < version courante
               → redirect /[locale]/cgu-conseiller/re-accepter

3a. Fallback API : GET /api/me/legal/version-status (authentifié)
   │
   ├── status === 'up_to_date' → next() + Set-Cookie rafraîchi
   ├── status === 'outdated' → redirect /[locale]/cgu-conseiller/re-accepter
   └── status === 'never_accepted' → redirect /[locale]/cgu-conseiller/re-accepter
```

### Endpoint backend `GET /api/me/legal/version-status`

- **Auth** : AuthGuard livré en 001 (session Auth.js v5).
- **RBAC** : `role IN ('conseiller', 'admin')`.
- **Réponse JSON** : `{ accepted: number | null, current: number, status: 'up_to_date' | 'outdated' | 'never_accepted' }`.
- **Side effect** : aucun en BD. Lecture seule. Pas idempotent au sens HTTP (chaque appel re-lit).
- **Rate limit** : 30 req/min/user (plus généreux que le POST, c'est le fallback du middleware).

---

## Conséquences

**Positives** :

- **Centralisation** : un seul endroit (le middleware) implémente la
  logique de check. Toute nouvelle route conseiller en hérite
  automatiquement.
- **Performance** : avec un cookie 5 min, le middleware fait ~12
  appels backend / heure / user max au lieu d'un appel par requête.
- **Sécurité défense en profondeur** : le cookie HMAC signé empêche la
  forge côté client. Même si un attaquant vole le cookie (via XSS
  improbable car HttpOnly, ou MitM impossible car Secure + HSTS), il
  ne peut pas le modifier pour bypass le check.
- **Cohérence avec le pattern Auth.js** (ADR-0004) : même mécanique
  cookie `__Host-` + SameSite + Secure.
- **Edge Runtime** : le middleware tourne sur l'edge (proche
  géographiquement de l'utilisateur), latence d'interception
  négligeable.
- **Graceful degradation** : si le secret HMAC est rote, les anciens
  cookies deviennent invalides → fallback API. Pas de downtime
  utilisateur, juste un appel API supplémentaire pendant la transition.

**Négatives** :

- **Latence ajoutée à toutes les requêtes conseiller** : ~1-3 ms pour
  décoder + vérifier HMAC. Acceptable vu la machine Edge.
- **Nouveau secret à gérer** : `LEGAL_COOKIE_HMAC_SECRET` s'ajoute aux
  secrets existants. Procédure de génération initiale documentée dans
  le runbook.
- **Cache 5 min côté cookie** : si un bump de version est urgent
  (correction d'une erreur critique dans une CGU), un conseiller
  connecté avec un cookie frais peut voir l'ancienne version
  jusqu'à 5 minutes. Mitigation : pour un cas critique, exécuter
  un job qui invalide toutes les sessions Auth.js → re-login →
  cookie regenerated → check à jour.
- **Multi-tab race** : 2 tabs ouverts sans cookie peuvent appeler le
  backend simultanément. Sans impact (endpoint idempotent), mais
  potentiellement 2 set-cookie au lieu d'un. Logs cohérents.

---

## Alternatives considérées

### Server Component check sur chaque page conseiller

- **Avantages** : pas de middleware à maintenir, logique colocalisée avec
  la page.
- **Pourquoi rejetée** : duplication de logique sur chaque page conseiller,
  oubli garanti sur les nouvelles pages au moment du `/speckit.tasks` de
  features futures (matching, profil, conversation, etc.). Risque
  réglementaire : une seule page oubliée = une faille de conformité.

### Interceptor NestJS sur chaque endpoint conseiller

- **Avantages** : check côté backend, robuste contre la modification client.
- **Pourquoi rejetée** : coûteux en latence (1 hit DB par requête API),
  duplique la logique partout, et ne couvre pas les routes Next.js qui
  servent du HTML directement (pages Server Components qui n'appellent
  pas l'API NestJS).

### Cookie non signé (JSON simple)

- **Avantages** : implementation plus simple, pas de gestion de secret.
- **Pourquoi rejetée** : un attaquant peut forger un cookie
  `{ cguB2bVersion: 999 }` et bypass le check pendant le TTL. Le
  fallback API n'est appelé que si le cookie est ABSENT — un cookie
  forgé reste valide jusqu'à expiration. **Faille de sécurité directe**
  (cf. review eng issue 5.1).

### JWT court (5 min) au lieu de cookie HMAC raw

- **Avantages** : standard plus reconnu.
- **Pourquoi rejetée** : JWT ajoute du parsing + bibliothèque
  `jsonwebtoken` (taille bundle Edge non négligeable). HMAC raw plus
  léger et tout aussi sûr pour ce cas d'usage (pas de claims complexes
  à valider).

### Polling côté Client Component

- **Avantages** : aucun changement côté Edge / backend.
- **Pourquoi rejetée** : casse SSR (le check arrive après l'hydratation,
  l'utilisateur voit du contenu interdit avant la redirection). UX
  dégradée. Et un Client Component peut être désactivé côté navigateur
  (rare mais possible), bypass total.

### Cache process backend de la version courante

- **Avantages** : un seul hit DB pour découvrir la version courante,
  même avec 100 cookies absents simultanés.
- **Pourquoi non décidé séparément** : adopté en complément du cookie
  HMAC (le middleware lit la version courante avec un cache process 60 s
  partagé entre toutes les requêtes — pas de hit DB pour ça à chaque
  appel). Cf. `apps/web/src/lib/legal/version-check.ts`.

---

## Implémentation

### Helpers purs

`apps/web/src/lib/legal/cookie-hmac.ts` — signature, vérification,
comparaison en temps constant :

```typescript
import { createHmac } from 'node:crypto';

export function signLegalVersionCookie(
  userId: string,
  cguB2bVersion: number,
  secret: string,
  ttlSeconds: number = 300,
): string {
  const exp = Date.now() + ttlSeconds * 1000;
  const payload = JSON.stringify({ userId, cguB2bVersion, exp });
  const encoded = base64urlEncode(payload);
  const signature = createHmac('sha256', secret).update(encoded).digest('hex');
  return `${encoded}.${signature}`;
}

export function verifyLegalVersionCookie(
  rawCookie: string | undefined,
  secret: string,
  nowMs: number,
): { userId: string; cguB2bVersion: number } | null {
  // ... décoder, vérifier HMAC en timing-safe, vérifier exp
  // Retourner null si quoi que ce soit échoue
}
```

### Middleware

`apps/web/src/middleware.ts` étend le middleware existant (next-intl,
Auth.js) avec une nouvelle clause pour les routes conseiller (cf.
`contracts/middleware-version-check.md` pour le pseudo-code complet).

### Controller backend

`apps/api/src/modules/identite/interface/http/legal-acceptance.controller.ts` :

```typescript
@Controller('me/legal')
@UseGuards(AuthGuard)
export class LegalAcceptanceController {
  @Post('accept')
  @UseGuards(RoleGuard('conseiller', 'admin'))
  async accept(@Body() dto: AcceptCguB2bDto, @Req() req: Request): Promise<AcceptResponse> {
    // ... use case ...
    res.cookie('__Host-cv.legal-version', signLegalVersionCookie(...), { /* attrs */ });
    return { acceptanceId, acceptedAt };
  }

  @Get('version-status')
  @UseGuards(RoleGuard('conseiller', 'admin'))
  async versionStatus(@Req() req: Request, @Res() res: Response): Promise<VersionStatusResponse> {
    const result = await this.checkCguUpToDateUseCase.execute({ userId: req.user.id });
    res.cookie('__Host-cv.legal-version', signLegalVersionCookie(...), { /* attrs */ });
    return result;
  }
}
```

### Métriques d'observabilité

- `legal_cookie_present_total` (counter)
- `legal_cookie_valid_total{result}` (counter avec labels `'valid'`, `'expired'`, `'invalid_signature'`, `'wrong_user'`)
- `legal_cookie_forge_detected_total` (counter) — alerte CRITICAL > 5/heure
- `legal_version_status_api_calls_total` (counter)
- `legal_middleware_redirect_total{reason}` (counter avec labels)

Wired dans Grafana Cloud Canada (ADR-0003) au moment de la livraison.

---

## Tests

Tests obligatoires avant merge (cf. `contracts/middleware-version-check.md` pour la liste complète, **9 cas**) :

- **Test signature HMAC** : `signLegalVersionCookie` est déterministe pour
  même input ; `verifyLegalVersionCookie` retourne `null` si signature
  modifiée même d'un caractère.
- **Test forge detection (P0 bloquant)** : cookie avec signature
  invalide est traité comme absent ; métrique `legal_cookie_forge_detected_total++`.
- **Test wrong user** : cookie valide signé pour user A, présenté par
  session user B → traité comme absent + log WARN.
- **Test redirect obsolète (P0 bloquant)** : conseiller avec version v1
  acceptée alors que la version courante est v2 → redirect.
- **Test route exclue (P0 bloquant)** : `/cgu-conseiller/re-accepter`
  elle-même n'est jamais redirigée (sinon boucle infinie).
- **Test cas voyageur** : voyageur (pas de session conseiller) sur route
  conseiller → comportement existant (redirect login), pas notre
  middleware.
- **Test multi-tab race** : 2 requêtes simultanées sans cookie reçoivent
  le même cookie cohérent.

---

## Plan de migration (en cas de remplacement futur)

Si on veut un jour remplacer ce mécanisme par un autre (par exemple un
Service Worker côté client, ou un système de notifications push) :

1. Créer un nouvel ADR remplaçant celui-ci.
2. Implémenter le nouveau mécanisme **en parallèle** du middleware
   actuel (deux check distincts, le user est redirigé si l'un OU l'autre
   échoue — défense en profondeur pendant la transition).
3. Observer les métriques pendant 30 jours pour s'assurer que le
   nouveau mécanisme couvre 100 % des cas du middleware.
4. Décommissionner le middleware en gardant le endpoint `version-status`
   pour audit.

---

## Références

- [Constitution v2.2.0](../../.specify/memory/constitution.md), Principe IX (Sécurité applicative)
- [Spec 004 — Mentions légales](../../specs/004-mentions-legales/spec.md), FR-013
- [Research 004 — R4 + R8](../../specs/004-mentions-legales/research.md)
- [ADR-0004 — Auth.js v5 + session DB partagée](./0004-auth-session-db-partagee.md)
- [Contract 004 — Middleware version-check](../../specs/004-mentions-legales/contracts/middleware-version-check.md)
- [OWASP — Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [MDN — HttpOnly cookie attribute](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)
- [Next.js Middleware documentation](https://nextjs.org/docs/app/building-your-application/routing/middleware)
