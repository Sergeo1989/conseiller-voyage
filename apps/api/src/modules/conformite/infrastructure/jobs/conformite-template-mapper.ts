// T057 — Mapping eventType conformite_outbox → templateId react-email.
//
// Seuls les événements listés ici génèrent un courriel. Les événements
// purement internes (conformite.status.changed, etc.) retournent null.
//
// Cf. outbox-source-contract.md section 6 (adaptations pour les eventTypes
// réels de l'implémentation, qui diffèrent légèrement des exemples du contrat).
//
// T056 (audit) : liste finale des eventType publiés par les use cases conformite :
//   - conformite.dossier.decided  (payload.decision = 'approved' | 'refused')
//   - conformite.dossier.submitted
//   - conformite.expiration.reminder_sent
//   - conformite.erasure.completed
//   - conformite.status.changed  ← interne, pas d'email
//   - conformite.erasure.requested ← interne, pas d'email

export function mapConformiteEventToTemplateId(
  eventType: string,
  payload: Record<string, unknown>,
): string | null {
  switch (eventType) {
    case 'conformite.dossier.decided':
      if (payload.decision === 'approved') return 'conformite.dossier-approved';
      if (payload.decision === 'refused') return 'conformite.dossier-refused';
      return null;
    case 'conformite.dossier.submitted':
      return 'conformite.dossier-submitted';
    case 'conformite.expiration.reminder_sent':
      return 'conformite.expiration-reminder';
    case 'conformite.erasure.completed':
      return 'conformite.erasure-confirmed';
    default:
      return null;
  }
}
