// T001/T002 [017] — Types partagés des notifications voyageur (roadmap 010).
//
// Le module intake OWNE le cycle de notification ; le matching déclenche via le
// port public `VoyageurMatchNotifier`. Aucune PII conseiller ici (IDs techniques).

// Issue d'appariement (miroir des événements 011/012 : matched/partial/unmatched).
export type MatchOutcome = 'matched' | 'partially_matched' | 'unmatched';

// Type de notification voyageur.
export type VoyageurNotificationType =
  | 'accuse_activation'
  | 'conseillers_prets'
  | 'recherche_en_cours';

// Statut de l'envoi (outbox append-only).
export type VoyageurNotificationStatus = 'en_attente' | 'envoyee' | 'echouee' | 'annulee';

// Entrée du port public : matching la fournit après traitement (dédupliqué).
export interface BriefOutcomeNotification {
  readonly briefId: string;
  readonly outcome: MatchOutcome;
  readonly conseillerIds: ReadonlyArray<string>; // IDs techniques uniquement
  readonly idempotencyKey: string; // = clé de l'événement source (anti-doublon)
}

// Port PUBLIC inter-module (Principe V) : exposé par intake, appelé par matching.
// Best-effort : l'implémentation ne doit jamais throw vers l'appelant matching.
export interface VoyageurMatchNotifier {
  onBriefOutcome(input: BriefOutcomeNotification): Promise<void>;
}

export const VOYAGEUR_MATCH_NOTIFIER = Symbol.for('VoyageurMatchNotifier');
