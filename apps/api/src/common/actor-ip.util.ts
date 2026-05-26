// actor-ip.util.ts — résolution + abrégement d'IP source pour audit.
//
// BUG_013 ultraréview : 5 contrôleurs MFA dupliquaient `readActorIp`
// + `abridgeIp` (~25 lignes × 5 = 125 lignes copiées). En plus du
// duplicate code, l'implémentation naïve avait deux problèmes :
//
//   (1) Confiance aveugle dans `x-forwarded-for` — chaque caller
//       pouvait spoofer son IP audit en posant l'en-tête lui-même
//       depuis un client externe (FR-018, Principe IX violé).
//   (2) Abrégement IPv6 cassé sur :
//         - boucle locale `::1` → `::::` (3 vides)
//         - IPv4-mapped `::ffff:1.2.3.4` → `::ffff::` (perte IPv4)
//         - adresse compressée `2001:db8::1` → `2001:db8::::`
//       L'audit immuable contient donc des valeurs invalides.
//
// Cette implémentation :
//   - n'accepte XFF que si `TRUSTED_PROXY_HEADERS=true` (prod
//     derrière CloudFront / ALB). Sinon utilise `req.ip` fourni par
//     Fastify (lui-même contrôlé par le serveur, non par le client).
//   - abrège via `ipaddr.js`. IPv4 → /24 (zero le dernier octet),
//     IPv6 → /48 (zero les groupes 4..8). IPv4-mapped IPv6 est
//     d'abord normalisé en IPv4.
//   - retourne `undefined` si la chaîne ne parse pas (mieux qu'audit
//     avec garbage).
//
// L'output suit le contrat ADR-0008 sur le masquage Loi 25.

import { type IPv4, IPv6, isValid, parse } from 'ipaddr.js';

export interface ActorIpRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly ip?: string;
}

/**
 * Politique de confiance dans l'en-tête `x-forwarded-for`.
 * `true` UNIQUEMENT en production derrière un reverse proxy de
 * confiance (CloudFront, ALB, nginx) — sinon n'importe quel client
 * peut spoofer son IP.
 *
 * Défaut : `false` (dev + tests). En CDK/prod, posé via env.
 */
function trustProxyHeaders(): boolean {
  return process.env.TRUSTED_PROXY_HEADERS === 'true';
}

/**
 * Récupère l'IP du caller, abrégée et prête pour l'audit immuable.
 * Retourne `undefined` si l'IP n'est pas déterminable ou pas
 * parseable.
 */
export function readActorIp(req: ActorIpRequest): string | undefined {
  const candidate = extractCandidate(req);
  if (!candidate) return undefined;
  return abridgeIp(candidate);
}

function extractCandidate(req: ActorIpRequest): string | undefined {
  if (trustProxyHeaders()) {
    const xff = req.headers['x-forwarded-for'];
    const xffStr = Array.isArray(xff) ? xff[0] : xff;
    if (typeof xffStr === 'string') {
      // XFF format : `<client>, <proxy1>, <proxy2>...`. Le client est
      // toujours le premier élément (RFC 7239 + de facto AWS/CloudFront).
      const first = xffStr.split(',')[0]?.trim();
      if (first) return first;
    }
  }
  if (req.ip) return req.ip;
  return undefined;
}

/**
 * Abrège une IP pour stockage Loi 25 compliant.
 *
 *   IPv4 1.2.3.4         → "1.2.3.0"
 *   IPv6 2001:db8::1     → "2001:db8:0000::"
 *   IPv4-mapped IPv6     → traité comme IPv4
 *   chaîne invalide      → `undefined`
 */
export function abridgeIp(raw: string): string | undefined {
  if (!isValid(raw)) return undefined;
  const addr = parse(raw);

  // IPv4-mapped IPv6 (::ffff:X.X.X.X) — normalise en IPv4 pour
  // produire un /24 lisible plutôt qu'un /48 IPv6.
  if (addr.kind() === 'ipv6') {
    const v6 = addr as IPv6;
    if (v6.isIPv4MappedAddress()) {
      const v4 = v6.toIPv4Address();
      return abridgeV4(v4);
    }
    return abridgeV6(v6);
  }
  return abridgeV4(addr as IPv4);
}

function abridgeV4(addr: IPv4): string {
  const [a, b, c] = addr.octets;
  return `${a}.${b}.${c}.0`;
}

function abridgeV6(addr: IPv6): string {
  const parts = addr.parts.slice();
  for (let i = 3; i < 8; i++) parts[i] = 0;
  const fresh = new IPv6(parts);
  return fresh.toRFC5952String();
}
