// T067 — LoginUseCase (US2 P1 MVP).
//
// Vérifie email + password. Pose le double bucket de lockout (account
// + IP). Décide du redirect post-login (verified MFA, verified non-MFA,
// admin J1, email non-vérifié).
//
// Anti-énumération (R5/C6) :
//   - Lookup unifié SELECT auth_users LEFT JOIN auth_accounts (un seul
//     roundtrip).
//   - bcrypt.compare TOUJOURS appelé (real ou DUMMY_HASH) pour
//     chronométrage constant.
//   - Réponses identiques pour USER_NOT_FOUND / INVALID_PASSWORD.

import { createHash } from 'node:crypto';
import { DUMMY_HASH, shouldLockout, verifyPrehashed } from '@cv/auth-domain';
import { prisma } from '@cv/db';
import { Inject, Injectable } from '@nestjs/common';
import { AUTH_AUDIT_WRITER, type AuthAuditWriter } from '../ports/auth-audit-writer.port';
import {
  CREDENTIAL_ACCOUNT_REPOSITORY,
  type CredentialAccountRepository,
} from '../ports/credential-account-repository.port';
import {
  LOGIN_LOCKOUT_REPOSITORY,
  type LoginLockoutRepository,
} from '../ports/login-lockout-repository.port';

export interface LoginInput {
  readonly emailRaw: string;
  readonly password: string;
  readonly actorIp?: string;
}

export type LoginResult =
  | {
      readonly kind: 'ok';
      readonly userId: string;
      readonly role: 'voyageur' | 'conseiller' | 'admin';
      readonly redirect: LoginRedirect;
    }
  | {
      readonly kind: 'invalid_credentials';
    }
  | {
      readonly kind: 'locked';
      readonly reason: 'account_threshold' | 'ip_threshold' | 'both';
      readonly retryAfterSec: number;
    };

export type LoginRedirect =
  | '/conseiller' // verified + MFA actif déjà vérifié (cookie session)
  | '/admin'
  | '/mfa/verify' // MFA actif → step-up requis
  | '/mfa/enroll' // conseiller verified sans MFA
  | '/admin/mfa/enroll' // admin J1 sans MFA
  | '/verifier-email'; // emailVerified IS NULL

const ACCOUNT_THRESHOLD = 5;
const ACCOUNT_WINDOW_SEC = 15 * 60;
const IP_THRESHOLD = 20;
const IP_WINDOW_SEC = 60 * 60;

function hashIp(ip: string | undefined): Buffer | null {
  if (!ip) return null;
  return createHash('sha256').update(ip, 'utf8').digest();
}

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(CREDENTIAL_ACCOUNT_REPOSITORY)
    private readonly accounts: CredentialAccountRepository,
    @Inject(LOGIN_LOCKOUT_REPOSITORY)
    private readonly lockouts: LoginLockoutRepository,
    @Inject(AUTH_AUDIT_WRITER) private readonly audit: AuthAuditWriter,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const { normalizeEmail } = await import('@cv/auth-domain');
    const email = normalizeEmail(input.emailRaw);
    const ipHash = hashIp(input.actorIp);
    const now = new Date();

    // 1. Vérif lockout AVANT le bcrypt (économise le cost) — lecture seule.
    const accountSnapshot = await this.readAccountBucketByEmail(email);
    const ipSnapshot = ipHash
      ? await this.lockouts.read({ kind: 'login_ip', accountId: null, ipHash })
      : null;
    const lockoutPre = shouldLockout({
      account: accountSnapshot,
      ip: ipSnapshot,
      now,
      accountThreshold: ACCOUNT_THRESHOLD,
      accountWindowSec: ACCOUNT_WINDOW_SEC,
      ipThreshold: IP_THRESHOLD,
      ipWindowSec: IP_WINDOW_SEC,
    });
    if (lockoutPre.locked) {
      await this.audit.append({
        eventType: 'login_locked',
        targetEmail: email,
        actorIp: input.actorIp ?? null,
        metadata: { reason: lockoutPre.reason },
      });
      return {
        kind: 'locked',
        reason: lockoutPre.reason,
        retryAfterSec: lockoutPre.retryAfterSec,
      };
    }

    // 2. Lookup unifié + bcrypt constant (R5/C6).
    const account = await this.accounts.findByEmail(email);
    const passwordOk = await verifyPrehashed(input.password, account?.passwordHash ?? DUMMY_HASH);

    if (!account || !passwordOk) {
      await this.recordFailure(email, account?.userId ?? null, ipHash, input.actorIp);
      return { kind: 'invalid_credentials' };
    }

    // 3. Succès — reset bucket account, audit, calcul redirect.
    await this.lockouts.reset({
      kind: 'login_account',
      accountId: account.userId,
      ipHash: null,
    });

    const redirect = await this.computeRedirect(account);

    await this.audit.append({
      eventType: 'login_success',
      targetUserId: account.userId,
      targetEmail: email,
      actorIp: input.actorIp ?? null,
      metadata: { redirect },
    });

    return {
      kind: 'ok',
      userId: account.userId,
      role: account.role,
      redirect,
    };
  }

  private async readAccountBucketByEmail(
    email: string,
  ): Promise<{ failureCount: number; windowStartAt: Date } | null> {
    // On lit l'accountId via le repo (lookup symétrique) puis le bucket.
    const account = await this.accounts.findByEmail(email);
    if (!account) return null;
    return this.lockouts.read({
      kind: 'login_account',
      accountId: account.userId,
      ipHash: null,
    });
  }

  private async recordFailure(
    email: string,
    userId: string | null,
    ipHash: Buffer | null,
    actorIp: string | undefined,
  ): Promise<void> {
    const now = new Date();
    // Incrément bucket account (si userId connu).
    if (userId) {
      await this.lockouts.incrementAtomic({
        kind: 'login_account',
        accountId: userId,
        ipHash: null,
        windowSec: ACCOUNT_WINDOW_SEC,
        now,
      });
    }
    // Incrément bucket IP (si actorIp connu).
    if (ipHash) {
      await this.lockouts.incrementAtomic({
        kind: 'login_ip',
        accountId: null,
        ipHash,
        windowSec: IP_WINDOW_SEC,
        now,
      });
    }
    await this.audit.append({
      eventType: 'login_failed',
      targetUserId: userId,
      targetEmail: email,
      actorIp: actorIp ?? null,
      metadata: { reason: userId ? 'INVALID_PASSWORD' : 'UNKNOWN_USER' },
    });
  }

  /**
   * Calcule la cible de redirection post-login. Lecture du statut MFA
   * (002a) et du statut conformité (001) via accès direct Prisma —
   * acceptable car identite + conformite sont dans le même domaine.
   */
  private async computeRedirect(account: {
    readonly userId: string;
    readonly role: 'voyageur' | 'conseiller' | 'admin';
    readonly emailVerifiedAt: Date | null;
  }): Promise<LoginRedirect> {
    if (!account.emailVerifiedAt) return '/verifier-email';

    const mfa = await prisma.mfaSecret.findFirst({
      where: { userId: account.userId, enabledAt: { not: null } },
      select: { id: true },
    });

    // Si MFA actif → step-up requis avant accès complet.
    if (mfa) return '/mfa/verify';

    // Pas de MFA actif :
    if (account.role === 'admin') return '/admin/mfa/enroll'; // J1 forcé
    if (account.role === 'conseiller') {
      // Vérifier statut conformité = verified ⇒ MFA enroll forcé (FR-010).
      // Lecture directe ConseillerCompliance (feature 001) — accès intra-domaine
      // identité × conformité documenté dans le module-boundaries tool.
      const compliance = await prisma.conseillerCompliance.findUnique({
        where: { conseillerId: account.userId },
        select: { status: true },
      });
      if (compliance?.status === 'verified') return '/mfa/enroll';
    }
    return '/conseiller';
  }
}
