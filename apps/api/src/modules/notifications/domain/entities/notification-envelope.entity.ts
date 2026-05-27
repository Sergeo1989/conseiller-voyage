// T033 — Entité NotificationEnvelope (read-only).
//
// Représentation domaine de l'envelope. Construite uniquement depuis
// le schéma Zod partagé (`@cv/shared/notifications`). N'introduit pas
// de nouveaux invariants — le validation est dans le schéma.

import type { NotificationEnvelope } from '@cv/shared/notifications';

export type { NotificationEnvelope };

/**
 * Helper de construction depuis le schéma — équivalent à `parse` du
 * schéma Zod mais expose un type domain plus explicite côté use cases.
 */
export function envelopeFromSchema(envelope: NotificationEnvelope): NotificationEnvelope {
  return envelope;
}
