// T032 — Contrat public `ConversationQueryPort` (feature 013).
//
// Interface de lecture seule exposée par le module matching (via
// `@cv/shared/matching`), consommée par 014 (dashboard conseiller) et 015
// (espace voyageur). N'envoie aucun message, ne déclenche aucune transition.
// `writable` est dérivé à la lecture (canWrite : état du lead + conseiller
// vérifié). Aucun champ transactionnel (ADR-0002) — les pièces jointes sont
// opaques (métadonnées seulement, l'URL signée s'obtient via un endpoint dédié).
//
// Cf. specs/014-conversation-conseiller-voyageur/contracts/conversation-query.port.md.
// NOTE : on réutilise le type interne `ConversationParticipant` (minuscules
// `conseiller`/`voyageur`) déjà exporté par `conversation-branded-ids`, plutôt
// que les libellés majuscules du contrat, pour une seule source de vérité.

import type { ConversationParticipant } from './conversation-branded-ids';

export const CONVERSATION_QUERY_PORT = Symbol.for('ConversationQueryPort');

export interface ConversationPaging {
  readonly page: number;
  readonly pageSize: number;
}

export interface AttachmentView {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  /** false si supprimée (Loi 25) ou upload non finalisé. Jamais d'URL ici. */
  readonly available: boolean;
}

export interface MessageView {
  readonly id: string;
  readonly author: ConversationParticipant;
  readonly body: string | null; // null si anonymisé (Loi 25)
  readonly createdAt: Date;
  readonly attachments: ReadonlyArray<AttachmentView>;
}

export interface ConversationView {
  readonly id: string;
  readonly leadId: string;
  readonly conseillerId: string;
  readonly briefId: string | null; // null si brief anonymisé
  readonly writable: boolean; // dérivé : canWrite(leadState, conseillerVerifie)
  readonly openedAt: Date;
  readonly lastMessageAt: Date | null;
}

export interface ConversationListPage {
  readonly items: ReadonlyArray<ConversationView>;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface ConversationMessagesPage {
  readonly conversation: ConversationView;
  readonly items: ReadonlyArray<MessageView>;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface ConversationQueryPort {
  /** Fils d'un conseiller (propriétaire). */
  listForConseiller(
    conseillerId: string,
    paging: ConversationPaging,
  ): Promise<ConversationListPage>;
  /** Fils d'un voyageur (tous ses conseillers). */
  listForVoyageur(voyageurRef: string, paging: ConversationPaging): Promise<ConversationListPage>;
  /**
   * Page de messages d'un fil. `null` si le fil n'existe pas OU si le requérant
   * n'en est pas membre (aucune fuite d'information).
   */
  getMessages(
    conversationId: string,
    requester: ConversationParticipant,
    requesterRef: string,
    paging: ConversationPaging,
  ): Promise<ConversationMessagesPage | null>;
}
