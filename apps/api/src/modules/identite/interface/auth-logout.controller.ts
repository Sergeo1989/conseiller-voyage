// T088 — AuthLogoutController (US4 P1 MVP).
//
// POST /api/auth/logout — authentifié (AuthGuard 002a).
//
// Note H9 review : ce contrôleur est conservé principalement pour :
//   - les tests d'intégration qui invalident explicitement une session
//   - une future fonctionnalité "force-logout admin" (out of scope 002,
//     nécessitera l'ajout d'un guard @RequireRole('admin') + ?userId=)
// L'UX canonique côté apps/web utilise une Server Action `logoutAction`
// qui fait le même travail (DELETE session + clear cookie côté Next.js).

import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { readActorIp } from '../../../common/actor-ip.util';
import type { AuthenticatedUser } from '../application/ports/auth-session-reader.port';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { LogoutUseCase } from '../application/use-cases/logout.use-case';
import { AuthGuard } from './auth.guard';

interface AuthenticatedRequest {
  cookies?: Record<string, string | undefined>;
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
  ip?: string;
}

const COOKIE_NAMES =
  process.env.NODE_ENV === 'production'
    ? (['__Host-cv.session.token'] as const)
    : (['__Host-cv.session.token', 'authjs.session-token'] as const);

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((p) => {
      const [k, ...rest] = p.trim().split('=');
      return [k ?? '', decodeURIComponent(rest.join('='))];
    }),
  );
}

function extractSessionToken(req: AuthenticatedRequest): string | null {
  const cookieHeader = req.headers.cookie;
  const headerStr = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
  const headerCookies = parseCookies(headerStr);
  for (const name of COOKIE_NAMES) {
    const token = req.cookies?.[name] ?? headerCookies[name];
    if (token) return token;
  }
  return null;
}

@ApiTags('auth-logout')
@Controller('api/auth')
@UseGuards(AuthGuard)
export class AuthLogoutController {
  constructor(private readonly logoutUseCase: LogoutUseCase) {}

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Déconnexion de la session courante (US4)' })
  @ApiResponse({ status: 200, description: 'Session DELETED + audit logout' })
  @ApiResponse({ status: 401, description: 'NO_ACTIVE_SESSION' })
  async logout(@Req() req: AuthenticatedRequest): Promise<{ readonly status: 'ok' }> {
    const user = req.user;
    if (!user) throw new UnauthorizedException({ code: 'NO_ACTIVE_SESSION' });
    const token = extractSessionToken(req);
    if (!token) throw new UnauthorizedException({ code: 'NO_ACTIVE_SESSION' });

    const actorIp = readActorIp(req);
    const result = await this.logoutUseCase.execute({
      sessionToken: token,
      userId: user.id,
      ...(actorIp ? { actorIp } : {}),
    });
    if (result.kind === 'no_session') {
      throw new UnauthorizedException({ code: 'NO_ACTIVE_SESSION' });
    }
    return { status: 'ok' };
  }
}
