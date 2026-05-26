// StepUpGuard — exige une session "MFA frais" (mfaVerifiedAt < 30 min).
// FR-016 à FR-018 + freshness pure dans @cv/mfa.
//
// Doit être appliqué APRÈS AuthGuard (qui injecte request.user).
// Réponse 403 avec code STEP_UP_REQUIRED si non fresh — le frontend
// utilise ce code pour ouvrir le modal step-up.

import { isFresh } from '@cv/mfa';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../application/ports/auth-session-reader.port';

interface RequestWithUser {
  user?: AuthenticatedUser;
}

@Injectable()
export class StepUpGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException({
        code: 'NOT_AUTHENTICATED',
        message: 'AuthGuard must run before StepUpGuard',
      });
    }
    if (!isFresh(user.mfaVerifiedAt, new Date())) {
      throw new ForbiddenException({
        code: 'STEP_UP_REQUIRED',
        message: 'This action requires a fresh MFA verification (< 30 min)',
      });
    }
    return true;
  }
}
