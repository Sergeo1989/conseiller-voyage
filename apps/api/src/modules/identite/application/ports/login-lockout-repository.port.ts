// T038 — Port repository du double bucket de lockout login (feature 002 / R4).
//
// Pattern atomique INSERT ON CONFLICT DO UPDATE (réutilisation 002a P0-2).
// Réutilisable pour d'autres buckets futurs (signup_ip, email_resend, etc.).

export type LockoutBucketKind = 'login_account' | 'login_ip';

export interface LockoutBucketSnapshot {
  readonly failureCount: number;
  readonly windowStartAt: Date;
}

export interface LoginLockoutRepository {
  /**
   * Incrémente atomiquement le bucket (ou réinitialise si la fenêtre
   * a expiré). Retourne le snapshot post-incrément.
   *
   * Pour kind='login_account' : `accountId` requis, `ipHash` null.
   * Pour kind='login_ip'      : `accountId` null, `ipHash` requis.
   */
  incrementAtomic(input: {
    readonly kind: LockoutBucketKind;
    readonly accountId: string | null;
    readonly ipHash: Buffer | null;
    readonly windowSec: number;
    readonly now: Date;
  }): Promise<LockoutBucketSnapshot>;

  /**
   * Lit le snapshot courant sans incrémenter.
   */
  read(input: {
    readonly kind: LockoutBucketKind;
    readonly accountId: string | null;
    readonly ipHash: Buffer | null;
  }): Promise<LockoutBucketSnapshot | null>;

  /**
   * Supprime un bucket (e.g., login success → reset compteur compte).
   */
  reset(input: {
    readonly kind: LockoutBucketKind;
    readonly accountId: string | null;
    readonly ipHash: Buffer | null;
  }): Promise<void>;
}

export const LOGIN_LOCKOUT_REPOSITORY = Symbol.for('LoginLockoutRepository');
