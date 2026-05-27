// Port interne pour éviter une dépendance circulaire entre l'impl
// NotificationPortImpl et le use case concret.

import type { NotificationEnvelope } from '@cv/shared/notifications';
import type { SendResult } from './notification.port';

export interface SendNotificationUseCasePort {
  execute(envelope: NotificationEnvelope): Promise<SendResult>;
}

export const SEND_NOTIFICATION_USE_CASE = Symbol.for('NotificationsSendNotificationUseCase');
