// T002 — Branded IDs de la conversation (feature 014). Même pattern que
// lead-branded-ids (z.brand sert de brand TS).

import { z } from 'zod';

/** Auteur d'un message / destinataire d'une notification (aligné enum Prisma). */
export type ConversationParticipant = 'conseiller' | 'voyageur';

const uuidSchema = z.string().uuid();

export const ConversationIdSchema = uuidSchema.brand<'ConversationId'>();
export type ConversationId = z.infer<typeof ConversationIdSchema>;

export const MessageIdSchema = uuidSchema.brand<'MessageId'>();
export type MessageId = z.infer<typeof MessageIdSchema>;

export const AttachmentIdSchema = uuidSchema.brand<'AttachmentId'>();
export type AttachmentId = z.infer<typeof AttachmentIdSchema>;

export function asConversationId(uuid: string): ConversationId {
  return ConversationIdSchema.parse(uuid);
}

export function asMessageId(uuid: string): MessageId {
  return MessageIdSchema.parse(uuid);
}

export function asAttachmentId(uuid: string): AttachmentId {
  return AttachmentIdSchema.parse(uuid);
}
