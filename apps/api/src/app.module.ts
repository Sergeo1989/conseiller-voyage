import { Module } from '@nestjs/common';
import { LoggerModule } from './common/logger.module';

/**
 * Module racine NestJS.
 * Les modules métier (conformité, identité, intake, matching, facturation, SEO)
 * sont importés ici au fur et à mesure de leur implémentation.
 * Cf. constitution Principe V — monolithe modulaire.
 */
@Module({
  imports: [LoggerModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
