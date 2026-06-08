// T018 [US1] — ConseillerConversationController : endpoints conseiller du fil de
// conversation. Base `/api/matching/conseiller/conversations`. Consommé par 014.
//
// Sécurité (IX) : AuthGuard + RoleGuard('conseiller') ; autorisation membre-du-fil
// au niveau use case ; re-filtrage verified + état lead (012) dans SendMessage ;
// Idempotency-Key requis à l'envoi (X). Anti-marketplace : aucun champ montant.
//
// Le côté voyageur (auth via espace voyageur) relève de 015 — non livré ici.

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { AuthGuard } from '../../../identite/interface/auth.guard';
import { RequireRole, RoleGuard } from '../../../identite/interface/role.guard';
import {
  CONSEILLER_IDENTITY_RESOLVER,
  type ConseillerIdentityResolver,
  LEAD_READER,
  type LeadReader,
} from '../../application/ports';
import { ListConversationMessagesUseCase } from '../../application/use-cases/list-messages.use-case';
import { OpenConversationOnLeadAcceptedUseCase } from '../../application/use-cases/open-conversation-on-accept.use-case';
import { SendMessageUseCase } from '../../application/use-cases/send-message.use-case';
import { canWrite } from '../../domain/services/conversation-policy';

interface AuthenticatedReq {
  user?: { id: string };
}

const OpenBodySchema = z.object({ leadId: z.string().uuid() });
type OpenBody = z.infer<typeof OpenBodySchema>;

const SendBodySchema = z.object({ body: z.string().min(1).max(4000) });
type SendBody = z.infer<typeof SendBodySchema>;

interface MessageResponse {
  id: string;
  author: 'conseiller' | 'voyageur';
  body: string | null;
  createdAt: string;
}

@ApiTags('matching-conseiller-conversation')
@Controller('api/matching/conseiller/conversations')
@UseGuards(AuthGuard, RoleGuard)
@RequireRole('conseiller')
export class ConseillerConversationController {
  constructor(
    @Inject(OpenConversationOnLeadAcceptedUseCase)
    private readonly openConversation: OpenConversationOnLeadAcceptedUseCase,
    @Inject(SendMessageUseCase) private readonly sendMessage: SendMessageUseCase,
    @Inject(ListConversationMessagesUseCase)
    private readonly listMessages: ListConversationMessagesUseCase,
    @Inject(LEAD_READER) private readonly leadReader: LeadReader,
    @Inject(CONSEILLER_IDENTITY_RESOLVER)
    private readonly identityResolver: ConseillerIdentityResolver,
  ) {}

  @Post('open')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ouvre (idempotent) le fil d’un lead accepté' })
  async open(
    @Req() req: AuthenticatedReq,
    @Body(new ZodValidationPipe(OpenBodySchema)) dto: OpenBody,
  ): Promise<{ conversationId: string }> {
    const conseillerId = await this.requireConseillerId(req);
    const lead = await this.leadReader.findById(dto.leadId);
    if (!lead) throw new NotFoundException('Lead introuvable.');
    if (lead.conseillerId !== conseillerId) {
      throw new ForbiddenException('Ce lead ne vous appartient pas.');
    }
    // L'ouverture suppose un lead au moins accepté (canWrite vérifie l'état).
    if (!canWrite(lead.currentState, true)) {
      throw new ConflictException('Le lead n’est pas dans un état permettant la conversation.');
    }
    const res = await this.openConversation.execute({
      leadId: lead.id,
      conseillerId,
      briefId: lead.briefId,
      // 015 formalisera l'identité voyageur ; le brief identifie le voyageur (proxy MVP).
      voyageurRef: lead.briefId,
    });
    return { conversationId: res.conversationId };
  }

  @Get(':conversationId/messages')
  @ApiOperation({ summary: 'Messages d’un fil (pagination chronologique)' })
  async messages(
    @Req() req: AuthenticatedReq,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) conversationId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<{ items: MessageResponse[]; total: number }> {
    const conseillerId = await this.requireConseillerId(req);
    const pageNum = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
    const size = Math.min(100, Math.max(1, Number.parseInt(pageSize ?? '50', 10) || 50));
    const result = await this.listMessages.execute({
      conversationId,
      requester: 'conseiller',
      requesterRef: conseillerId,
      page: pageNum,
      pageSize: size,
    });
    if (result.kind === 'not_found') throw new NotFoundException('Fil introuvable.');
    if (result.kind === 'forbidden_not_member') throw new ForbiddenException('Accès refusé.');
    return {
      items: result.items.map((m) => ({
        id: m.id,
        author: m.author,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
      total: result.total,
    };
  }

  @Post(':conversationId/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Envoie un message (idempotent ; lecture seule si lead non éligible)' })
  async send(
    @Req() req: AuthenticatedReq,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' })) conversationId: string,
    @Body(new ZodValidationPipe(SendBodySchema)) dto: SendBody,
    @Headers('idempotency-key') idem?: string,
  ): Promise<{ messageId: string }> {
    const conseillerId = await this.requireConseillerId(req);
    if (!idem) throw new BadRequestException('En-tête Idempotency-Key requis.');
    const result = await this.sendMessage.execute({
      conversationId,
      sender: 'conseiller',
      senderRef: conseillerId,
      body: dto.body,
      idempotencyKey: idem,
    });
    switch (result.kind) {
      case 'sent':
      case 'duplicate':
        return { messageId: result.messageId };
      case 'not_found':
        throw new NotFoundException('Fil introuvable.');
      case 'forbidden_not_member':
        throw new ForbiddenException('Accès refusé.');
      case 'forbidden_unverified':
        throw new ForbiddenException('Votre statut vérifié ne permet pas l’envoi.');
      case 'read_only':
        throw new ConflictException('Le fil est en lecture seule (lead non éligible).');
      case 'invalid_message':
        throw new BadRequestException('Message invalide.');
    }
  }

  private async requireConseillerId(req: AuthenticatedReq): Promise<string> {
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException('Non authentifié.');
    const conseillerId = await this.identityResolver.resolveProfileIdByAuthUserId(userId);
    if (!conseillerId) throw new ForbiddenException('Profil conseiller introuvable.');
    return conseillerId;
  }
}
