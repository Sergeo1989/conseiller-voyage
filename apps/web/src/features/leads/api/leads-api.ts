// T005 [014] — Lecture des leads (server-only, appelée depuis les RSC).
// Consomme les endpoints conseiller de 012 via apiClient (session cookie).
// Aucune logique métier : simple lecture + propagation.

import 'server-only';
import { apiClient } from '@/shared/lib/http';
import type { LeadListPage, LeadState, LeadView } from '../schemas/lead';

export interface ListLeadsParams {
  readonly page?: number;
  readonly pageSize?: number;
  readonly state?: LeadState;
}

/** Liste paginée des leads du conseiller courant (cloisonnement côté API). */
export async function listLeads(params: ListLeadsParams = {}): Promise<LeadListPage> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('pageSize', String(params.pageSize));
  if (params.state) qs.set('state', params.state);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await apiClient.get<LeadListPage>(`/api/matching/conseiller/leads${suffix}`);
  if (!res.ok) {
    return { items: [], page: params.page ?? 1, pageSize: params.pageSize ?? 20, total: 0 };
  }
  return res.data;
}

/** Détail d'un lead (auto-`vu` à la 1re consultation côté 012). `null` si introuvable/refusé. */
export async function getLead(leadId: string): Promise<LeadView | null> {
  const res = await apiClient.get<LeadView>(`/api/matching/conseiller/leads/${leadId}`);
  return res.ok ? res.data : null;
}
