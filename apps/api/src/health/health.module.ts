// T029 — Module Health (liveness /healthz, readiness /readyz).
// Cf. constitution Principe X.

import { Module } from '@nestjs/common';
import { BullMqModule } from '../queue/bullmq.module';
import { HealthController } from './health.controller';

@Module({
  imports: [BullMqModule],
  controllers: [HealthController],
})
export class HealthModule {}
