// RoleGuard — RBAC NestJS basé sur AuthUser.role.
// Doit être appliqué APRÈS AuthGuard (qui injecte request.user).
// Pattern : @UseGuards(AuthGuard, RoleGuard) + @RequireRole('admin').

import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
// NestJS DI exige Reflector en value-import (constructor injection
// metadata) — Biome veut le convertir en type-only, mais ça casserait
// le runtime DI.
// biome-ignore lint/style/useImportType: NestJS DI requires runtime Reflector
import { Reflector } from '@nestjs/core';
import type { AuthRole, AuthenticatedUser } from '../application/ports/auth-session-reader.port';

const REQUIRE_ROLE_KEY = 'requireRole';

/** Décorateur de méthode/contrôleur — exige un rôle spécifique. */
export const RequireRole = (role: AuthRole): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_ROLE_KEY, role);

interface RequestWithUser {
  user?: AuthenticatedUser;
}

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AuthRole | undefined>(REQUIRE_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true; // pas de contrainte = pass-through

    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const userRole = req.user?.role;
    if (userRole !== required) {
      throw new ForbiddenException(
        `Required role '${required}', got '${userRole ?? 'unauthenticated'}'`,
      );
    }
    return true;
  }
}
