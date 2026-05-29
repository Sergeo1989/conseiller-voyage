// T025a [TDD RED] — Tests du RollingSessionCookieInterceptor.
//
// FR-014a Q5 clarify : à chaque visite ultérieure à une route protégée
// par un cookie session voyageur, le cookie DOIT être renouvelé avec
// `Max-Age=604800` (7 jours). 7 jours d'inactivité → cookie expire.
//
// N3 résolu : l'interceptor ne renouvelle QUE le cookie voyageur
// (`__Host-cv.intake.token` en prod ou `cv.intake.session` en dev).
// Les cookies admin / conseiller ne sont JAMAIS touchés.
//
// État TDD : RED — l'import depuis `../rolling-session-cookie.interceptor`
// et `../skip-rolling-renewal.decorator` ÉCHOUE en compilation tant que
// T025b/T025c ne sont pas livrés.

import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RollingSessionCookieInterceptor } from '../rolling-session-cookie.interceptor';
import { SKIP_ROLLING_RENEWAL_KEY } from '../skip-rolling-renewal.decorator';

// =====================================================================
// Helpers de mock
// =====================================================================

interface MockRequest {
  cookies: Record<string, string>;
  method: string;
}

interface MockResponse {
  statusCode: number;
  cookie: ReturnType<typeof vi.fn>;
}

interface MockContextOptions {
  cookies?: Record<string, string>;
  statusCode?: number;
  isProd?: boolean;
  skipDecorator?: boolean;
}

function buildContext(opts: MockContextOptions = {}): {
  context: ExecutionContext;
  res: MockResponse;
  reflector: Reflector;
} {
  const req: MockRequest = {
    cookies: opts.cookies ?? {},
    method: 'GET',
  };
  const res: MockResponse = {
    statusCode: opts.statusCode ?? 200,
    cookie: vi.fn(),
  };

  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
    if (key === SKIP_ROLLING_RENEWAL_KEY) {
      return opts.skipDecorator ?? false;
    }
    return undefined;
  });

  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
    getHandler: () => () => undefined,
    getClass: () => class FakeController {},
  } as unknown as ExecutionContext;

  return { context, res, reflector };
}

function buildHandler(returnValue: unknown = { ok: true }): CallHandler {
  return {
    handle: () => of(returnValue),
  };
}

function buildFailingHandler(error: Error): CallHandler {
  return {
    handle: () => throwError(() => error),
  };
}

// =====================================================================
// Tests
// =====================================================================

describe('RollingSessionCookieInterceptor', () => {
  it('(a) requête sans cookie voyageur → ne pose AUCUN Set-Cookie', async () => {
    const { context, res, reflector } = buildContext({ cookies: {} });
    const interceptor = new RollingSessionCookieInterceptor(reflector);
    await lastValueFrom(interceptor.intercept(context, buildHandler()));
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('(a-bis) requête avec un cookie autre que intake → ne pose AUCUN Set-Cookie (N3)', async () => {
    const { context, res, reflector } = buildContext({
      cookies: { '__Host-cv.session.token': 'admin-session-xyz' },
    });
    const interceptor = new RollingSessionCookieInterceptor(reflector);
    await lastValueFrom(interceptor.intercept(context, buildHandler()));
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('(b) cookie intake prod + statut 200 → Set-Cookie avec Max-Age 604800 et flags prod', async () => {
    const { context, res, reflector } = buildContext({
      cookies: { '__Host-cv.intake.token': 'voyageur-session-abc' },
      statusCode: 200,
      isProd: true,
    });
    const interceptor = new RollingSessionCookieInterceptor(reflector);
    await lastValueFrom(interceptor.intercept(context, buildHandler()));

    expect(res.cookie).toHaveBeenCalledTimes(1);
    const call = res.cookie.mock.calls[0];
    expect(call).toBeDefined();
    const [name, value, options] = call as [string, string, Record<string, unknown>];
    expect(name).toBe('__Host-cv.intake.token');
    expect(value).toBe('voyageur-session-abc');
    expect(options).toMatchObject({
      maxAge: 604_800_000, // 7 jours en ms
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('(b-bis) cookie intake dev (sans __Host- prefix) → Set-Cookie avec le même nom dev', async () => {
    const { context, res, reflector } = buildContext({
      cookies: { 'cv.intake.session': 'voyageur-session-def' },
      statusCode: 200,
    });
    const interceptor = new RollingSessionCookieInterceptor(reflector);
    await lastValueFrom(interceptor.intercept(context, buildHandler()));

    expect(res.cookie).toHaveBeenCalledTimes(1);
    const call = res.cookie.mock.calls[0];
    expect(call).toBeDefined();
    expect((call as [string, string, Record<string, unknown>])[0]).toBe('cv.intake.session');
  });

  it('(c) statut 401 → PAS de renewal (anti-extension de session sur erreur)', async () => {
    const { context, res, reflector } = buildContext({
      cookies: { '__Host-cv.intake.token': 'voyageur-session-abc' },
      statusCode: 401,
    });
    const interceptor = new RollingSessionCookieInterceptor(reflector);
    await lastValueFrom(interceptor.intercept(context, buildHandler()));
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('(c-bis) statut 500 → PAS de renewal', async () => {
    const { context, res, reflector } = buildContext({
      cookies: { '__Host-cv.intake.token': 'voyageur-session-abc' },
      statusCode: 500,
    });
    const interceptor = new RollingSessionCookieInterceptor(reflector);
    await lastValueFrom(interceptor.intercept(context, buildHandler()));
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('(c-ter) handler throw → PAS de renewal', async () => {
    const { context, res, reflector } = buildContext({
      cookies: { '__Host-cv.intake.token': 'voyageur-session-abc' },
      statusCode: 200,
    });
    const interceptor = new RollingSessionCookieInterceptor(reflector);
    await expect(
      lastValueFrom(interceptor.intercept(context, buildFailingHandler(new Error('boom')))),
    ).rejects.toThrow('boom');
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('(d) @SkipRollingRenewal() décorateur → PAS de renewal même si cookie + 200', async () => {
    const { context, res, reflector } = buildContext({
      cookies: { '__Host-cv.intake.token': 'voyageur-session-abc' },
      statusCode: 200,
      skipDecorator: true,
    });
    const interceptor = new RollingSessionCookieInterceptor(reflector);
    await lastValueFrom(interceptor.intercept(context, buildHandler()));
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('(e) statut 200 mais aucun cookie intake → pas de renewal', async () => {
    const { context, res, reflector } = buildContext({
      cookies: {},
      statusCode: 200,
    });
    const interceptor = new RollingSessionCookieInterceptor(reflector);
    await lastValueFrom(interceptor.intercept(context, buildHandler()));
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
