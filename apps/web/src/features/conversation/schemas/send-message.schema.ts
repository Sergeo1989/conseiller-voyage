// T034 [Polish] — Schéma Zod d'envoi de message (validation client + action).
// Aligné sur le domaine API (MAX_MESSAGE_LENGTH = 4000).

import { z } from 'zod';

export const MAX_MESSAGE_LENGTH = 4000;

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
