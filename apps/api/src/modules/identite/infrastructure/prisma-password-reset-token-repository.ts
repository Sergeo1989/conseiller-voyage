// T091/T092 infra — PrismaPasswordResetTokenRepository (US5).

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  CreatePasswordResetTokenInput,
  PasswordResetTokenRepository,
  PasswordResetTokenRow,
} from '../application/ports/password-reset-token-repository.port';

@Injectable()
export class PrismaPasswordResetTokenRepository implements PasswordResetTokenRepository {
  async create(input: CreatePasswordResetTokenInput): Promise<PasswordResetTokenRow> {
    return prisma.passwordResetToken.create({
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
        invalidatedAt: true,
      },
    });
  }

  async findByNonceActive(nonce: string, now: Date): Promise<PasswordResetTokenRow | null> {
    return prisma.passwordResetToken.findFirst({
      where: {
        jwtNonce: nonce,
        consumedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        userId: true,
        jwtNonce: true,
        expiresAt: true,
        consumedAt: true,
        invalidatedAt: true,
      },
    });
  }

  async countActiveByUserId(userId: string, now: Date): Promise<number> {
    return prisma.passwordResetToken.count({
      where: {
        userId,
        consumedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: now },
      },
    });
  }

  async consumeAndInvalidateOthers(tokenId: string, userId: string, now: Date): Promise<void> {
    await prisma.$transaction([
      prisma.passwordResetToken.update({
        where: { id: tokenId },
        data: { consumedAt: now },
      }),
      prisma.passwordResetToken.updateMany({
        where: {
          userId,
          id: { not: tokenId },
          consumedAt: null,
          invalidatedAt: null,
        },
        data: { invalidatedAt: now },
      }),
    ]);
  }
}
