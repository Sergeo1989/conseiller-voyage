// Surface publique du slice `leads` (feature 014, dashboard conseiller).
// Inter-slice : importer UNIQUEMENT via cet index (Principe VIII.a).

export { getLead, listLeads } from './api/leads-api';
export type { ListLeadsParams } from './api/leads-api';
export type {
  LeadAction,
  LeadBriefSummary,
  LeadListPage,
  LeadState,
  LeadTransitionView,
  LeadView,
} from './schemas/lead';
export { LeadDetail } from './ui/LeadDetail';
export { LeadList } from './ui/LeadList';
export { LeadStatusBadge } from './ui/LeadStatusBadge';
