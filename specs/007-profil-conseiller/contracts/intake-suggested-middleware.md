# Contract — Middleware `/intake?suggested=<id>` + Cookie `cv_suggested`

**Définition** : middleware Next.js dans `apps/web/src/middleware.ts`
**Consommateur futur** : module préqualification (feature 008) — pour
lire le cookie au moment de la soumission de l'intake et passer la liste
au module matching (feature 011).

---

## Vue d'ensemble

1. Le voyageur clique sur le CTA de la page publique
   `/conseiller/<slug>` : lien HTML statique
   `<a href="/intake?suggested=<conseillerId>">`.
2. Le middleware Next.js intercepte la requête arrivant sur `/intake`
   avec query `suggested`.
3. Middleware :
   - Décode et valide le cookie `cv_suggested` existant (HMAC + JSON).
   - Ajoute l'entrée `{conseillerId, timestamp}` (FIFO ≤ 10).
   - Réencode + ressigne.
   - `Set-Cookie cv_suggested`.
   - Retourne `302 Found` vers `/intake` (sans paramètre).
4. Le voyageur arrive sur `/intake` avec un cookie posé pour 24 h.
5. À la soumission de l'intake (feature 008, server action), le cookie
   est lu et la liste est jointe à la demande de matching (feature 011).

---

## Format du cookie

### Identité

- **Nom** : `cv_suggested`
- **HttpOnly** : `true`
- **Secure** : `true` en production ; `false` en dev local seulement.
- **SameSite** : `Lax` (le voyageur arrive depuis la page profil
  /conseiller/* qui est même origin).
- **Path** : `/intake` (limite l'envoi du cookie aux requêtes
  intake — pas envoyé sur les autres routes).
- **Max-Age** : `86400` (24 h, aligné avec la fenêtre FR-008a).

### Format de la valeur

```
<base64url(JSON.stringify(payload))>.<base64url(hmac_sha256(payload, secret))>
```

Où `payload` est :

```typescript
type SuggestedCookiePayload = {
  v: 1;  // version du format pour évolution future
  entries: SuggestedEntry[];  // FIFO ordre = ordre d'insertion ; max 10
};

type SuggestedEntry = {
  cid: string;   // conseillerId (UUID v4)
  ts: number;    // timestamp Unix ms d'insertion
};
```

### Algorithme HMAC

- Algorithme : `HMAC-SHA256`.
- Secret : `CV_SUGGESTED_COOKIE_SECRET` (32+ octets, AWS Secrets Manager
  en prod, 1Password CLI en dev).
- Rotation : possible en ajoutant une seconde clé `*_PREV` et en
  acceptant les deux pendant la fenêtre de migration (24 h).

### Exemple

```
eyJ2IjoxLCJlbnRyaWVzIjpbeyJjaWQiOiI1NWE4Li4uIiwidHMiOjE3NDg1MzAyMDB9XX0.K3JX4uHCnTpvWoZmL8x0...
```

---

## Algorithme du middleware

```typescript
// apps/web/src/middleware.ts (extrait)

import { NextRequest, NextResponse } from 'next/server';
import { validateSuggestedCookie, signSuggestedPayload } from './lib/suggested-cookie';

export async function middleware(req: NextRequest) {
  // ... chaînage auth + CGU existants ...

  const pathname = req.nextUrl.pathname;
  const suggestedParam = req.nextUrl.searchParams.get('suggested');

  if (pathname === '/intake' && suggestedParam) {
    // 1. Validation format du paramètre
    if (!isValidUuidV4(suggestedParam)) {
      // Paramètre malformé : ignorer silencieusement, redirect propre
      const cleanUrl = new URL('/intake', req.url);
      return NextResponse.redirect(cleanUrl, 302);
    }

    // 2. Lire le cookie existant (peut être absent)
    const existingCookie = req.cookies.get('cv_suggested')?.value;
    const existingEntries = existingCookie
      ? validateSuggestedCookie(existingCookie) ?? []
      : [];

    // 3. Construire la nouvelle liste FIFO
    const now = Date.now();
    const newEntry = { cid: suggestedParam, ts: now };

    // Dédoublonner : si le cid est déjà présent, mettre à jour son ts (déplace en queue FIFO)
    const filtered = existingEntries.filter(e => e.cid !== suggestedParam);
    const combined = [...filtered, newEntry];

    // Plafond FIFO 10
    const truncated = combined.slice(-10);

    // 4. Signer
    const payload = { v: 1 as const, entries: truncated };
    const signedValue = signSuggestedPayload(payload);

    // 5. Set-Cookie + redirect URL propre
    const cleanUrl = new URL('/intake', req.url);
    const res = NextResponse.redirect(cleanUrl, 302);
    res.cookies.set('cv_suggested', signedValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/intake',
      maxAge: 86400,
    });
    return res;
  }

  // Fallthrough vers le reste de la chaîne
  return NextResponse.next();
}

export const config = {
  matcher: ['/intake', '/(conseiller)/:path*', '/(admin)/:path*'],
};
```

---

## Contrat de lecture (feature 008 future)

La feature 008 (intake) devra exposer un helper côté server action :

```typescript
// packages/profil-domain/src/suggested-cookie.ts (ou un nouveau package partagé)

export function lireSuggestedCookie(cookieValue: string): SuggestedEntry[] {
  // 1. Décoder + valider HMAC ; si invalide → return []
  // 2. Filtrer les entrées au-delà de 24h
  // 3. Retourner les entrées valides (max 10)
}
```

Puis le module matching (011) reçoit cette liste et applique le boost
soft ≤ +10 % (cf. plan Constitution Check Principe III).

---

## Validation à la soumission de l'intake (feature 008 + 011)

À la soumission de l'intake :

1. Lire `cv_suggested` côté server action (`cookies().get(...)`).
2. `lireSuggestedCookie` (validation HMAC + filtre 24 h).
3. Pour chaque `cid` retenu, vérifier `EstProfilPublicPort.estPublic(cid)`
   (cf. est-profil-public.port.md). Si `false` → ignorer cette entrée.
4. La liste finale (max 10) est passée à `MatchAdvisorsUseCase` (feature
   011 future) comme paramètre `boosts: string[]`.
5. Le matching applique +10 % de scoring à chaque ID de cette liste
   (cumulable, mais le top-3 reste algorithmique — pas d'override).

---

## Sécurité

| Risque | Mitigation |
|---|---|
| Cookie forge | HMAC SHA-256 avec secret AWS Secrets Manager rotation séparée. |
| Cookie tamper | Vérification HMAC AVANT décodage du payload. Cookie invalide → traité comme absent. |
| Cookie replay (24 h après la consultation) | Filtre `ts` côté lecture : entrées > 24 h ignorées. |
| Cookie inflation | Plafond FIFO 10 entrées. Limite HTTP ~4 Ko respectée. |
| Cookie cross-site | `SameSite=Lax` + `Path=/intake`. |
| Boost forge (`suggested=<id>` sur un conseiller qui n'a jamais été consulté) | Validation `EstProfilPublic` à la soumission. Mais on ne valide PAS au middleware (pas d'accès DB à l'edge). |
| Override plafond 3 (Principe III) | Le boost est cumulé au scoring, le matching ne fait jamais une garantie d'inclusion. Test d'invariant Principe III dans 011. |

---

## Tests d'acceptation

| Test | Scénario |
|---|---|
| Voyageur clique CTA → redirect propre `/intake` + cookie posé | FR-008a |
| Cookie déjà présent + 2e consultation → 2 entrées FIFO | FR-008a |
| 11e consultation → 1ère évincée (FIFO) | FR-008a |
| Cookie tampered (HMAC invalide) → traité comme absent | Sécurité |
| Entrée > 24 h → ignorée à la lecture | FR-008a fenêtre |
| `suggested` non-UUID → redirect propre sans set-cookie | Validation |
| Page profil reste cacheable (le CTA est statique, le middleware tourne sur /intake seulement) | Principe XII / R4 |
