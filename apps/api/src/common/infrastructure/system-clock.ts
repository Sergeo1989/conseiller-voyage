// T028 — Implémentation système du port Clock.
// Utilise `new Date()` / `Date.now()` en prod. Les tests substituent un
// FakeClock via le conteneur DI NestJS.

import { Injectable } from '@nestjs/common';
import type { Clock } from '../ports/clock.port';

@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  nowMs(): number {
    return Date.now();
  }
}
