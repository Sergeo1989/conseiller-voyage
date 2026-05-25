// MUST be the very first import — initialise OpenTelemetry + Sentry + valide
// les variables d'environnement avant le chargement de NestJS et de tout autre
// module instrumenté.
import './instrumentation';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  // T073 — Swagger OpenAPI dev/staging only. La constitution exige que
  // /api/docs ne soit pas exposé en prod (Principe IX — surface d'attaque).
  if (env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Conseiller Voyage — API')
      .setDescription(
        'API interne consommée par les Server Actions Next.js. ' +
          'Tous les endpoints exigent une session Auth.js valide (cookie ' +
          '__Host-cv.session.token) + header X-Requested-By: web sur les ' +
          'mutations (protection CSRF).',
      )
      .setVersion('0.1.0-mvp')
      .addCookieAuth('__Host-cv.session.token')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen({ port: env.PORT, host: env.HOST });
}

void bootstrap();
