// T129 — Page admin journal d'audit notifications (RSC, cursor pagination).

import { redirect } from 'next/navigation';
import { auth } from '../../../../../auth';
import type { Locale } from '../../../../../i18n';
import { apiClient, unwrapApi } from '../../../../_lib/api-client';

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface AuditItem {
  id: string;
  eventType: string;
  actorId: string;
  actorRole: string;
  targetEmailHashHMAC: string | null;
  reason: string | null;
  occurredAt: string;
}

interface AuditResponse {
  items: ReadonlyArray<AuditItem>;
  nextCursor: string | null;
}

export default async function AuditPage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    const { locale } = await params;
    redirect(`/${locale}/connexion`);
  }

  const sp = await searchParams;
  const cursor = typeof sp.cursor === 'string' ? sp.cursor : undefined;
  const eventType = typeof sp.eventType === 'string' ? sp.eventType : undefined;

  const params_ = new URLSearchParams({ pageSize: '20' });
  if (cursor) params_.set('cursor', cursor);
  if (eventType) params_.set('eventType', eventType);

  const auditPath = `/api/admin/notifications/audit?${params_.toString()}`;
  const data = unwrapApi(await apiClient.get<AuditResponse>(auditPath), auditPath);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Journal d&apos;audit</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Historique des actions admin et événements système sur les notifications.
        </p>
      </div>

      <ul className="space-y-2">
        {data.items.map((item) => (
          <li key={item.id} className="rounded-lg border bg-card p-4 text-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="font-mono text-xs bg-slate-100 rounded px-1.5 py-0.5">
                  {item.eventType}
                </span>
                {item.reason && <p className="mt-1 text-muted-foreground">{item.reason}</p>}
              </div>
              <time dateTime={item.occurredAt} className="shrink-0 text-xs text-muted-foreground">
                {new Date(item.occurredAt).toLocaleString('fr-CA')}
              </time>
            </div>
            <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
              <span>Acteur : {item.actorRole}</span>
              {item.targetEmailHashHMAC && (
                <span>Hash : {item.targetEmailHashHMAC.slice(0, 8)}…</span>
              )}
            </div>
          </li>
        ))}

        {data.items.length === 0 && (
          <li className="rounded-lg border p-8 text-center text-muted-foreground">
            Aucune entrée d&apos;audit.
          </li>
        )}
      </ul>

      {data.nextCursor && (
        <div className="mt-4">
          <a
            href={`?cursor=${data.nextCursor}${eventType ? `&eventType=${eventType}` : ''}`}
            className="text-sm text-primary hover:underline"
          >
            Charger plus →
          </a>
        </div>
      )}
    </div>
  );
}
