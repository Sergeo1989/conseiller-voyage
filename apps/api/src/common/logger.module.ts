// T013 — Logger Pino global pour NestJS via nestjs-pino.
// JSON structuré en prod, pino-pretty en dev. Redaction défensive des
// champs sensibles (Authorization, Cookie, PII probable dans les payloads).

import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { env } from '../env';

const PII_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["idempotency-key"]',
  '*.email',
  '*.emailAddress',
  '*.phone',
  '*.phoneNumber',
  '*.firstName',
  '*.lastName',
  '*.fullName',
  '*.password',
  '*.token',
  '*.apiKey',
  // Feature 002 (auth) — chemins body explicites pour SC-005 / H10.
  // Le glob `*.password` ci-dessus capture déjà ces chemins, mais
  // l'énumération explicite documente l'intention et résiste à des
  // serializers personnalisés qui contournent les globs.
  'req.body.password',
  'req.body.newPassword',
  'req.body.currentPassword',
  'req.body.newPasswordConfirmation',
];

@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        level: env.LOG_LEVEL,
        // conditional spread : exactOptionalPropertyTypes refuse `undefined` explicite
        ...(env.NODE_ENV !== 'production' && {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, singleLine: true, translateTime: 'HH:MM:ss' },
          },
        }),
        redact: { paths: PII_REDACT_PATHS, censor: '[REDACTED]' },
        serializers: {
          req(req: { method: string; url: string; id?: string }) {
            return { method: req.method, url: req.url, id: req.id };
          },
        },
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
