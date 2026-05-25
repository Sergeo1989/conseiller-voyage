// T019 — AuthGuard NestJS qui lit la session Auth.js depuis Postgres.
// Cookie `__Host-cv.session.token` envoyé par apps/web (Auth.js v5).
// Le user authentifié est injecté dans la requête sous `request.user` —
// disponible ensuite via paramDecorator @AuthenticatedUser dans les
// contrôleurs et passé au cas d'usage comme `requestedBy`.

import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AUTH_SESSION_READER,
  type AuthSessionReader,
  type AuthenticatedUser,
} from '../application/ports/auth-session-reader.port';

// En prod : UNIQUEMENT le cookie strict `__Host-cv.session.token` (requires
// HTTPS + path=/ + no Domain). Le fallback `authjs.session-token` est
// activé seulement quand NODE_ENV !== 'production', sinon un sous-domaine
// compromis pourrait poser un cookie non-`__Host-` qui serait accepté
// (vecteur de fixation de session). Documenté par /review pré-merge.
const COOKIE_NAMES =
  process.env.NODE_ENV === 'production'
    ? (['__Host-cv.session.token'] as const)
    : (['__Host-cv.session.token', 'authjs.session-token'] as const);

interface AuthenticatedRequest {
  cookies?: Record<string, string | undefined>;
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((p) => {
      const [k, ...rest] = p.trim().split('=');
      return [k ?? '', decodeURIComponent(rest.join('='))];
    }),
  );
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH_SESSION_READER) private readonly sessions: AuthSessionReader) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const cookieHeader = req.headers.cookie;
    const headerStr = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
    const headerCookies = parseCookies(headerStr);

    let token: string | undefined;
    for (const name of COOKIE_NAMES) {
      token = req.cookies?.[name] ?? headerCookies[name];
      if (token) break;
    }
    if (!token) {
      throw new UnauthorizedException('Missing session cookie.');
    }

    const session = await this.sessions.findValidByToken(token);
    if (!session) {
      throw new UnauthorizedException('Invalid or expired session.');
    }

    req.user = session.user;
    return true;
  }
}
