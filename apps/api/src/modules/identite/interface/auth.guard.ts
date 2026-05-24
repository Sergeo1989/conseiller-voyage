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

const COOKIE_NAME = '__Host-cv.session.token';

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

    const fromCookies = req.cookies?.[COOKIE_NAME];
    const cookieHeader = req.headers.cookie;
    const headerStr = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
    const fromHeader = parseCookies(headerStr)[COOKIE_NAME];

    const token = fromCookies ?? fromHeader;
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
