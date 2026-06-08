// T016 [US1] — Port ConversationOpener : ouvre (idempotent) le fil de
// conversation au moment où un lead passe à `accepté` (FR-001).
//
// Découple `RecordLeadTransitionUseCase` (012) de la mécanique de conversation
// (013) : la transition reste la source de vérité, cette feature s'y abonne.
// Le déclenchement est **in-process synchrone** — 012 n'émet aucun événement de
// bus sur les transitions de lead (ce sont des actions HTTP conseiller
// append-only). L'ouverture est best-effort côté appelant : un échec ne doit
// jamais annuler l'acceptation déjà persistée (POST /open + sweep = filets).

export interface OpenConversationForLeadInput {
  readonly leadId: string;
  readonly conseillerId: string;
  /** Brief du lead — sert aussi de proxy `voyageurRef` (015 formalisera). */
  readonly briefId: string | null;
}

export interface ConversationOpener {
  /** Idempotent : un fil par lead. Ne lève pas en cas d'échec attendu. */
  openForAcceptedLead(input: OpenConversationForLeadInput): Promise<void>;
}

export const CONVERSATION_OPENER = Symbol.for('ConversationOpener');
