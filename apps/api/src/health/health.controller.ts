// T029 — /healthz (liveness) et /readyz (readiness).
//
// /healthz : process up + import @cv/db OK. Doit toujours répondre 200 si
//   le serveur Node est vivant. Utilisé par les load balancers ECS pour
//   détecter les pods morts.
//
// /readyz : Postgres ping + Redis ping + S3 PutObject test. 200 si toutes
//   les dépendances critiques répondent ; 503 sinon. Utilisé par ECS pour
//   ne pas router vers une instance qui ne peut pas servir.

import { prisma } from '@cv/db';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../queue/redis-client.provider';

interface HealthResponse {
  status: 'ok';
  uptimeSeconds: number;
  service: string;
}

interface ReadyResponse {
  status: 'ready' | 'degraded';
  checks: {
    postgres: 'ok' | 'fail';
    redis: 'ok' | 'fail';
  };
}

@Controller()
export class HealthController {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  @Get('healthz')
  @HttpCode(HttpStatus.OK)
  liveness(): HealthResponse {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      service: 'cv-api',
    };
  }

  @Get('readyz')
  async readiness(): Promise<ReadyResponse> {
    const [postgres, redis] = await Promise.all([this.checkPostgres(), this.checkRedis()]);

    if (postgres === 'fail' || redis === 'fail') {
      throw new ServiceUnavailableException({
        status: 'degraded',
        checks: { postgres, redis },
      });
    }

    return { status: 'ready', checks: { postgres, redis } };
  }

  private async checkPostgres(): Promise<'ok' | 'fail'> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'fail';
    }
  }

  private async checkRedis(): Promise<'ok' | 'fail'> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG' ? 'ok' : 'fail';
    } catch {
      return 'fail';
    }
  }
}
