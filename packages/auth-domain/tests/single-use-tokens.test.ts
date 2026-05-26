// T017 — tests RED de issueToken + verifyToken (R2 / JWT HS256).
//
// Couvre :
//   - signature valide → OK
//   - signature falsifiée → REJET
//   - exp expiré → REJET
//   - purpose mismatch (cross-purpose attack) → REJET
//   - nonce stable + structure JWT

import { describe, expect, it } from 'vitest';
import { type TokenPurpose, issueToken, verifyToken } from '../src/single-use-tokens';

// 32 octets de zéros décodés = secret de test (32 bytes).
const TEST_SECRET_BASE64 = Buffer.alloc(32).toString('base64');

const NOW = new Date('2026-05-26T12:00:00Z');

describe('issueToken + verifyToken', () => {
  describe('signature valide', () => {
    it('issue + verify round-trip succeeds', async () => {
      const issued = await issueToken({
        purpose: 'email_verification',
        userId: '00000000-0000-4000-8000-000000000001',
        ttlSec: 3600,
        secret: TEST_SECRET_BASE64,
        now: NOW,
      });

      const verified = await verifyToken({
        token: issued.token,
        expectedPurpose: 'email_verification',
        secret: TEST_SECRET_BASE64,
        now: NOW,
      });

      expect(verified.ok).toBe(true);
      if (verified.ok) {
        expect(verified.payload.purpose).toBe('email_verification');
        expect(verified.payload.userId).toBe('00000000-0000-4000-8000-000000000001');
        expect(verified.payload.nonce).toBe(issued.nonce);
      }
    });

    it('issued token contains required fields', async () => {
      const issued = await issueToken({
        purpose: 'password_reset',
        userId: '00000000-0000-4000-8000-000000000002',
        ttlSec: 3600,
        secret: TEST_SECRET_BASE64,
        now: NOW,
      });
      expect(issued.token).toBeTruthy();
      expect(issued.nonce).toBeTruthy();
      expect(issued.expiresAt).toEqual(new Date(NOW.getTime() + 3600 * 1000));
    });
  });

  describe('signature falsifiée', () => {
    it('rejette un token signé avec un secret différent', async () => {
      const otherSecret = Buffer.alloc(32, 1).toString('base64');
      const issued = await issueToken({
        purpose: 'email_verification',
        userId: '00000000-0000-4000-8000-000000000001',
        ttlSec: 3600,
        secret: otherSecret,
        now: NOW,
      });

      const verified = await verifyToken({
        token: issued.token,
        expectedPurpose: 'email_verification',
        secret: TEST_SECRET_BASE64,
        now: NOW,
      });

      expect(verified.ok).toBe(false);
      if (!verified.ok) {
        expect(verified.code).toBe('INVALID_OR_EXPIRED_TOKEN');
      }
    });

    it('rejette un token tronqué', async () => {
      const issued = await issueToken({
        purpose: 'email_verification',
        userId: '00000000-0000-4000-8000-000000000001',
        ttlSec: 3600,
        secret: TEST_SECRET_BASE64,
        now: NOW,
      });

      const verified = await verifyToken({
        token: issued.token.slice(0, -10),
        expectedPurpose: 'email_verification',
        secret: TEST_SECRET_BASE64,
        now: NOW,
      });

      expect(verified.ok).toBe(false);
    });
  });

  describe('expiration', () => {
    it('rejette un token expiré (exp < now)', async () => {
      const issued = await issueToken({
        purpose: 'email_verification',
        userId: '00000000-0000-4000-8000-000000000001',
        ttlSec: 60,
        secret: TEST_SECRET_BASE64,
        now: NOW,
      });

      const futureNow = new Date(NOW.getTime() + 120 * 1000); // 2 min plus tard
      const verified = await verifyToken({
        token: issued.token,
        expectedPurpose: 'email_verification',
        secret: TEST_SECRET_BASE64,
        now: futureNow,
      });

      expect(verified.ok).toBe(false);
      if (!verified.ok) {
        expect(verified.code).toBe('INVALID_OR_EXPIRED_TOKEN');
      }
    });
  });

  describe('cross-purpose attack', () => {
    it('rejette un token email_verification utilisé comme password_reset', async () => {
      const issued = await issueToken({
        purpose: 'email_verification',
        userId: '00000000-0000-4000-8000-000000000001',
        ttlSec: 3600,
        secret: TEST_SECRET_BASE64,
        now: NOW,
      });

      const verified = await verifyToken({
        token: issued.token,
        expectedPurpose: 'password_reset',
        secret: TEST_SECRET_BASE64,
        now: NOW,
      });

      expect(verified.ok).toBe(false);
      if (!verified.ok) {
        expect(verified.code).toBe('INVALID_OR_EXPIRED_TOKEN');
      }
    });

    const purposes: readonly TokenPurpose[] = [
      'email_verification',
      'password_reset',
      'admin_invitation',
    ];
    for (const issuedPurpose of purposes) {
      for (const verifiedPurpose of purposes) {
        if (issuedPurpose === verifiedPurpose) continue;
        it(`rejette ${issuedPurpose} comme ${verifiedPurpose}`, async () => {
          const issued = await issueToken({
            purpose: issuedPurpose,
            userId: '00000000-0000-4000-8000-000000000001',
            ttlSec: 3600,
            secret: TEST_SECRET_BASE64,
            now: NOW,
          });
          const verified = await verifyToken({
            token: issued.token,
            expectedPurpose: verifiedPurpose,
            secret: TEST_SECRET_BASE64,
            now: NOW,
          });
          expect(verified.ok).toBe(false);
        });
      }
    }
  });

  describe('nonce', () => {
    it('génère un nonce différent à chaque appel', async () => {
      const a = await issueToken({
        purpose: 'email_verification',
        userId: '00000000-0000-4000-8000-000000000001',
        ttlSec: 3600,
        secret: TEST_SECRET_BASE64,
        now: NOW,
      });
      const b = await issueToken({
        purpose: 'email_verification',
        userId: '00000000-0000-4000-8000-000000000001',
        ttlSec: 3600,
        secret: TEST_SECRET_BASE64,
        now: NOW,
      });
      expect(a.nonce).not.toBe(b.nonce);
    });
  });
});
