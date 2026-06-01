// T070 (feature 008-matching-scoring / US2) — Vérification du cookie
// `cv_suggested` HMAC SHA-256 posé par feature 007.
//
// Format du cookie : `{conseillerId}.{hmacHex}` où
//   hmacHex = HMAC_SHA256(env.CV_SUGGESTED_COOKIE_SECRET, conseillerId).
//
// Le cookie est posé côté navigateur quand le voyageur consulte une page
// publique de profil conseiller (feature 007). À la soumission du brief
// (008), le controller lit ce cookie et passe la valeur validée à
// `SubmitBriefUseCase` qui la persiste dans `voyageur_briefs.suggestedConseillerId`.
// Le matching (011) applique alors un boost ≤ +10 % (FR-011) si le conseiller
// est éligible au moment du calcul.
//
// Validation `timingSafeEqual` pour éviter les attaques par timing.

import { createHmac, timingSafeEqual } from 'node:crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Lit et valide la valeur d'un cookie `cv_suggested`. Retourne le conseillerId
 * si la signature HMAC est valide et que le format est conforme, sinon null
 * (cookie absent, mal formé, signature invalide, conseillerId non-UUID).
 *
 * Pure : appel uniquement à `crypto` standard, déterministe pour des entrées
 * identiques. Pas d'I/O réseau ni DB.
 */
export function verifyCvSuggestedCookie(
  cookieValue: string | null | undefined,
  secret: string,
): string | null {
  if (!cookieValue) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;
  const [conseillerId, providedHmacHex] = parts;
  if (!conseillerId || !providedHmacHex) return null;
  if (!UUID_REGEX.test(conseillerId)) return null;
  // HMAC hex est 64 caractères pour SHA-256
  if (providedHmacHex.length !== 64) return null;

  const expectedHmacHex = createHmac('sha256', secret).update(conseillerId).digest('hex');

  // timingSafeEqual exige des buffers de même longueur — garanti par les checks ci-dessus
  const expected = Buffer.from(expectedHmacHex, 'hex');
  const provided = Buffer.from(providedHmacHex, 'hex');
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;

  return conseillerId;
}
