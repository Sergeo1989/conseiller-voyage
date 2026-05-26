// T111 — PrismaAdminInvitationTokenRepository (US7).

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  AdminInvitationTokenRepository,
  AdminInvitationTokenRow,
  CreateAdminInvitationTokenInput,
} from '../application/ports/admin-invitation-token-repository.port';

@Injectable()
export class PrismaAdminInvitationTokenRepository implements AdminInvitationTokenRepository {
  async create(input: CreateAdminInvitationTokenInput): Promise<AdminInvitationTokenRow> {
    return prisma.adminInvitationToken.create({
      data: {
        targetEmail: input.targetEmail,
        inviterUserId: input.inviterUserId,
        jwtNonce: input.jwtNonce,
        expiresAt: input.expiresAt,
      },
      select: {
        id: true,
        targetEmail: true,
        inviterUserId: true,
        jwtNonce: true,
        expiresAt: true,
        consumedAt: true,
        createdAuthUserId: true,
      },
    });
  }

  async findByNonceUnconsumedNotExpired(
    nonce: string,
    now: Date,
  ): Promise<AdminInvitationTokenRow | null> {
    return prisma.adminInvitationToken.findFirst({
      where: { jwtNonce: nonce, consumedAt: null, expiresAt: { gt: now } },
      select: {
        id: true,
        targetEmail: true,
        inviterUserId: true,
        jwtNonce: true,
        expiresAt: true,
        consumedAt: true,
        createdAuthUserId: true,
      },
    });
  }

  async findActiveByTargetEmail(
    targetEmail: string,
    now: Date,
  ): Promise<AdminInvitationTokenRow | null> {
    return prisma.adminInvitationToken.findFirst({
      where: { targetEmail, consumedAt: null, expiresAt: { gt: now } },
      select: {
        id: true,
        targetEmail: true,
        inviterUserId: true,
        jwtNonce: true,
        expiresAt: true,
        consumedAt: true,
        createdAuthUserId: true,
      },
    });
  }

  async markConsumedWithAuthUser(tokenId: string, authUserId: string, now: Date): Promise<void> {
    await prisma.adminInvitationToken.update({
      where: { id: tokenId },
      data: { consumedAt: now, createdAuthUserId: authUserId },
    });
  }
}
