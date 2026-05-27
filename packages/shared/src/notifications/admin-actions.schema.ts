// T004 — Schémas Zod des actions admin notifications.
//
// Partagés entre apps/api (validation côté NestJS controllers) et
// apps/web (Server Actions + react-hook-form resolver).
//
// Toutes les actions sensibles exigent un `reason` libre min 10
// caractères pour audit (FR-028, FR-029).

import { z } from 'zod';

// --- POST /admin/notifications/suppression-list/:id/remove ---

export const RemoveFromSuppressionListSchema = z
  .object({
    reason: z
      .string()
      .min(10, 'Motif obligatoire d’au moins 10 caractères (FR-028).')
      .max(1000, 'Motif trop long (max 1000 caractères).'),
  })
  .strict();
export type RemoveFromSuppressionListBody = z.infer<typeof RemoveFromSuppressionListSchema>;

// --- POST /admin/notifications/dead-letter/:id/retry ---

export const RetryDeadLetterSchema = z
  .object({
    reason: z
      .string()
      .min(10, 'Motif obligatoire d’au moins 10 caractères (FR-029).')
      .max(1000, 'Motif trop long (max 1000 caractères).'),
  })
  .strict();
export type RetryDeadLetterBody = z.infer<typeof RetryDeadLetterSchema>;

// --- GET /admin/notifications/suppression-list query params ---

export const SuppressionReasonSchema = z.enum([
  'hard_bounce',
  'soft_bounce_repeated',
  'complaint',
  'manual',
]);
export type SuppressionReason = z.infer<typeof SuppressionReasonSchema>;

export const SuppressionListQuerySchema = z
  .object({
    reason: SuppressionReasonSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export type SuppressionListQuery = z.infer<typeof SuppressionListQuerySchema>;

// --- GET /admin/notifications/dead-letter query params ---

export const DeadLetterQuerySchema = z
  .object({
    sourceModule: z
      .enum(['conformite', 'identite', 'intake', 'matching', 'facturation'])
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export type DeadLetterQuery = z.infer<typeof DeadLetterQuerySchema>;

// --- GET /admin/notifications/audit query params (cursor pagination) ---

export const AuditQuerySchema = z
  .object({
    cursor: z.string().uuid().nullable().optional(),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    eventType: z.string().max(120).optional(),
    actorId: z.string().uuid().optional(),
  })
  .strict();
export type AuditQuery = z.infer<typeof AuditQuerySchema>;

// --- Path params commun ---

export const NotificationIdParamSchema = z.object({ id: z.string().uuid() }).strict();
export type NotificationIdParam = z.infer<typeof NotificationIdParamSchema>;

export const CorrelationIdParamSchema = z.object({ correlationId: z.string().uuid() }).strict();
export type CorrelationIdParam = z.infer<typeof CorrelationIdParamSchema>;
