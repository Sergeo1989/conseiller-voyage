// T047 — PrismaEmailVerificationTokenRepository (feature 002 US1/US3).

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  CreateEmailVerificationTokenInput,
  EmailVerificationTokenRepository,
  EmailVerificationTokenRow,
} from '../application/ports/email-verification-token-repository.port';

@Injectable()
export class PrismaEmailVerificationTokenRepository implements EmailVerificationTokenRepository {
  async create(input: CreateEmailVerificationTokenInput): Promise<EmailVerificationTokenRow> {
    const row = await prisma.emailVerificationToken.create({
      data: {
        userId: input.userId,
        jwtNonce: input.jwtNonce,
        expiresAt: input.expiresAt,
      },
      select: {
        id: true,
        userId: true,
        jwtNonce: true,
        expiresAt: true,
        consumedAt: true,
      },
    });
    return row;
  }

  async findByNonceUnconsumedNotExpired(
    nonce: string,
    now: Date,
  ): Promise<EmailVerificationTokenRow | null> {
    return prisma.emailVerificationToken.findFirst({
      where: {
        jwtNonce: nonce,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        userId: true,
        jwtNonce: true,
        expiresAt: true,
        consumedAt: true,
      },
    });
  }

  async markConsumed(id: string, now: Date): Promise<void> {
    await prisma.emailVerificationToken.update({
      where: { id },
      data: { consumedAt: now },
    });
  }

  async countActiveByUserId(userId: string, now: Date): Promise<number> {
    return prisma.emailVerificationToken.count({
      where: {
        userId,
        consumedAt: null,
        expiresAt: { gt: now },
      },
    });
  }
}
