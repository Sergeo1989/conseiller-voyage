// T012 [017 US1] [TDD GREEN] — Sélection du type de notification voyageur.
//
// Fonction PURE (Principe VI). Mappe une issue d'appariement vers un type de
// notification + applique l'anti-spam (FR-014) : si l'issue est inchangée par
// rapport à la dernière notifiée pour ce brief, la notification est supprimée.

import type { MatchOutcome, VoyageurNotificationType } from '@cv/shared/intake';

export interface NotificationSelection {
  readonly type: VoyageurNotificationType;
  readonly suppressed: boolean;
}

export function selectNotificationForOutcome(
  outcome: MatchOutcome,
  lastNotifiedOutcome: MatchOutcome | null,
): NotificationSelection {
  const type: VoyageurNotificationType =
    outcome === 'unmatched' ? 'recherche_en_cours' : 'conseillers_prets';
  // Anti-spam : même issue déjà notifiée → ne pas re-notifier (FR-014).
  return { type, suppressed: outcome === lastNotifiedOutcome };
}
