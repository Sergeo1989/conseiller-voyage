// T032 [US3] — PrismaConversationQueryAdapter : implémentation du port public
// `ConversationQueryPort` (lecture seule, consommé par 014/015). `writable` est
// dérivé à la lecture via `canWrite` (état du lead 012 + conseiller vérifié 001).
// Aucun champ transactionnel ; les pièces jointes n'exposent que des métadonnées
// (l'URL signée s'obtient via un endpoint dédié, durée limitée).
//
// Note perf : le calcul de `writable` interroge le lead + le statut vérifié par
// fil (N+1 sur les listes). Acceptable pour la taille d'un dashboard conseiller ;
// à optimiser (batch) si nécessaire — documenté dans le plan.

import { prisma } from '@cv/db';
import { CONFORMITE_QUERY_PORT, type ConformiteQueryPort } from '@cv/shared/conformite';
import type {
  ConversationListPage,
  ConversationMessagesPage,
  ConversationPaging,
  ConversationParticipant,
  ConversationQueryPort,
  ConversationView,
  MessageView,
} from '@cv/shared/matching';
import { Inject, Injectable } from '@nestjs/common';
import { LEAD_READER, type LeadReader } from '../application/ports';
import { canWrite } from '../domain/services/conversation-policy';

interface ConvRow {
  id: string;
  leadId: string;
  conseillerId: string;
  briefId: string | null;
  voyageurRef: string | null;
  openedAt: Date;
  lastMessageAt: Date | null;
}

const CONV_SELECT = {
  id: true,
  leadId: true,
  conseillerId: true,
  briefId: true,
  voyageurRef: true,
  openedAt: true,
  lastMessageAt: true,
} as const;

@Injectable()
export class PrismaConversationQueryAdapter implements ConversationQueryPort {
  constructor(
    @Inject(LEAD_READER) private readonly leadReader: LeadReader,
    @Inject(CONFORMITE_QUERY_PORT) private readonly conformiteQuery: ConformiteQueryPort,
  ) {}

  async listForConseiller(
    conseillerId: string,
    paging: ConversationPaging,
  ): Promise<ConversationListPage> {
    return this.listWhere({ conseillerId }, paging);
  }

  async listForVoyageur(
    voyageurRef: string,
    paging: ConversationPaging,
  ): Promise<ConversationListPage> {
    return this.listWhere({ voyageurRef }, paging);
  }

  async getMessages(
    conversationId: string,
    requester: ConversationParticipant,
    requesterRef: string,
    paging: ConversationPaging,
  ): Promise<ConversationMessagesPage | null> {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: CONV_SELECT,
    });
    if (!conv) return null;
    const isMember =
      requester === 'conseiller'
        ? conv.conseillerId === requesterRef
        : conv.voyageurRef === requesterRef;
    if (!isMember) return null;

    const { page, pageSize } = paging;
    const [rows, total] = await Promise.all([
      prisma.conversationMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          author: true,
          body: true,
          createdAt: true,
          attachments: {
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              sizeBytes: true,
              status: true,
              deletedAt: true,
            },
          },
        },
      }),
      prisma.conversationMessage.count({ where: { conversationId } }),
    ]);

    const items: MessageView[] = rows.map((m) => ({
      id: m.id,
      author: m.author as ConversationParticipant,
      body: m.body,
      createdAt: m.createdAt,
      attachments: m.attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        available: a.deletedAt === null && a.status === 'ready',
      })),
    }));

    return { conversation: await this.toView(conv), items, page, pageSize, total };
  }

  private async listWhere(
    where: { conseillerId: string } | { voyageurRef: string },
    paging: ConversationPaging,
  ): Promise<ConversationListPage> {
    const { page, pageSize } = paging;
    const [rows, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: CONV_SELECT,
      }),
      prisma.conversation.count({ where }),
    ]);
    const items = await Promise.all(rows.map((r) => this.toView(r)));
    return { items, page, pageSize, total };
  }

  private async toView(c: ConvRow): Promise<ConversationView> {
    const lead = await this.leadReader.findById(c.leadId);
    let writable = false;
    if (lead) {
      const status = await this.conformiteQuery.getVerificationStatus({
        conseillerId: c.conseillerId,
      });
      writable = canWrite(lead.currentState, status.verified);
    }
    return {
      id: c.id,
      leadId: c.leadId,
      conseillerId: c.conseillerId,
      briefId: c.briefId,
      writable,
      openedAt: c.openedAt,
      lastMessageAt: c.lastMessageAt,
    };
  }
}
