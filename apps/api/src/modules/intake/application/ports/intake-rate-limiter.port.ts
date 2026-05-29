// Port IntakeRateLimiter — sliding window 24h pour FR-019/020/020a.
// Adapter Redis (T051). Source de vérité ; les colonnes briefsCount24h
// de VoyageurContact sont diagnostiques (cf. data-model + N5 résolu).

export type RateLimitOutcome =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly retryAfterSeconds: number;
      /** FR-020a Q2 clarify — discriminator pour traduire en `EMAIL_RATE_LIMIT_EXCEEDED`
       *  vs `RATE_LIMIT_EXCEEDED` neutre dans le controller (T100). */
      readonly reason: 'email' | 'ip';
    };

export interface RateLimitInput {
  readonly email: string;
  readonly clientIp: string | null;
  readonly nowMs: number;
}

export interface IntakeRateLimiter {
  /**
   * Évalue email-first, IP-second (FR-020a Q2 clarify). Retourne le 1er
   * échec rencontré. L'appelant (T100) traduit le résultat en code 429
   * approprié (`EMAIL_RATE_LIMIT_EXCEEDED` vs `RATE_LIMIT_EXCEEDED` neutre).
   */
  checkAndIncrement(input: RateLimitInput): Promise<RateLimitOutcome>;
}

export const INTAKE_RATE_LIMITER = Symbol.for('IntakeRateLimiter');
