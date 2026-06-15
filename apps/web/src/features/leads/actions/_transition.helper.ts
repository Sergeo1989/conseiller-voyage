// T010 [014] — Helper interne des transitions de lead (server-only).
// Délègue aux endpoints conseiller de 012 (Idempotency-Key auto), mappe les
// codes (409 conflit / 422 invalide / 403 interdit) en ActionResult, et
// revalide les vues du lead. Aucune logique métier ré-implémentée.

import 'server-only';
import { toUrlLocale } from '@/i18n';
import { type ApiFailure, type ApiResult, apiClient } from '@/shared/lib/http';
import { type ActionResult, err, ok } from '@/shared/lib/result';
import { revalidatePath } from 'next/cache';
import { type LeadView, reasonSchema } from '../schemas/lead';

interface TransitionInput {
  readonly leadId: string;
  readonly locale: string;
  readonly verb: 'accept' | 'refuse' | 'quote-sent' | 'booking-confirmed' | 'lost';
  readonly reason?: string;
}

export async function callLeadTransition(input: TransitionInput): Promise<ActionResult<LeadView>> {
  // Validation Zod côté serveur (Principe IX) avant tout appel : rejette un
  // leadId malformé ou une raison hors limite sans atteindre l'API.
  const parsed = reasonSchema.safeParse({ leadId: input.leadId, reason: input.reason });
  if (!parsed.success) {
    return err('VALIDATION', 'Requête invalide.');
  }
  const body = parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {};

  let res: ApiResult<LeadView> | ApiFailure;
  try {
    res = await apiClient.post<LeadView>(
      `/api/matching/conseiller/leads/${parsed.data.leadId}/${input.verb}`,
      body,
      { idempotent: true },
    );
  } catch {
    // Panne réseau / API injoignable : retour gracieux plutôt que throw qui
    // remonterait à la error boundary (adversarial #2).
    return err('ACTION_ERROR', 'Action impossible pour le moment. Réessayez.');
  }
  if (!res.ok) return mapError(res.status, res.errorBody);

  const urlLocale = toUrlLocale(input.locale);
  revalidatePath(`/${urlLocale}/conseiller/leads`);
  revalidatePath(`/${urlLocale}/conseiller/leads/${parsed.data.leadId}`);
  return ok(res.data);
}

function mapError(status: number, body: unknown): ActionResult<never> {
  const code =
    status === 409
      ? 'CONFLICT'
      : status === 422
        ? 'INVALID_TRANSITION'
        : status === 403
          ? 'FORBIDDEN'
          : 'ACTION_ERROR';
  return err(code, extractMessage(body) ?? defaultMessage(code));
}

function extractMessage(body: unknown): string | null {
  if (typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>;
    if (typeof b.message === 'string') return b.message;
  }
  return null;
}

function defaultMessage(code: string): string {
  switch (code) {
    case 'CONFLICT':
      return 'L’état du lead a changé. Rafraîchissez la page avant de réessayer.';
    case 'INVALID_TRANSITION':
      return 'Cette action n’est pas possible depuis l’état actuel du lead.';
    case 'FORBIDDEN':
      return 'Action non autorisée (statut vérifié requis).';
    default:
      return 'Action impossible pour le moment. Réessayez.';
  }
}
