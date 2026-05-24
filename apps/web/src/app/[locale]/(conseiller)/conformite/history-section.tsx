// T110 — Composant historique d'événements + avertissement renouvellement J-30.
// Server Component (les server actions client navigation gèrent le "Suivant").

import { formatDate } from '@cv/shared/conformite';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { Locale } from '../../../../i18n';
import { apiClient } from '../../../_lib/api-client';

const PAGE_SIZE = 5;

interface AuditItem {
  id: string;
  eventType: string;
  actorRole: 'conseiller' | 'admin' | 'system';
  occurredAt: string;
  payload: Record<string, unknown>;
}

interface AuditResponse {
  items: AuditItem[];
  nextCursor: string | null;
}

interface HistorySectionProps {
  readonly locale: Locale;
  readonly nextRenewalDate: Date | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RENEWAL_WARNING_DAYS = 30;

export async function HistorySection({
  locale,
  nextRenewalDate,
}: HistorySectionProps): Promise<ReactNode> {
  const t = await getTranslations({ locale });
  const result = await apiClient.get<AuditResponse>(
    `/api/conformite/me/audit?pageSize=${PAGE_SIZE}`,
  );

  const events = result.ok ? result.data.items : [];
  const showWarning =
    nextRenewalDate !== null &&
    nextRenewalDate.getTime() - Date.now() <= RENEWAL_WARNING_DAYS * MS_PER_DAY;

  return (
    <section style={cardStyle} aria-labelledby="history-heading">
      <h2 id="history-heading">Historique d'événements</h2>
      {showWarning && nextRenewalDate && (
        <p style={warningStyle}>
          ⚠ Votre certificat expire le {formatDate(nextRenewalDate, locale)}. Pensez à renouveler
          pour éviter une suspension automatique.
        </p>
      )}
      {events.length === 0 ? (
        <p style={{ color: '#6b7280' }}>Aucun événement enregistré pour l'instant.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {events.map((e) => (
            <li key={e.id} style={listItemStyle}>
              <strong>{readableEventType(e.eventType, t)}</strong>
              <br />
              <span style={{ color: '#6b7280', fontSize: 14 }}>
                {formatDate(new Date(e.occurredAt), locale)} — {e.actorRole}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function readableEventType(
  eventType: string,
  _t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  // Map des eventType vers libellés FR (i18n complet possible en feature ultérieure)
  const map: Record<string, string> = {
    'dossier.submitted': 'Dossier soumis',
    'dossier.approved': 'Dossier approuvé',
    'dossier.refused': 'Dossier refusé',
    'status.changed_to_verified': 'Statut basculé en vérifié',
    'status.changed_to_suspended': 'Statut basculé en suspendu',
    'status.changed_to_revoked': 'Statut basculé en révoqué',
    'expiration.reminder_sent_60d': 'Rappel J-60 envoyé',
    'expiration.reminder_sent_30d': 'Rappel J-30 envoyé',
    'expiration.reminder_sent_7d': 'Rappel J-7 envoyé',
    'expiration.auto_suspended': 'Suspension automatique (expiration)',
    'permit.cascade_applied': 'Cascade retrait permis',
  };
  return map[eventType] ?? eventType;
}

const cardStyle = {
  background: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: '16px 20px',
  margin: '16px 0',
};

const listItemStyle = {
  padding: '12px 0',
  borderBottom: '1px solid #e5e7eb',
};

const warningStyle = {
  background: '#fef3c7',
  border: '1px solid #f59e0b',
  color: '#78350f',
  padding: 12,
  borderRadius: 6,
  fontWeight: 500,
};
