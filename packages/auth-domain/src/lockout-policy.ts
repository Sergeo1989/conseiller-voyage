// T024 — shouldLockout (FR-009 / R4).
//
// Double bucket :
//   account : 5 échecs / 15 min / userId
//   ip      : 20 échecs / 1 h / IP
// Le déclenchement de l'un OU l'autre suffit à bloquer.

export interface LockoutBucket {
  readonly failureCount: number;
  readonly windowStartAt: Date;
}

export interface ShouldLockoutInput {
  readonly account: LockoutBucket | null;
  readonly ip: LockoutBucket | null;
  readonly now: Date;
  readonly accountThreshold: number;
  readonly accountWindowSec: number;
  readonly ipThreshold: number;
  readonly ipWindowSec: number;
}

export type LockoutReason = 'account_threshold' | 'ip_threshold' | 'both';

export type ShouldLockoutResult =
  | { readonly locked: false }
  | {
      readonly locked: true;
      readonly reason: LockoutReason;
      readonly retryAfterSec: number;
    };

function bucketIsActive(bucket: LockoutBucket, now: Date, windowSec: number): boolean {
  const ageMs = now.getTime() - bucket.windowStartAt.getTime();
  return ageMs < windowSec * 1000;
}

function remainingSec(bucket: LockoutBucket, now: Date, windowSec: number): number {
  const endsAtMs = bucket.windowStartAt.getTime() + windowSec * 1000;
  const remainingMs = endsAtMs - now.getTime();
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export function shouldLockout(input: ShouldLockoutInput): ShouldLockoutResult {
  const accountLocked =
    input.account !== null &&
    bucketIsActive(input.account, input.now, input.accountWindowSec) &&
    input.account.failureCount >= input.accountThreshold;

  const ipLocked =
    input.ip !== null &&
    bucketIsActive(input.ip, input.now, input.ipWindowSec) &&
    input.ip.failureCount >= input.ipThreshold;

  if (!accountLocked && !ipLocked) {
    return { locked: false };
  }

  if (accountLocked && ipLocked) {
    // input.account et input.ip sont garantis non-null par accountLocked + ipLocked.
    const accountRemaining = remainingSec(
      input.account as LockoutBucket,
      input.now,
      input.accountWindowSec,
    );
    const ipRemaining = remainingSec(input.ip as LockoutBucket, input.now, input.ipWindowSec);
    return {
      locked: true,
      reason: 'both',
      retryAfterSec: Math.max(accountRemaining, ipRemaining),
    };
  }

  if (accountLocked) {
    return {
      locked: true,
      reason: 'account_threshold',
      retryAfterSec: remainingSec(
        input.account as LockoutBucket,
        input.now,
        input.accountWindowSec,
      ),
    };
  }

  return {
    locked: true,
    reason: 'ip_threshold',
    retryAfterSec: remainingSec(input.ip as LockoutBucket, input.now, input.ipWindowSec),
  };
}
