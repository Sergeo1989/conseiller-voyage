# Contract — Middleware Next.js de vérification de version CGU

**Date** : 2026-05-25

**Localisation** : `apps/web/src/middleware.ts` (extension du middleware
livré en 001) + `apps/web/src/lib/legal/{cookie-hmac,version-check}.ts`
(helpers purs).

**Référence** : research [R4](../research.md#r4) + [R8](../research.md#r8) ;
ADR-0009 (à créer) formalise la décision.

---

## Périmètre

Le middleware s'exécute sur **toutes** les routes du segment
authentifié conseiller (`/[locale]/(conseiller)/**`), à l'exception
explicite de :

- `/[locale]/cgu-conseiller/re-accepter` (page de ré-acceptation
  elle-même, sinon redirection en boucle).
- `/[locale]/cgu-conseiller` (lecture de la version actuelle).
- `/[locale]/confidentialite` (consultation toujours possible).
- Toutes les autres routes du segment `(legal)`.
- Les routes API (gérées par leur propre auth).

Le voyageur **n'est jamais concerné** par ce middleware (son
acceptation est liée au `briefId`, one-shot).

---

## Cookie `__Host-cv.legal-version`

### Format

```text
base64url(JSON.stringify(payload)) + '.' + hex(HMAC-SHA256(payload, secret))

payload = {
  userId: string (UUID),
  cguB2bVersion: number,
  exp: number (unix timestamp UTC, ms),
}
```

### Attributs HTTP

- `Name`: `__Host-cv.legal-version`
- `HttpOnly`: true (aucune lecture JS)
- `Secure`: true (HTTPS uniquement — imposé par le préfixe `__Host-`)
- `SameSite=Lax`: protège contre CSRF basique tout en gardant les
  navigations classiques
- `Path=/`: imposé par le préfixe `__Host-`
- `Max-Age`: 300 (5 minutes)

### Secret HMAC

- Nom : `LEGAL_COOKIE_HMAC_SECRET`
- Type : 32 bytes random, base64url-encodés
- Stockage : AWS Secrets Manager `ca-central-1`
- Accès : rôle IAM ECS Fargate de l'app backend uniquement
- Rotation : annuelle planifiée, ou immédiate en cas d'incident
  (lors d'une rotation, les anciens cookies sont invalidés naturellement
  via signature invalide → fallback endpoint backend)

### Validation côté middleware (Next.js Edge Runtime)

```typescript
// apps/web/src/lib/legal/cookie-hmac.ts
import { createHmac } from 'node:crypto'; // disponible en Edge Runtime depuis Next.js 14

export function verifyLegalVersionCookie(
  rawCookie: string | undefined,
  secret: string,
  nowMs: number,
): { userId: string; cguB2bVersion: number } | null {
  if (!rawCookie) return null;
  const parts = rawCookie.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;

  // Vérification signature HMAC en temps constant
  const expectedSignature = createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('hex');
  if (!timingSafeEqual(signature, expectedSignature)) return null;

  // Decode + check expiration
  try {
    const payload = JSON.parse(base64urlDecode(encodedPayload));
    if (typeof payload.userId !== 'string') return null;
    if (typeof payload.cguB2bVersion !== 'number') return null;
    if (typeof payload.exp !== 'number') return null;
    if (payload.exp < nowMs) return null;
    return { userId: payload.userId, cguB2bVersion: payload.cguB2bVersion };
  } catch {
    return null;
  }
}
```

`timingSafeEqual` doit utiliser une comparaison en temps constant
(`crypto.timingSafeEqual` ou polyfill équivalent).

---

## Logique du middleware

```typescript
// apps/web/src/middleware.ts (extrait pertinent)

import { NextResponse, NextRequest } from 'next/server';
import { verifyLegalVersionCookie } from '@/lib/legal/cookie-hmac';

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (!isConseillerProtectedRoute(pathname)) return NextResponse.next();

  const session = await getAuthSession(req); // existant via Auth.js
  if (!session) return redirectToLogin(req);

  const cookie = req.cookies.get('__Host-cv.legal-version')?.value;
  const verified = verifyLegalVersionCookie(cookie, secret, Date.now());

  if (verified && verified.userId === session.userId) {
    // Cookie valide → vérifier que la version acceptée est la version courante
    const currentVersion = await getCurrentCguB2bVersionCached(); // cache process 60s
    if (verified.cguB2bVersion === currentVersion) {
      return NextResponse.next();
    } else {
      return NextResponse.redirect(
        new URL(`/${getLocale(req)}/cgu-conseiller/re-accepter`, req.url),
      );
    }
  }

  // Cookie absent / forgé / expiré → fallback API
  const statusResponse = await fetchVersionStatus(session, req);
  if (statusResponse.status === 'up_to_date') {
    const response = NextResponse.next();
    response.cookies.set(
      '__Host-cv.legal-version',
      signLegalVersionCookie(session.userId, statusResponse.current, secret),
      { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 300 },
    );
    return response;
  }

  return NextResponse.redirect(
    new URL(`/${getLocale(req)}/cgu-conseiller/re-accepter`, req.url),
  );
}
```

---

## Endpoint backend pour le refresh

`GET /api/me/legal/version-status`

- **Auth** : AuthGuard livré en 001 (session Auth.js v5).
- **RBAC** : `role IN ('conseiller', 'admin')`.
- **Réponse** :

```typescript
{
  accepted: number | null,   // dernière version cgu_b2b acceptée par le user
  current: number,           // version active actuelle (max effective)
  status: 'up_to_date' | 'outdated' | 'never_accepted',
}
```

Pas de side effect (lecture seule). Pas idempotent par design (chaque
appel re-lit la BD).

---

## Comportements à tester (`legal-middleware.spec.ts`)

| # | Scénario | Résultat attendu |
|---|---|---|
| 1 | Conseiller authentifié, cookie absent | Appel `/api/me/legal/version-status` → set cookie → next() |
| 2 | Cookie valide et version à jour | next() direct, pas d'appel API |
| 3 | Cookie valide mais TTL expiré (`exp < now()`) | Traité comme absent → refresh via API |
| 4 | Cookie signature invalide (forge tentée) | Traité comme absent → refresh via API. Métric `legal_cookie_forge_detected_total++` |
| 5 | Cookie valide mais `userId` ≠ session userId (vol de cookie) | Traité comme absent → refresh via API. Alerte log WARN |
| 6 | Version acceptée < version courante | Redirect `/cgu-conseiller/re-accepter` |
| 7 | Multi-tab : 2 requêtes concurrentes sans cookie | Les 2 appellent l'API ; l'API est idempotente ; les 2 réponses set le même cookie |
| 8 | Voyageur sur route conseiller (pas de session) | Redirect login (comportement existant, hors scope nouveau) |
| 9 | Route exclue du check (`/cgu-conseiller/re-accepter`) | next() sans vérification |

**Tests bloquants pour merge** (Issue 3.1 de la review) :

- Cas 4 (forge detection) — sinon faille de sécurité directe.
- Cas 6 (redirect obsolète) — sinon le mécanisme ne sert à rien.
- Cas 9 (route exclue) — sinon redirection en boucle, app inutilisable.

---

## Métriques d'observabilité

- `legal_cookie_present_total` (counter)
- `legal_cookie_valid_total{result: 'valid' | 'expired' | 'invalid_signature' | 'wrong_user'}` (counter)
- `legal_cookie_forge_detected_total` (counter) — alerte CRITICAL si > 5
  événements / heure (attaque potentielle)
- `legal_version_status_api_calls_total` (counter — quantifie le fallback)
- `legal_middleware_redirect_total{reason: 'outdated' | 'never_accepted'}` (counter)

Dashboard Grafana lié dans le README du module identité au moment de la
livraison.

---

## Anti-patterns à éviter (documenté pour le `/speckit.tasks`)

❌ **Stocker la version acceptée en sessionStorage côté client**
— invisible au middleware Edge, donc inutile.

❌ **Polling depuis un Client Component**
— casse SSG, dégrade UX (flash de contenu).

❌ **Server Component check page par page**
— dispersion de la logique, oublié à chaque nouvelle page conseiller.

❌ **Cookie non signé**
— faille de sécurité directe (Issue 5.1 de la review).

❌ **TTL de 0 (refresh à chaque requête)**
— surcouche backend inutile pour une donnée qui change en jours.

❌ **TTL > 1 heure**
— un bump de version peut prendre trop de temps à se propager → fenêtre
de non-conformité.
