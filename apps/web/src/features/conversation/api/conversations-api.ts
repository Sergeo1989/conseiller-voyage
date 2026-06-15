// T013/T014 [014] — Lecture des conversations (server-only, RSC dashboard).
// Consomme les endpoints conseiller de 013 via apiClient. Aucune PII de contact,
// aucun champ transactionnel.

import 'server-only';
import { apiClient } from '@/shared/lib/http';

export interface ConversationListItem {
  readonly id: string;
  readonly leadId: string;
  readonly writable: boolean;
  readonly lastMessageAt: string | null;
  readonly openedAt: string;
}

export interface ThreadAttachment {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly available: boolean;
}

export interface ThreadMessage {
  readonly id: string;
  readonly author: 'conseiller' | 'voyageur';
  readonly body: string | null;
  readonly createdAt: string;
  readonly attachments: ThreadAttachment[];
}

export interface ThreadPage {
  readonly conversation: {
    readonly id: string;
    readonly leadId: string;
    readonly writable: boolean;
    readonly openedAt: string;
    readonly lastMessageAt: string | null;
  };
  readonly items: ThreadMessage[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

interface ConversationListResponse {
  items: ConversationListItem[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Résultat de liste : `error` distingue une panne API d'une liste vide
 * (sinon un incident afficherait « aucune conversation »).
 */
export interface ConversationListResult {
  readonly items: ConversationListItem[];
  readonly error: boolean;
}

/** Liste des fils du conseiller courant (cloisonnement côté API). */
export async function listConversations(): Promise<ConversationListResult> {
  const res = await apiClient.get<ConversationListResponse>(
    '/api/matching/conseiller/conversations?page=1&pageSize=50',
  );
  return res.ok ? { items: res.data.items, error: false } : { items: [], error: true };
}

/** Page de messages d'un fil (entête `writable` + pièces jointes). `null` si refusé/introuvable. */
export async function getThread(conversationId: string, page = 1): Promise<ThreadPage | null> {
  const res = await apiClient.get<ThreadPage>(
    `/api/matching/conseiller/conversations/${conversationId}/messages?page=${page}&pageSize=50`,
  );
  return res.ok ? res.data : null;
}
