// T034 [Polish] — Server Action : envoi d'un message (conseiller).
//
// Validation Zod côté serveur, délègue à ConseillerConversationController via
// apiClient (Idempotency-Key auto-généré, FR-004). Retourne ActionResult — pas
// de `throw` métier (Principe VIII.a §3). Le côté voyageur relève de 015.

'use server';

import { apiClient } from '@/shared/lib/http';
import { type ActionResult, err, ok } from '@/shared/lib/result';
import { sendMessageSchema } from '../schemas/send-message.schema';

export async function sendMessageAction(input: {
  conversationId: string;
  body: string;
}): Promise<ActionResult<{ messageId: string }>> {
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return err(
      'INVALID_MESSAGE',
      first?.message ?? 'Message invalide.',
      first?.path?.[0]?.toString(),
    );
  }

  const res = await apiClient.post<{ messageId: string }>(
    `/api/matching/conseiller/conversations/${parsed.data.conversationId}/messages`,
    { body: parsed.data.body },
    { idempotent: true },
  );
  if (!res.ok) {
    return err('SEND_FAILED', extractApiError(res.errorBody));
  }
  return ok({ messageId: res.data.messageId });
}

function extractApiError(body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>;
    if (typeof b.message === 'string') return b.message;
  }
  return 'Échec de l’envoi. Réessayez.';
}
