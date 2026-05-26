// T052 — SignupConseillerUseCase (US1 P1 MVP).
//
// Crée un compte conseiller en self-service :
//   1. Normalise l'email (R9), valide la politique mot de passe (R3/C2).
//   2. Lookup symétrique JOIN unifié (R5/C6) sur auth_users + auth_accounts.
//   3. Si compte existe : ne crée rien, applique un dummy bcrypt pour
//      chronométrage constant, INSERT audit `signup` avec metadata.duplicate_attempt.
//   4. Si compte n'existe pas : INSERT user + account + token + outbox + audit
//      dans une seule prisma.$transaction.
//
// Anti-énumération (R5) :
//   - Retour HTTP identique dans les deux cas (le controller produit 202).
//   - Chronométrage constant via DUMMY_HASH.

import {
  DUMMY_HASH,
  normalizeEmail,
  prehashAndHash,
  validatePasswordPolicy,
  verifyPrehashed,
} from '@cv/auth-domain';
import { prisma } from '@cv/db';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AUTH_AUDIT_WRITER, type AuthAuditWriter } from '../ports/auth-audit-writer.port';
import {
  CREDENTIAL_ACCOUNT_REPOSITORY,
  type CredentialAccountRepository,
} from '../ports/credential-account-repository.port';
import { TOKEN_ISSUER, type TokenIssuer } from '../ports/token-issuer.port';

export interface SignupConseillerInput {
  readonly emailRaw: string;
  readonly password: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly acceptedTerms: boolean;
  readonly acceptedPrivacyPolicy: boolean;
  readonly actorIp?: string;
}

export interface SignupConseillerResult {
  /** Indistinguable entre "compte créé" et "compte existait déjà" pour anti-énumération. */
  readonly status: 'ok';
}

const EMAIL_VERIFICATION_TTL_SEC = 24 * 60 * 60; // 24 h

@Injectable()
export class SignupConseillerUseCase {
  constructor(
    @Inject(CREDENTIAL_ACCOUNT_REPOSITORY)
    private readonly accounts: CredentialAccountRepository,
    @Inject(TOKEN_ISSUER) private readonly tokenIssuer: TokenIssuer,
    @Inject(AUTH_AUDIT_WRITER) private readonly audit: AuthAuditWriter,
    // Note : EmailVerificationTokenRepository et AuthOutboxWriter ne sont
    // pas injectés ici car la transaction inlines `prisma.$transaction`
    // pour atomicité (pattern 002a use cases). Ils sont utilisés par
    // d'autres use cases (verify-email, resend-verification, etc.).
  ) {}

  async execute(input: SignupConseillerInput): Promise<SignupConseillerResult> {
    // 1. Acceptation CGU + Loi 25 obligatoires (FR-001).
    if (!input.acceptedTerms || !input.acceptedPrivacyPolicy) {
      throw new BadRequestException({ code: 'TERMS_NOT_ACCEPTED' });
    }

    // 2. Validation politique mot de passe (FR-003 / C2).
    const email = normalizeEmail(input.emailRaw);
    const policy = validatePasswordPolicy(input.password, email, input.firstName);
    if (!policy.ok) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', errors: policy.errors });
    }

    // 3. Lookup symétrique (R5/C6) — une seule fonction couvre les 2 cas.
    const existing = await this.accounts.findByEmail(email);

    if (existing) {
      return this.handleDuplicate(input, email, existing.userId);
    }
    return this.handleNewSignup(input, email);
  }

  private async handleDuplicate(
    input: SignupConseillerInput,
    email: string,
    existingUserId: string,
  ): Promise<SignupConseillerResult> {
    // Chronométrage constant — bcrypt sur DUMMY_HASH (~400ms cf. R3).
    await verifyPrehashed(input.password, DUMMY_HASH);

    // Audit "signup" avec metadata.duplicate_attempt pour traçabilité.
    await this.audit.append({
      eventType: 'signup',
      targetUserId: existingUserId,
      targetEmail: email,
      actorIp: input.actorIp ?? null,
      metadata: { duplicate_attempt: true },
    });

    return { status: 'ok' };
  }

  private async handleNewSignup(
    input: SignupConseillerInput,
    email: string,
  ): Promise<SignupConseillerResult> {
    const passwordHash = await prehashAndHash(input.password);
    const now = new Date();

    // Pré-allocation de l'UUID côté app pour pouvoir signer le JWT avec
    // le bon userId AVANT l'INSERT — évite un double-issue.
    const newUserId = crypto.randomUUID();
    const issued = await this.tokenIssuer.issue({
      purpose: 'email_verification',
      userId: newUserId,
      ttlSec: EMAIL_VERIFICATION_TTL_SEC,
      now,
    });

    await prisma.$transaction(async (tx) => {
      await tx.authUser.create({
        data: {
          id: newUserId,
          email,
          emailVerified: null,
          role: 'conseiller',
          name: `${input.firstName} ${input.lastName}`,
        },
      });
      await tx.authAccount.create({
        data: {
          userId: newUserId,
          type: 'credentials',
          provider: 'credentials',
          providerAccountId: email,
          password_hash: passwordHash,
        },
      });
      await tx.emailVerificationToken.create({
        data: {
          userId: newUserId,
          jwtNonce: issued.nonce,
          expiresAt: issued.expiresAt,
        },
      });
      await tx.authOutboxEmail.create({
        data: {
          recipientUserId: newUserId,
          recipientEmail: email,
          templateKind: 'email_verification',
          payload: {
            firstName: input.firstName,
            token: issued.token,
            expiresAt: issued.expiresAt.toISOString(),
          },
        },
      });
    });

    await this.audit.append({
      eventType: 'signup',
      targetUserId: newUserId,
      targetEmail: email,
      actorIp: input.actorIp ?? null,
      metadata: {
        firstName: input.firstName,
        // duplicate_attempt absent = c'est un vrai signup
      },
    });

    return { status: 'ok' };
  }
}
