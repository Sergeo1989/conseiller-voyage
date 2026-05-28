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
  type SubmitBriefPayload,
  SubmitBriefSchema,
  type VerifyMagicLinkPayload,
  VerifyMagicLinkSchema,
} from '@cv/shared/intake';
import {
  Body,
  Controller,
  GoneException,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Ip,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { SubmitBriefUseCase } from '../../application/use-cases/submit-brief.use-case';
import { VerifyMagicLinkUseCase } from '../../application/use-cases/verify-magic-link.use-case';

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

@ApiTags('intake')
@Controller('api/intake')
export class VoyageurIntakeController {
  constructor(
    @Inject(SubmitBriefUseCase) private readonly submitBrief: SubmitBriefUseCase,
    @Inject(VerifyMagicLinkUseCase) private readonly verifyMagicLink: VerifyMagicLinkUseCase,
  ) {}

  // ---------------------------------------------------------------------
  // POST /api/intake/briefs
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
    @Ip() clientIp: string,
  ): Promise<SubmitBriefResponse> {
    const result = await this.submitBrief.execute({
      ...body,
      locale: acceptLanguage?.startsWith('en') ? 'en' : 'fr-CA',
      clientIp: clientIp || null,
      userAgent: userAgent ?? null,
      idempotencyKey: idempotencyKey ?? null,
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
