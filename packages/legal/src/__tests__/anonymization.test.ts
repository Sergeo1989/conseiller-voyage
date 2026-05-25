// TDD RED — Tests des fonctions pures d'anonymisation Loi 25.
// Cf. specs/004-mentions-legales/research.md R3 + R6 + ADR-0008.

import { describe, expect, it } from 'vitest';
import { extractBrowserFamily, hashSubjectId, maskIpAddress } from '../anonymization';

const FIXED_SALT = 'a'.repeat(32); // salt déterministe pour tests
const ALT_SALT = 'b'.repeat(32);

const UUID_A = '00000000-0000-4000-8000-000000000001';
const UUID_B = '00000000-0000-4000-8000-000000000002';

describe('hashSubjectId (T022)', () => {
  it('retourne une chaîne hex de 64 caractères', () => {
    const hash = hashSubjectId(UUID_A, FIXED_SALT);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('est déterministe : même input → même hash', () => {
    expect(hashSubjectId(UUID_A, FIXED_SALT)).toBe(hashSubjectId(UUID_A, FIXED_SALT));
  });

  it('produit des hashes différents pour 2 IDs différents (même salt)', () => {
    expect(hashSubjectId(UUID_A, FIXED_SALT)).not.toBe(hashSubjectId(UUID_B, FIXED_SALT));
  });

  it('produit des hashes différents pour le même ID avec 2 salts différents', () => {
    expect(hashSubjectId(UUID_A, FIXED_SALT)).not.toBe(hashSubjectId(UUID_A, ALT_SALT));
  });

  it('rejette subjectId vide', () => {
    expect(() => hashSubjectId('', FIXED_SALT)).toThrow();
  });

  it('rejette salt vide (faille sécurité directe)', () => {
    expect(() => hashSubjectId(UUID_A, '')).toThrow();
  });
});

describe('maskIpAddress (T021)', () => {
  describe('IPv4', () => {
    it('conserve le premier octet, met les 3 autres à 0', () => {
      expect(maskIpAddress('192.168.1.42')).toBe('192.0.0.0');
      expect(maskIpAddress('10.0.0.1')).toBe('10.0.0.0');
      expect(maskIpAddress('203.0.113.99')).toBe('203.0.0.0');
    });

    it('gère IPv4 bornes basses et hautes', () => {
      expect(maskIpAddress('0.0.0.0')).toBe('0.0.0.0');
      expect(maskIpAddress('255.255.255.255')).toBe('255.0.0.0');
    });
  });

  describe('IPv6', () => {
    it('conserve les 3 premiers groupes (préfixe /48)', () => {
      expect(maskIpAddress('2001:db8:abcd:ef00:1234:5678:9abc:def0')).toBe('2001:db8:abcd::');
    });

    it('normalise les zéros compressés', () => {
      // 2001:db8::ff42 = 2001:db8:0:0:0:0:0:ff42
      // Masque /48 = 2001:db8::
      expect(maskIpAddress('2001:db8::ff42')).toBe('2001:db8::');
    });

    it('localhost IPv6', () => {
      expect(maskIpAddress('::1')).toBe('::');
    });
  });

  describe('entrées dégénérées', () => {
    it('retourne 0.0.0.0 pour une chaîne vide', () => {
      expect(maskIpAddress('')).toBe('0.0.0.0');
    });

    it('retourne 0.0.0.0 pour une IP malformée', () => {
      expect(maskIpAddress('not-an-ip')).toBe('0.0.0.0');
      expect(maskIpAddress('999.999.999.999')).toBe('0.0.0.0');
      expect(maskIpAddress('foo:bar')).toBe('0.0.0.0');
    });
  });
});

describe('extractBrowserFamily (T020)', () => {
  // Fixtures réelles de User-Agent strings
  const FIREFOX_UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0';
  const CHROME_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const SAFARI_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15';
  const EDGE_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
  const GOOGLEBOT_UA =
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/W.X.Y.Z Safari/537.36';

  it('détecte Firefox', () => {
    expect(extractBrowserFamily(FIREFOX_UA)).toBe('Firefox');
  });

  it('détecte Chrome', () => {
    expect(extractBrowserFamily(CHROME_UA)).toBe('Chrome');
  });

  it('détecte Safari', () => {
    expect(extractBrowserFamily(SAFARI_UA)).toBe('Safari');
  });

  it('détecte Edge', () => {
    expect(extractBrowserFamily(EDGE_UA)).toMatch(/Edge/i);
  });

  it('détecte Googlebot comme bot OU comme browser identifié — non vide', () => {
    const result = extractBrowserFamily(GOOGLEBOT_UA);
    // ua-parser-js peut retourner 'Googlebot' ou similaire
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('unknown');
  });

  it("retourne 'unknown' pour une chaîne vide", () => {
    expect(extractBrowserFamily('')).toBe('unknown');
  });

  it("retourne 'unknown' pour une UA malformée non parsable", () => {
    expect(extractBrowserFamily('not-a-user-agent')).toBe('unknown');
  });

  it('perd la version exacte (anonymisation Loi 25)', () => {
    // Firefox version 121 et Firefox version 999 doivent retourner le même
    // résultat — la version n'est PAS conservée par l'anonymisation.
    const firefoxOld = FIREFOX_UA.replace('121.0', '88.0');
    const firefoxNew = FIREFOX_UA.replace('121.0', '999.0');
    expect(extractBrowserFamily(firefoxOld)).toBe(extractBrowserFamily(firefoxNew));
  });

  it("perd l'OS (anonymisation Loi 25)", () => {
    // Chrome Windows vs Chrome Linux — même famille
    const chromeWindows = CHROME_UA;
    const chromeLinux = CHROME_UA.replace('Windows NT 10.0; Win64; x64', 'X11; Linux x86_64');
    expect(extractBrowserFamily(chromeWindows)).toBe(extractBrowserFamily(chromeLinux));
  });
});
