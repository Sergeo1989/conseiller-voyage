// Module NestJS pour l'identité — wiring DI minimal pour T017-T019.
// La feature 002 enrichira ce module avec les use cases d'auth, le MFA,
// les notifications, etc.

import { Module } from '@nestjs/common';
import { AUTH_SESSION_READER } from './application/ports/auth-session-reader.port';
import { PrismaAuthSessionReader } from './infrastructure/prisma-auth-session-reader';
import { AuthGuard } from './interface/auth.guard';

@Module({
  providers: [{ provide: AUTH_SESSION_READER, useClass: PrismaAuthSessionReader }, AuthGuard],
  exports: [AUTH_SESSION_READER, AuthGuard],
})
export class IdentiteModule {}
