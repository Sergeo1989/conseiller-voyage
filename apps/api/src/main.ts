// MUST be the very first import — initialise OpenTelemetry + Sentry + valide
// les variables d'environnement avant le chargement de NestJS et de tout autre
// module instrumenté.
import './instrumentation';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { registerSecurityHeaders } from './common/security/headers';
import { env } from './env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));
  await registerSecurityHeaders(app);

  await app.listen({ port: env.PORT, host: env.HOST });
}

void bootstrap();
