// T018 — tests RED de shouldLockout (FR-009 / R4).
//
// Politique : double bucket
//   account : 5 échecs / 15 min / par compte
//   ip      : 20 échecs / 1 h / par IP
// Le déclenchement de l'un OU l'autre suffit à bloquer.

import { describe, expect, it } from 'vitest';
import { type LockoutBucket, shouldLockout } from '../src/lockout-policy';

const NOW = new Date('2026-05-26T12:00:00Z');

describe('shouldLockout', () => {
  describe('bucket account', () => {
    it('ne bloque pas si compteur compte < 5', () => {
      const accountBucket: LockoutBucket = {
        failureCount: 4,
        windowStartAt: new Date(NOW.getTime() - 5 * 60 * 1000), // -5 min
      };
      const result = shouldLockout({
        account: accountBucket,
        ip: null,
        now: NOW,
        accountThreshold: 5,
        accountWindowSec: 15 * 60,
        ipThreshold: 20,
        ipWindowSec: 60 * 60,
      });
      expect(result.locked).toBe(false);
    });

    it('bloque si compteur compte >= 5 et fenêtre active', () => {
      const accountBucket: LockoutBucket = {
        failureCount: 5,
        windowStartAt: new Date(NOW.getTime() - 5 * 60 * 1000), // -5 min, dans la fenêtre 15 min
      };
      const result = shouldLockout({
        account: accountBucket,
        ip: null,
        now: NOW,
        accountThreshold: 5,
        accountWindowSec: 15 * 60,
        ipThreshold: 20,
        ipWindowSec: 60 * 60,
      });
      expect(result.locked).toBe(true);
      if (result.locked) {
        expect(result.reason).toBe('account_threshold');
        expect(result.retryAfterSec).toBeGreaterThan(0);
        expect(result.retryAfterSec).toBeLessThanOrEqual(10 * 60);
      }
    });

    it('ne bloque pas si fenêtre expirée (même si count >= 5)', () => {
      const accountBucket: LockoutBucket = {
        failureCount: 99,
        windowStartAt: new Date(NOW.getTime() - 20 * 60 * 1000), // -20 min, hors fenêtre 15 min
      };
      const result = shouldLockout({
        account: accountBucket,
        ip: null,
        now: NOW,
        accountThreshold: 5,
        accountWindowSec: 15 * 60,
        ipThreshold: 20,
        ipWindowSec: 60 * 60,
      });
      expect(result.locked).toBe(false);
    });
  });

  describe('bucket IP', () => {
    it('bloque si IP >= 20 et fenêtre active', () => {
      const ipBucket: LockoutBucket = {
        failureCount: 20,
        windowStartAt: new Date(NOW.getTime() - 30 * 60 * 1000), // -30 min, dans la fenêtre 1h
      };
      const result = shouldLockout({
        account: null,
        ip: ipBucket,
        now: NOW,
        accountThreshold: 5,
        accountWindowSec: 15 * 60,
        ipThreshold: 20,
        ipWindowSec: 60 * 60,
      });
      expect(result.locked).toBe(true);
      if (result.locked) {
        expect(result.reason).toBe('ip_threshold');
      }
    });

    it('ne bloque pas si fenêtre IP expirée', () => {
      const ipBucket: LockoutBucket = {
        failureCount: 100,
        windowStartAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000), // -2h
      };
      const result = shouldLockout({
        account: null,
        ip: ipBucket,
        now: NOW,
        accountThreshold: 5,
        accountWindowSec: 15 * 60,
        ipThreshold: 20,
        ipWindowSec: 60 * 60,
      });
      expect(result.locked).toBe(false);
    });
  });

  describe('combinaison account + IP', () => {
    it('bloque si compte >= 5 même si IP < 20', () => {
      const result = shouldLockout({
        account: { failureCount: 5, windowStartAt: new Date(NOW.getTime() - 60 * 1000) },
        ip: { failureCount: 3, windowStartAt: new Date(NOW.getTime() - 60 * 1000) },
        now: NOW,
        accountThreshold: 5,
        accountWindowSec: 15 * 60,
        ipThreshold: 20,
        ipWindowSec: 60 * 60,
      });
      expect(result.locked).toBe(true);
    });

    it('bloque si IP >= 20 même si compte < 5', () => {
      const result = shouldLockout({
        account: { failureCount: 2, windowStartAt: new Date(NOW.getTime() - 60 * 1000) },
        ip: { failureCount: 20, windowStartAt: new Date(NOW.getTime() - 60 * 1000) },
        now: NOW,
        accountThreshold: 5,
        accountWindowSec: 15 * 60,
        ipThreshold: 20,
        ipWindowSec: 60 * 60,
      });
      expect(result.locked).toBe(true);
    });

    it("retourne 'both' si les deux dépassent", () => {
      const result = shouldLockout({
        account: { failureCount: 5, windowStartAt: new Date(NOW.getTime() - 60 * 1000) },
        ip: { failureCount: 20, windowStartAt: new Date(NOW.getTime() - 60 * 1000) },
        now: NOW,
        accountThreshold: 5,
        accountWindowSec: 15 * 60,
        ipThreshold: 20,
        ipWindowSec: 60 * 60,
      });
      expect(result.locked).toBe(true);
      if (result.locked) {
        expect(result.reason).toBe('both');
      }
    });
  });

  describe('null buckets', () => {
    it('ne bloque pas si les deux buckets sont null', () => {
      const result = shouldLockout({
        account: null,
        ip: null,
        now: NOW,
        accountThreshold: 5,
        accountWindowSec: 15 * 60,
        ipThreshold: 20,
        ipWindowSec: 60 * 60,
      });
      expect(result.locked).toBe(false);
    });
  });

  describe('retryAfterSec', () => {
    it('compte le temps restant dans la fenêtre du bucket déclencheur', () => {
      const result = shouldLockout({
        account: { failureCount: 5, windowStartAt: new Date(NOW.getTime() - 5 * 60 * 1000) },
        ip: null,
        now: NOW,
        accountThreshold: 5,
        accountWindowSec: 15 * 60,
        ipThreshold: 20,
        ipWindowSec: 60 * 60,
      });
      if (result.locked) {
        // 15 min - 5 min = 10 min = 600 s
        expect(result.retryAfterSec).toBe(10 * 60);
      } else {
        throw new Error('Expected locked = true');
      }
    });
  });
});
