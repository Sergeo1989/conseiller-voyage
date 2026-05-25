// Fonctions pures d'anonymisation Loi 25 (ADR-0008).
// Cf. specs/004-mentions-legales/research.md R3 + R6 + R9.
//
// TDD validé (Principe VI NON-NÉGOCIABLE) — tests dans
// __tests__/anonymization.test.ts.

import { createHash } from 'node:crypto';
import { UAParser } from 'ua-parser-js';

// ---------------------------------------------------------------------
// hashSubjectId — SHA-256 salé (ADR-0008)
// ---------------------------------------------------------------------

/**
 * Hash SHA-256 d'un identifiant sujet avec un salt secret.
 *
 * - L'algorithme est SHA-256 nu sur la concaténation `subjectId || salt`.
 * - Le salt vient d'AWS Secrets Manager `ca-central-1` (secret
 *   `LOI25_SUBJECT_ANONYMIZATION_SALT`). Cf. ADR-0008.
 * - Retourne 64 caractères hex (256 bits).
 *
 * @param subjectId UUID v4 du sujet à anonymiser
 * @param salt secret (recommandé : 32 bytes en prod)
 * @returns hash hex 64 chars
 * @throws si subjectId ou salt est vide
 */
export function hashSubjectId(subjectId: string, salt: string): string {
  if (subjectId.length === 0) {
    throw new Error('hashSubjectId: subjectId must not be empty');
  }
  if (salt.length === 0) {
    throw new Error('hashSubjectId: salt must not be empty (security invariant)');
  }
  return createHash('sha256').update(subjectId).update(salt).digest('hex');
}

// ---------------------------------------------------------------------
// maskIpAddress — préfixe IPv4 /24 ou IPv6 /48
// ---------------------------------------------------------------------

const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Masque une adresse IP (IPv4 ou IPv6) pour anonymisation Loi 25.
 *
 * - IPv4 : conserve le premier octet seulement (`192.168.1.42` → `192.0.0.0`).
 * - IPv6 : conserve les 3 premiers groupes (préfixe /48 typique d'un FAI).
 * - Entrée malformée : retourne `'0.0.0.0'` (anonymisation maximale).
 *
 * @param ip adresse IP (IPv4 ou IPv6) à masquer
 * @returns IP masquée
 */
export function maskIpAddress(ip: string): string {
  if (ip.length === 0) {
    return '0.0.0.0';
  }

  // IPv4
  const ipv4Match = ip.match(IPV4_REGEX);
  if (ipv4Match) {
    const octets = [ipv4Match[1], ipv4Match[2], ipv4Match[3], ipv4Match[4]].map((s) => Number(s));
    if (octets.every((n) => n >= 0 && n <= 255)) {
      return `${octets[0]}.0.0.0`;
    }
    return '0.0.0.0';
  }

  // IPv6 — détection naïve (présence de ':') + 3 premiers groupes
  if (ip.includes(':')) {
    return maskIpv6(ip);
  }

  return '0.0.0.0';
}

/**
 * Masque IPv6 en conservant les 3 premiers groupes (préfixe /48).
 * Gère la compression `::` qui représente une séquence de groupes zéro,
 * et applique la compression IPv6 canonique sur la sortie (élide les
 * zéros trailing dans les 3 premiers groupes).
 */
function maskIpv6(ip: string): string {
  // Cas spécial : `::` (any) ou `::1` (localhost) → tout est dans les
  // 5 derniers groupes, donc le masque /48 est `::`.
  if (ip === '::' || ip === '::1') {
    return '::';
  }

  const expanded = expandIpv6(ip);
  if (expanded === null) {
    return '0.0.0.0';
  }

  // Garder les 3 premiers groupes, normaliser, puis trim les zéros
  // trailing pour la compression canonique IPv6 /48.
  const first3 = expanded.slice(0, 3).map(normalizeGroup);
  while (first3.length > 0 && first3[first3.length - 1] === '0') {
    first3.pop();
  }
  return first3.length === 0 ? '::' : `${first3.join(':')}::`;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: parsing IPv6 with `::` compression is inherently branchy ; 22 tests valident
function expandIpv6(ip: string): string[] | null {
  // Valider présence de hex et de séparateurs ':' uniquement
  if (!/^[0-9a-fA-F:]+$/.test(ip)) {
    return null;
  }

  // Split en respectant la compression '::'
  if (ip.includes(':::')) {
    return null;
  }
  const parts = ip.split('::');
  if (parts.length > 2) {
    return null;
  }

  if (parts.length === 1) {
    // Pas de compression
    const first = parts[0];
    if (first === undefined) {
      return null;
    }
    const groups = first.split(':');
    if (groups.length !== 8) {
      return null;
    }
    return groups;
  }

  // Compression présente
  const left = parts[0];
  const right = parts[1];
  if (left === undefined || right === undefined) {
    return null;
  }
  const leftGroups = left === '' ? [] : left.split(':');
  const rightGroups = right === '' ? [] : right.split(':');
  const missing = 8 - leftGroups.length - rightGroups.length;
  if (missing < 0) {
    return null;
  }
  return [...leftGroups, ...Array(missing).fill('0'), ...rightGroups];
}

function normalizeGroup(group: string): string {
  const lower = group.toLowerCase().replace(/^0+/, '') || '0';
  return lower;
}

// ---------------------------------------------------------------------
// extractBrowserFamily — via ua-parser-js (R6)
// ---------------------------------------------------------------------

/**
 * Extrait la famille du navigateur depuis un User-Agent string via
 * `ua-parser-js`. Anonymisation Loi 25 : perd la version, l'OS, le
 * device.
 *
 * @param userAgent User-Agent HTTP brut
 * @returns nom de la famille (ex: `'Firefox'`, `'Chrome'`, `'Safari'`)
 *           ou `'unknown'` si parsing échoue / UA vide
 */
export function extractBrowserFamily(userAgent: string): string {
  if (userAgent.length === 0) {
    return 'unknown';
  }
  try {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    const name = result.browser?.name;
    if (typeof name === 'string' && name.length > 0) {
      return name;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
