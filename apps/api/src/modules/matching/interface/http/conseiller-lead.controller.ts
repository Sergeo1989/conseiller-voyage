// T041 [US2] — ConseillerLeadController : endpoints conseiller du cycle de vie
// du lead. Base `/api/matching/conseiller`. Consommé par 014 (dashboard).
//
// Sécurité (Principe IX) :
//   - AuthGuard + RoleGuard @RequireRole('conseiller')
//   - Autorisation propriétaire au niveau use case (un conseiller n'agit que
//     sur SES leads) — l'AuthUser.id de la session est résolu en
//     ConseillerProfile.id (= conseillerId matching).
//   - Re-check verified à chaque action (FR-008, dans le use case).
//   - En-tête Idempotency-Key requis sur les actions (Principe X).
//   - Réponses d'erreur FR-CA (i18n `matching.lead.*`).

import type { LeadState } from '@cv/shared/matching';
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
  UnprocessableEntityException,
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
  LEAD_BRIEF_SUMMARY_READER,
  LEAD_READER,
  type LeadBriefSummaryReader,
  type LeadReader,
  type LeadWithHistory,
} from '../../application/ports';
import {
  type ConseillerLeadAction,
  RecordLeadTransitionUseCase,
} from '../../application/use-cases/record-lead-transition.use-case';
import { ViewLeadUseCase } from '../../application/use-cases/view-lead.use-case';

interface AuthenticatedReq {
  user?: { id: string };
}

const ReasonBodySchema = z.object({ reason: z.string().max(500).optional() });
type ReasonBody = z.infer<typeof ReasonBodySchema>;

interface LeadViewResponse {
  id: string;
  matchingResultId: string;
  position: 1 | 2 | 3;
  currentState: LeadState;
  scoreFinal: number | null;
  boosted: boolean;
  createdAt: string;
  updatedAt: string;
  brief: { destinations: string[]; periodeApprox: string; typeProjet: string } | null;
  history: Array<{
    fromState: LeadState | null;
    toState: LeadState;
    actor: 'conseiller' | 'systeme';
    occurredAt: string;
  }>;
}

@ApiTags('matching-conseiller')
@Controller('api/matching/conseiller')
@UseGuards(AuthGuard, RoleGuard)
@RequireRole('conseiller')
export class ConseillerLeadController {
  constructor(
    @Inject(RecordLeadTransitionUseCase)
    private readonly recordTransition: RecordLeadTransitionUseCase,
    @Inject(ViewLeadUseCase) private readonly viewLead: ViewLeadUseCase,
    @Inject(LEAD_READER) private readonly leadReader: LeadReader,
    @Inject(LEAD_BRIEF_SUMMARY_READER)
    private readonly briefSummaryReader: LeadBriefSummaryReader,
    @Inject(CONSEILLER_IDENTITY_RESOLVER)
    private readonly identityResolver: ConseillerIdentityResolver,
  ) {}

  @Get('leads')
  @ApiOperation({ summary: 'Liste paginée des leads du conseiller (dashboard 014)' })
  async list(
    @Req() req: AuthenticatedReq,
    @Query('state') state?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<{ items: LeadViewResponse[]; page: number; pageSize: number; total: number }> {
    const conseillerId = await this.requireConseillerId(req);
    const pageNum = Math.max(1, Number.parseInt(page ?? '1', 10) || 1);
    const size = Math.min(100, Math.max(1, Number.parseInt(pageSize ?? '20', 10) || 20));
    const result = await this.leadReader.listByConseiller({
      conseillerId,
      ...(state ? { state: state as LeadState } : {}),
      page: pageNum,
      pageSize: size,
    });
    const items = await Promise.all(result.items.map((l) => this.toView(l)));
    return { items, page: pageNum, pageSize: size, total: result.total };
  }

  @Get('leads/:leadId')
  @ApiOperation({ summary: 'Détail d’un lead (auto-vu à la 1re consultation, FR-019)' })
  async detail(
    @Req() req: AuthenticatedReq,
    @Param('leadId', new ParseUUIDPipe({ version: '4' })) leadId: string,
  ): Promise<LeadViewResponse> {
    const conseillerId = await this.requireConseillerId(req);
    const result = await this.viewLead.execute({ leadId, conseillerId });
    if (result.kind === 'not_found') throw this.notFound();
    if (result.kind === 'forbidden_not_owner') throw this.forbiddenOwner();
    return this.toView(result.lead);
  }

  @Post('leads/:leadId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transition vu → accepte' })
  accept(
    @Req() req: AuthenticatedReq,
    @Param('leadId', new ParseUUIDPipe({ version: '4' })) leadId: string,
    @Headers('idempotency-key') idem?: string,
  ): Promise<LeadViewResponse> {
    return this.transition(req, leadId, 'accepter', null, idem);
  }

  @Post('leads/:leadId/refuse')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transition vu → refuse (terminal)' })
  refuse(
    @Req() req: AuthenticatedReq,
    @Param('leadId', new ParseUUIDPipe({ version: '4' })) leadId: string,
    @Body(new ZodValidationPipe(ReasonBodySchema)) body: ReasonBody,
    @Headers('idempotency-key') idem?: string,
  ): Promise<LeadViewResponse> {
    return this.transition(req, leadId, 'refuser', body.reason ?? null, idem);
  }

  @Post('leads/:leadId/quote-sent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transition accepte → devis_envoye (marqueur déclaratif, FR-013)' })
  quoteSent(
    @Req() req: AuthenticatedReq,
    @Param('leadId', new ParseUUIDPipe({ version: '4' })) leadId: string,
    @Headers('idempotency-key') idem?: string,
  ): Promise<LeadViewResponse> {
    return this.transition(req, leadId, 'marquer_devis_envoye', null, idem);
  }

  @Post('leads/:leadId/booking-confirmed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Transition devis_envoye → reservation_confirmee (n’affecte pas les frères, FR-016)',
  })
  bookingConfirmed(
    @Req() req: AuthenticatedReq,
    @Param('leadId', new ParseUUIDPipe({ version: '4' })) leadId: string,
    @Headers('idempotency-key') idem?: string,
  ): Promise<LeadViewResponse> {
    return this.transition(req, leadId, 'marquer_reservation_confirmee', null, idem);
  }

  @Post('leads/:leadId/lost')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transition * (non terminal) → perdu (terminal)' })
  lost(
    @Req() req: AuthenticatedReq,
    @Param('leadId', new ParseUUIDPipe({ version: '4' })) leadId: string,
    @Body(new ZodValidationPipe(ReasonBodySchema)) body: ReasonBody,
    @Headers('idempotency-key') idem?: string,
  ): Promise<LeadViewResponse> {
    return this.transition(req, leadId, 'marquer_perdu', body.reason ?? null, idem);
  }

  // ------------------------------------------------------------------- privé

  private async transition(
    req: AuthenticatedReq,
    leadId: string,
    action: ConseillerLeadAction,
    reason: string | null,
    idempotencyKey?: string,
  ): Promise<LeadViewResponse> {
    if (!idempotencyKey) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'L’en-tête Idempotency-Key est requis pour cette action.',
      });
    }
    const conseillerId = await this.requireConseillerId(req);
    const result = await this.recordTransition.execute({ leadId, conseillerId, action, reason });

    switch (result.kind) {
      case 'not_found':
        throw this.notFound();
      case 'forbidden_not_owner':
        throw this.forbiddenOwner();
      case 'forbidden_unverified':
        throw new ForbiddenException({
          code: 'CONSEILLER_NOT_VERIFIED',
          message: 'Votre statut vérifié est requis pour agir sur ce lead.',
        });
      case 'invalid_transition':
        throw new UnprocessableEntityException({
          code: 'INVALID_TRANSITION',
          message: 'Cette action n’est pas autorisée depuis l’état actuel du lead.',
        });
      case 'conflict':
        throw new ConflictException({
          code: 'LEAD_STATE_CONFLICT',
          message: 'L’état du lead a changé. Rechargez puis réessayez.',
        });
      default: {
        const lead = await this.leadReader.findById(leadId);
        if (!lead) throw this.notFound();
        return this.toView(lead);
      }
    }
  }

  private async requireConseillerId(req: AuthenticatedReq): Promise<string> {
    const authUserId = req.user?.id;
    if (!authUserId) throw new ForbiddenException({ code: 'UNAUTHENTICATED' });
    const conseillerId = await this.identityResolver.resolveProfileIdByAuthUserId(authUserId);
    if (!conseillerId) {
      throw new ForbiddenException({
        code: 'CONSEILLER_PROFILE_NOT_FOUND',
        message: 'Aucun profil conseiller associé à ce compte.',
      });
    }
    return conseillerId;
  }

  private async toView(lead: LeadWithHistory): Promise<LeadViewResponse> {
    const brief = lead.briefId ? await this.briefSummaryReader.getSummary(lead.briefId) : null;
    return {
      id: lead.id,
      matchingResultId: lead.matchingResultId,
      position: lead.matchingResultEntryPosition,
      currentState: lead.currentState,
      scoreFinal: lead.scoreFinal,
      boosted: lead.boosted,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
      brief: brief
        ? {
            destinations: [...brief.destinations],
            periodeApprox: brief.periodeApprox,
            typeProjet: brief.typeProjet,
          }
        : null,
      history: lead.history.map((h) => ({
        fromState: h.fromState,
        toState: h.toState,
        actor: h.actor,
        occurredAt: h.occurredAt.toISOString(),
      })),
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ code: 'LEAD_NOT_FOUND', message: 'Lead introuvable.' });
  }

  private forbiddenOwner(): ForbiddenException {
    return new ForbiddenException({
      code: 'LEAD_NOT_OWNER',
      message: 'Ce lead n’appartient pas à votre compte.',
    });
  }
}
