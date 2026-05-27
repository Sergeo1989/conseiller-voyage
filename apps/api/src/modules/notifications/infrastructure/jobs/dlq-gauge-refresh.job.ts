// T102 — DlqGaugeRefreshJob.
// Enregistre un callback observable sur dlqSizeObservableGauge.
// Le SDK OTel appelle le callback à chaque intervalle d'export (30s).

import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { ObservableResult } from '@opentelemetry/api';
import {
  NOTIFICATION_LOG_READER,
  type NotificationLogReader,
} from '../../application/ports/notification-log-reader.port';
import { dlqSizeObservableGauge } from '../notifications-metrics';

@Injectable()
export class DlqGaugeRefreshJob implements OnModuleInit {
  constructor(@Inject(NOTIFICATION_LOG_READER) private readonly logReader: NotificationLogReader) {}

  onModuleInit(): void {
    dlqSizeObservableGauge.addCallback(async (result: ObservableResult) => {
      const count = await this.logReader.countByStatus('dead_letter');
      result.observe(count);
    });
  }
}
