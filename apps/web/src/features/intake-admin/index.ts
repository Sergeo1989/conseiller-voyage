// T125 — Barrel public du slice intake-admin (admin US5).

export {
  pushBriefToConseillerAction,
  type PushBriefToConseillerActionResult,
} from './actions/push-brief-to-conseiller.action';
export { fetchAdminBriefDetail, fetchUnmatchedBriefs } from './infrastructure/fetch-admin-briefs';
export { AdminBriefDetail } from './ui/AdminBriefDetail';
export { PushToConseillerForm } from './ui/PushToConseillerForm';
export { UnmatchedBriefsTable } from './ui/UnmatchedBriefsTable';
