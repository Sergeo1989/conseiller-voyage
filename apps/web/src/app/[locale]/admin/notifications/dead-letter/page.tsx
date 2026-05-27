// T128 — Page admin dead letter queue (RSC).
// Table paginée des emails en dead_letter avec motif d'échec et retry.

import { redirect } from 'next/navigation';
import { auth } from '../../../../../auth';
import type { Locale } from '../../../../../i18n';
import { apiClient, unwrapApi } from '../../../../_lib/api-client';

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface DeadLetterItem {
  id: string;
  correlationId: string;
  sourceModule: string;
  eventType: string;
  templateId: string;
  emailHashHMAC: string;
  attempts: number;
  lastError: string | null;
  enqueuedAt: string;
  failedAt: string | null;
}

interface DeadLetterResponse {
  items: ReadonlyArray<DeadLetterItem>;
  totalCount: number;
  page: number;
  pageSize: number;
}

export default async function DeadLetterPage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    const { locale } = await params;
    redirect(`/${locale}/connexion`);
  }

  const sp = await searchParams;
  const page = Number(sp.page ?? 1);
  const sourceModule = typeof sp.sourceModule === 'string' ? sp.sourceModule : undefined;

  const path = `/api/admin/notifications/dead-letter?page=${page}&pageSize=20${sourceModule ? `&sourceModule=${sourceModule}` : ''}`;
  const data = unwrapApi(await apiClient.get<DeadLetterResponse>(path), path);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dead letter queue</h1>
        <span className="text-sm text-muted-foreground">{data.totalCount} entrée(s)</span>
      </div>

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Module</th>
              <th className="px-4 py-3 text-left font-medium">Template</th>
              <th className="px-4 py-3 text-left font-medium">Tentatives</th>
              <th className="px-4 py-3 text-left font-medium">Dernière erreur</th>
              <th className="px-4 py-3 text-left font-medium">Échoué le</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.items.map((item) => (
              <tr key={item.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                    {item.sourceModule}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{item.templateId}</td>
                <td className="px-4 py-3 text-center">{item.attempts}</td>
                <td className="px-4 py-3 max-w-xs truncate text-xs text-red-600">
                  {item.lastError ?? '—'}
                </td>
                <td className="px-4 py-3">
                  {item.failedAt ? new Date(item.failedAt).toLocaleDateString('fr-CA') : '—'}
                </td>
                <td className="px-4 py-3">
                  {/* RetryDeadLetterModal — T132 */}
                  <span className="text-xs text-muted-foreground">Relancer…</span>
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Aucune entrée en dead letter queue.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data.totalCount > 20 && (
        <div className="mt-4 flex gap-2 text-sm">
          {page > 1 && (
            <a href={`?page=${page - 1}`} className="text-primary hover:underline">
              ← Précédent
            </a>
          )}
          {page * 20 < data.totalCount && (
            <a href={`?page=${page + 1}`} className="text-primary hover:underline">
              Suivant →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
