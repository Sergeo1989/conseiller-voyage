// T036 [Polish] — OtelConversationMetricsRecorder : adapter OpenTelemetry du
// port ConversationMetricsRecorder. Meter `cv.matching.conversation`. En
// l'absence de MeterProvider, l'API renvoie des instruments no-op (safe dev).

import { Injectable } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';
import type { ConversationMetricsRecorder } from '../application/ports';

const meter = metrics.getMeter('cv.matching.conversation', '1.0.0');

const openedCounter = meter.createCounter('cv.matching.conversation.opened', {
  description: 'Fils de conversation ouverts (à l’acceptation d’un lead)',
  unit: '1',
});

const messageSentCounter = meter.createCounter('cv.matching.conversation.message_sent', {
  description: 'Messages envoyés dans un fil',
  unit: '1',
});

const attachmentReadyCounter = meter.createCounter('cv.matching.conversation.attachment_ready', {
  description: 'Pièces jointes finalisées (devis transmis)',
  unit: '1',
});

@Injectable()
export class OtelConversationMetricsRecorder implements ConversationMetricsRecorder {
  recordConversationOpened(): void {
    openedCounter.add(1);
  }
  recordMessageSent(): void {
    messageSentCounter.add(1);
  }
  recordAttachmentReady(): void {
    attachmentReadyCounter.add(1);
  }
}
