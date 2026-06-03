// T056 — VoyageurIntakeController (public voyageur, pas d'AuthGuard).
//
// Routes :
//   POST /api/intake/briefs           → soumission brief (FR-001 à FR-013)
//   POST /api/intake/briefs/verify    → consommation magic link (FR-014)
//
// Garanties transversales déjà appliquées globalement (AppModule) :
//   - CsrfProtectionMiddleware : header X-Requested-By obligatoire
//   - IdempotencyInterceptor : Idempotency-Key respecté sur POST
//   - ThrottlerGuard global 100req/min/IP (intake en plus a sa propre
//     limite anti-spam serrée via IntakeRateLimiter T051)
//   - RollingSessionCookieInterceptor (T025d, scoped IntakeModule) : pose
//     le cookie session voyageur post-verify et le renouvelle FR-014a Q5
//
// Cf. specs/002-voyageur-intake/contracts/http-endpoints.md §1.

import {
  type BriefSummary,
  ErasureRequestAllSchema,
  ErasureRequestBriefSchema,
  ResendMagicLinkSchema,
  type SubmitBriefPayload,
  SubmitBriefSchema,
  type VerifyMagicLinkPayload,
  VerifyMagicLinkSchema,
  type VoyageurBriefId,
  type VoyageurContactId,
} from '@cv/shared/intake';
import {
  Body,
  Controller,
  Get,
  GoneException,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Ip,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { verifyCvSuggestedCookie } from '../../../../common/cv-suggested-cookie.verifier';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { env } from '../../../../env';
import { EraseAllVoyageurDataUseCase } from '../../application/use-cases/erase-all-voyageur-data.use-case';
import { ListBriefsByEmailUseCase } from '../../application/use-cases/list-briefs-by-email.use-case';
import { RequestBriefErasureUseCase } from '../../application/use-cases/request-brief-erasure.use-case';
import { ResendMagicLinkUseCase } from '../../application/use-cases/resend-magic-link.use-case';
import { SubmitBriefUseCase } from '../../application/use-cases/submit-brief.use-case';
import { VerifyMagicLinkUseCase } from '../../application/use-cases/verify-magic-link.use-case';
import { ViewBriefStatusUseCase } from '../../application/use-cases/view-brief-status.use-case';
import { IntakeAuthGuard } from './intake-auth.guard';
import { SkipRollingRenewal } from './skip-rolling-renewal.decorator';

const PROD_COOKIE_NAME = '__Host-cv.intake.token';
const DEV_COOKIE_NAME = 'cv.intake.session';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface SubmitBriefResponse {
  briefId: string;
  status: 'pending_verification';
  emailSent: boolean;
}

interface VerifyMagicLinkResponse {
  briefId: string;
  status: 'active';
  expiresAt: string;
}

interface RateLimitErrorBody {
  code: 'EMAIL_RATE_LIMIT_EXCEEDED' | 'RATE_LIMIT_EXCEEDED';
  message: string;
  retryAfter?: number;
}

interface DisposableErrorBody {
  code: 'DISPOSABLE_EMAIL_DETECTED';
  message: string;
}

interface IntakeContextRequest {
  intakeContext?: { contactId: string; briefId: string };
}

@ApiTags('intake')
@Controller('api/intake')
export class VoyageurIntakeController {
  constructor(
    @Inject(SubmitBriefUseCase) private readonly submitBrief: SubmitBriefUseCase,
    @Inject(VerifyMagicLinkUseCase) private readonly verifyMagicLink: VerifyMagicLinkUseCase,
    @Inject(ViewBriefStatusUseCase) private readonly viewBriefStatus: ViewBriefStatusUseCase,
    @Inject(ListBriefsByEmailUseCase) private readonly listBriefsByEmail: ListBriefsByEmailUseCase,
    @Inject(ResendMagicLinkUseCase) private readonly resendMagicLinkUseCase: ResendMagicLinkUseCase,
    @Inject(RequestBriefErasureUseCase)
    private readonly requestBriefErasure: RequestBriefErasureUseCase,
    @Inject(EraseAllVoyageurDataUseCase)
    private readonly eraseAllVoyageurData: EraseAllVoyageurDataUseCase,
  ) {}

  // ---------------------------------------------------------------------
  // POST /api/intake/briefs
  //
  // T100 — Rate-limit FR-019/020/020a appliqué via le port
  // IntakeRateLimiter (Redis sliding window) DANS SubmitBriefUseCase.
  // Pas de décorateur @Throttle / @IntakeRateLimit ici : ajouter une
  // 2e couche Nest Throttler dupliquerait l'incrément et masquerait le
  // discriminator email-first/IP-second (FR-020a Q2). Le ThrottlerGuard
  // global (100 req/min/IP, AppModule) reste actif comme garde-fou ultime.
  // ---------------------------------------------------------------------
  @Post('briefs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Soumettre un brief voyageur (FR-001 à FR-013)' })
  @ApiResponse({ status: 201, description: 'Brief créé en pending_verification' })
  @ApiResponse({ status: 400, description: 'Validation Zod échouée' })
  @ApiResponse({ status: 409, description: 'Idempotency-Key déjà utilisée avec autre payload' })
  @ApiResponse({ status: 422, description: 'Email jetable détecté' })
  @ApiResponse({ status: 429, description: 'Rate-limit dépassé (email ou IP)' })
  async submit(
    // ZodEffects (superRefine) ne match pas le type generic du pipe — cast safe :
    // le pipe valide quand même au runtime avec le schema fourni.
    @Body(new ZodValidationPipe(SubmitBriefSchema as never)) body: SubmitBriefPayload,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Req() req: { cookies?: Record<string, string | undefined> },
    @Ip() clientIp: string,
  ): Promise<SubmitBriefResponse> {
    // T070 (US2) — lecture + validation HMAC du cookie `cv_suggested`
    // (posé par feature 007). Si valide, le conseillerId est figé sur le
    // brief pour le boost matching (FR-011).
    const suggestedConseillerId = verifyCvSuggestedCookie(
      req.cookies?.cv_suggested,
      env.CV_SUGGESTED_COOKIE_SECRET,
    );

    const result = await this.submitBrief.execute({
      ...body,
      locale: acceptLanguage?.startsWith('en') ? 'en' : 'fr-CA',
      clientIp: clientIp || null,
      userAgent: userAgent ?? null,
      idempotencyKey: idempotencyKey ?? null,
      suggestedConseillerId,
    });

    if (result.kind === 'ok') {
      return {
        briefId: result.briefId,
        status: 'pending_verification',
        emailSent: result.emailSent,
      };
    }

    throw mapSubmitFailureToHttpException(result);
  }

  // ---------------------------------------------------------------------
  // POST /api/intake/briefs/verify
  // ---------------------------------------------------------------------
  @Post('briefs/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consommer un magic link (FR-014)' })
  @ApiResponse({ status: 200, description: 'Brief activé, cookie session posé' })
  @ApiResponse({ status: 400, description: 'Token mal formé' })
  @ApiResponse({ status: 401, description: 'Token expiré ou déjà consommé' })
  @ApiResponse({ status: 410, description: 'Brief anonymisé' })
  async verify(
    @Body(new ZodValidationPipe<VerifyMagicLinkPayload>(VerifyMagicLinkSchema))
    body: VerifyMagicLinkPayload,
    @Req() req: { headers: Record<string, string | undefined>; protocol?: string },
    @Res({ passthrough: true })
    res: {
      cookie(name: string, value: string, options: Record<string, unknown>): void;
    },
  ): Promise<VerifyMagicLinkResponse> {
    const result = await this.verifyMagicLink.execute({ clearToken: body.token });

    if (result.kind === 'ok') {
      const isProd = req.protocol === 'https' || process.env.NODE_ENV === 'production';
      const cookieName = isProd ? PROD_COOKIE_NAME : DEV_COOKIE_NAME;
      res.cookie(cookieName, body.token, {
        maxAge: COOKIE_MAX_AGE_MS,
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: '/',
      });
      // expiresAt = J+INTAKE_BRIEF_EXPIRATION_DAYS depuis submittedAt
      // (calculé par SubmitBriefUseCase au moment de la création — on le
      // re-fetch via le use case ; pour l'instant on renvoie une valeur
      // placeholder, à enrichir en Phase 3d post-MVP si le client en a besoin).
      return {
        briefId: result.briefId,
        status: 'active',
        // J+90 à partir du verifiedAt — approximatif côté client
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      };
    }

    if (result.kind === 'token_not_found') {
      throw new NotFoundException({ message: 'Magic link introuvable.' });
    }
    if (result.kind === 'token_expired' || result.kind === 'token_already_consumed') {
      throw new UnauthorizedException({
        message:
          result.kind === 'token_expired'
            ? 'Ce lien a expiré (7 jours). Demandez un nouveau lien.'
            : 'Ce lien a déjà été utilisé.',
      });
    }
    if (result.kind === 'brief_anonymised') {
      throw new GoneException({ message: 'Ce brief a été supprimé. Aucune donnée à afficher.' });
    }

    const _exhaustive: never = result;
    return _exhaustive;
  }

  // ---------------------------------------------------------------------
  // GET /api/intake/briefs/by-email (US2, FR-017)
  // Doit être déclarée AVANT GET /:briefId pour ne pas être interceptée
  // par le param routing.
  // ---------------------------------------------------------------------
  @Get('briefs/by-email')
  @UseGuards(IntakeAuthGuard)
  @ApiOperation({ summary: 'Liste briefs actifs du contact (FR-017)' })
  @ApiResponse({ status: 200, description: 'Liste briefs (peut être vide)' })
  @ApiResponse({ status: 401, description: 'Cookie session voyageur absent ou expiré' })
  async listByEmail(@Req() req: IntakeContextRequest): Promise<{
    briefs: ReadonlyArray<BriefSummary>;
  }> {
    if (!req.intakeContext) throw new UnauthorizedException();
    const result = await this.listBriefsByEmail.execute({
      contactId: req.intakeContext.contactId as VoyageurContactId,
    });
    if (result.kind === 'contact_not_found') throw new NotFoundException();
    if (result.kind === 'contact_anonymised') throw new GoneException();
    return { briefs: result.briefs };
  }

  // ---------------------------------------------------------------------
  // GET /api/intake/briefs/:briefId (US2)
  // ---------------------------------------------------------------------
  @Get('briefs/:briefId')
  @UseGuards(IntakeAuthGuard)
  @ApiOperation({ summary: 'Récap du brief pour la page voyageur (US2)' })
  @ApiResponse({ status: 200, description: 'BriefSummary' })
  @ApiResponse({ status: 401, description: 'Cookie session absent/expiré' })
  @ApiResponse({ status: 404, description: 'BriefId inexistant' })
  @ApiResponse({ status: 410, description: 'Brief anonymisé' })
  async viewBrief(
    @Param('briefId') briefId: string,
    @Req() req: IntakeContextRequest,
  ): Promise<BriefSummary> {
    if (!req.intakeContext) throw new UnauthorizedException();
    const result = await this.viewBriefStatus.execute({
      briefId: briefId as VoyageurBriefId,
      contactId: req.intakeContext.contactId as VoyageurContactId,
    });
    if (result.kind === 'not_found') throw new NotFoundException();
    if (result.kind === 'unauthorized') throw new UnauthorizedException();
    if (result.kind === 'anonymised') throw new GoneException();
    return result.summary;
  }

  // ---------------------------------------------------------------------
  // POST /api/intake/briefs/resend-magic-link (N1, T082a)
  // Pas de :briefId — le voyageur n'y a pas accès (il n'a que son email).
  // @SkipRollingRenewal : pas de cookie en jeu (endpoint public anonyme).
  // ---------------------------------------------------------------------
  @Post('briefs/resend-magic-link')
  @SkipRollingRenewal()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Renvoie un magic link (réponse uniforme anti-énumération)' })
  @ApiResponse({ status: 202, description: 'Email envoyé OU email inexistant (uniforme)' })
  async resendMagicLink(
    @Body(new ZodValidationPipe(ResendMagicLinkSchema)) body: { email: string },
    @Headers('accept-language') acceptLanguage: string | undefined,
  ): Promise<{ status: 'sent_or_email_not_found' }> {
    const locale: 'fr-CA' | 'en' = acceptLanguage?.startsWith('en') ? 'en' : 'fr-CA';
    const result = await this.resendMagicLinkUseCase.execute({ email: body.email, locale });
    return { status: result.kind };
  }

  // ---------------------------------------------------------------------
  // POST /api/intake/briefs/:briefId/erasure-request (FR-022 US4, T106)
  // ---------------------------------------------------------------------
  @Post('briefs/:briefId/erasure-request')
  @UseGuards(IntakeAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demande effacement Loi 25 d un brief seul (FR-022)' })
  @ApiResponse({ status: 200, description: 'Brief anonymisé immédiatement (SC-008)' })
  @ApiResponse({ status: 400, description: 'Confirmation incorrecte' })
  @ApiResponse({ status: 401, description: 'Cookie session absent/IDOR' })
  @ApiResponse({ status: 404, description: 'Brief inexistant' })
  @ApiResponse({ status: 409, description: 'Brief déjà supprimé' })
  async requestErasure(
    @Param('briefId') briefId: string,
    @Body(new ZodValidationPipe(ErasureRequestBriefSchema)) body: { confirmation: string },
    @Req() req: IntakeContextRequest,
  ): Promise<{ status: 'pending'; estimatedCompletionSeconds: number }> {
    if (!req.intakeContext) throw new UnauthorizedException();
    const result = await this.requestBriefErasure.execute({
      briefId: briefId as VoyageurBriefId,
      contactId: req.intakeContext.contactId as VoyageurContactId,
      confirmation: body.confirmation,
    });
    if (result.kind === 'invalid_confirmation') {
      throw new HttpException({ message: 'Confirmation incorrecte.' }, HttpStatus.BAD_REQUEST);
    }
    if (result.kind === 'unauthorized') throw new UnauthorizedException();
    if (result.kind === 'not_found') throw new NotFoundException();
    if (result.kind === 'already_deleted') {
      throw new HttpException({ message: 'Déjà supprimé.' }, HttpStatus.CONFLICT);
    }
    return { status: 'pending', estimatedCompletionSeconds: 0 };
  }

  // ---------------------------------------------------------------------
  // POST /api/intake/voyageur/erase-all-data (FR-022a, C1, T115d)
  // @SkipRollingRenewal : on révoque la session, pas la peine de renouveler.
  // ---------------------------------------------------------------------
  @Post('voyageur/erase-all-data')
  @UseGuards(IntakeAuthGuard)
  @SkipRollingRenewal()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Effacement global Loi 25 (contact + tous briefs, FR-022a)' })
  @ApiResponse({ status: 200, description: 'Tout effacé, cookie révoqué' })
  @ApiResponse({ status: 400, description: 'Phrase incorrecte ou stale_brief_count' })
  @ApiResponse({ status: 401, description: 'Cookie absent' })
  @ApiResponse({ status: 409, description: 'Déjà supprimé' })
  async eraseAllData(
    @Body(new ZodValidationPipe(ErasureRequestAllSchema))
    body: { confirmation: string; acknowledgedBriefCount: number },
    @Req() req: IntakeContextRequest,
    @Res({ passthrough: true })
    res: { clearCookie?(name: string, options: Record<string, unknown>): void },
  ): Promise<{
    status: 'pending';
    briefsAffectedCount: number;
    estimatedCompletionSeconds: number;
  }> {
    if (!req.intakeContext) throw new UnauthorizedException();
    const result = await this.eraseAllVoyageurData.execute({
      contactId: req.intakeContext.contactId as VoyageurContactId,
      confirmation: body.confirmation,
      acknowledgedBriefCount: body.acknowledgedBriefCount,
    });
    if (result.kind === 'invalid_confirmation') {
      throw new HttpException({ message: 'Phrase incorrecte.' }, HttpStatus.BAD_REQUEST);
    }
    if (result.kind === 'stale_brief_count') {
      throw new HttpException(
        {
          message: 'Le nombre de briefs a changé. Rechargez la page.',
          actualCount: result.actualCount,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (result.kind === 'contact_not_found') throw new NotFoundException();
    if (result.kind === 'already_deleted') {
      throw new HttpException({ message: 'Déjà supprimé.' }, HttpStatus.CONFLICT);
    }

    // Révocation immédiate du cookie session voyageur (Loi 25 — la session
    // ne doit plus pointer vers des données effacées). Côté navigateur,
    // l'utilisateur sera déconnecté au prochain refresh.
    res.clearCookie?.('__Host-cv.intake.token', { path: '/' });
    res.clearCookie?.('cv.intake.session', { path: '/' });

    return {
      status: 'pending',
      briefsAffectedCount: result.briefsAffectedCount,
      estimatedCompletionSeconds: 0,
    };
  }
}

// =====================================================================
// Mapping helpers
// =====================================================================

type SubmitFailure = Exclude<Awaited<ReturnType<SubmitBriefUseCase['execute']>>, { kind: 'ok' }>;

function mapSubmitFailureToHttpException(result: SubmitFailure): HttpException {
  if (result.kind === 'validation_failed') {
    return new HttpException(
      { message: 'Validation failed', errors: result.issues },
      HttpStatus.BAD_REQUEST,
    );
  }
  if (result.kind === 'business_rule_failed') {
    return new HttpException(
      { message: 'Brief invalide', detail: result.message },
      HttpStatus.BAD_REQUEST,
    );
  }
  if (result.kind === 'disposable_email') {
    const body: DisposableErrorBody = {
      code: 'DISPOSABLE_EMAIL_DETECTED',
      message:
        'Cette adresse semble temporaire. Nous avons besoin d’un courriel durable pour vous mettre en relation avec un conseiller.',
    };
    return new UnprocessableEntityException(body);
  }
  // rate_limited (FR-020a Q2 — 2 codes 429 distincts)
  const body: RateLimitErrorBody =
    result.reason === 'email'
      ? {
          code: 'EMAIL_RATE_LIMIT_EXCEEDED',
          retryAfter: result.retryAfterSeconds,
          message: `Vous avez soumis 3 briefs sur cette adresse en 24 h. Réessayez dans ${Math.ceil(
            result.retryAfterSeconds / 3600,
          )} h ou utilisez une autre adresse courriel.`,
        }
      : {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Votre demande ne peut être traitée actuellement, veuillez réessayer plus tard.',
        };
  return new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
}
