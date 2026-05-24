import { Module } from '@nestjs/common';
import { LoggerModule } from './common/logger.module';
import { ThrottlerModule } from './common/throttler.module';
import { HealthModule } from './health/health.module';
import { IdentiteModule } from './modules/identite/identite.module';
import { BullMqModule } from './queue/bullmq.module';

/**
 * Module racine NestJS.
 * Les modules métier (conformité, intake, matching, facturation, SEO) seront
 * importés ici au fur et à mesure de leur implémentation.
 * Cf. constitution Principe V — monolithe modulaire.
 */
@Module({
  imports: [LoggerModule, ThrottlerModule, BullMqModule, IdentiteModule, HealthModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
