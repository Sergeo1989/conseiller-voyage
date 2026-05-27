// T122 — Test SC-005 "aucun mot de passe en clair dans les logs Pino".
//
// Vérifie que la config Pino `redact` masque les mots de passe avant
// qu'ils n'atteignent le transport. Le test ne lance pas l'API réelle —
// il configure un logger pino isolé avec la même liste redact et vérifie
// le masquage sur des objets req.body simulés.

import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';

// Mêmes chemins redact que apps/api/src/common/logger.module.ts
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.email',
  '*.emailAddress',
  '*.password',
  '*.token',
  'req.body.password',
  'req.body.newPassword',
  'req.body.currentPassword',
  'req.body.newPasswordConfirmation',
];

describe('Pino redactor — SC-005 / H10', () => {
  function captureLog(payload: object): string {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString('utf8'));
        cb();
      },
    });
    const logger = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, stream);
    logger.info(payload, 'test');
    return chunks.join('');
  }

  it('masque req.body.password sur un POST signup', () => {
    const log = captureLog({
      req: {
        method: 'POST',
        url: '/api/auth/signup',
        body: {
          email: 'maxime@test.local',
          password: 'Tigre!Strong-2026',
        },
      },
    });
    expect(log).not.toContain('Tigre!Strong-2026');
    expect(log).toContain('[REDACTED]');
  });

  it('masque req.body.currentPassword et newPassword sur change-password', () => {
    const log = captureLog({
      req: {
        method: 'POST',
        url: '/api/auth/password-change',
        body: {
          currentPassword: 'Ancien!Strong-2026',
          newPassword: 'Nouveau!Strong-2026',
          newPasswordConfirmation: 'Nouveau!Strong-2026',
        },
      },
    });
    expect(log).not.toContain('Ancien!Strong-2026');
    expect(log).not.toContain('Nouveau!Strong-2026');
  });

  it('masque req.headers.cookie et authorization', () => {
    const log = captureLog({
      req: {
        headers: {
          cookie: '__Host-cv.session.token=secret-session-value',
          authorization: 'Bearer secret-bearer-token',
        },
      },
    });
    expect(log).not.toContain('secret-session-value');
    expect(log).not.toContain('secret-bearer-token');
  });
});
