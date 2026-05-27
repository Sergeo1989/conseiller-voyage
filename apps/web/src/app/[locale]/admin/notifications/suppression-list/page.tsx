// T127 — Page admin liste de suppression (RSC).
// Table paginée des emails en suppression list avec motif et date.

import { redirect } from 'next/navigation';
import { auth } from '../../../../../auth';
import type { Locale } from '../../../../../i18n';
import { apiClient, unwrapApi } from '../../../../_lib/api-client';

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface SuppressionListItem {
  id: string;
  emailHashHMAC: string;
  reason: string;
  source: string;
  addedAt: string;
  expiresAt: string | null;
}

interface SuppressionListResponse {
  items: ReadonlyArray<SuppressionListItem>;
  totalCount: number;
  page: number;
  pageSize: number;
}

export default async function SuppressionListPage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    const { locale } = await params;
    redirect(`/${locale}/connexion`);
  }

  const sp = await searchParams;
  const page = Number(sp.page ?? 1);
  const reason = typeof sp.reason === 'string' ? sp.reason : undefined;

  const path = `/api/admin/notifications/suppression-list?page=${page}&pageSize=20${reason ? `&reason=${reason}` : ''}`;
  const data = unwrapApi(await apiClient.get<SuppressionListResponse>(path), path);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Liste de suppression</h1>
        <span className="text-sm text-muted-foreground">{data.totalCount} entrée(s)</span>
      </div>

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Hash email</th>
              <th className="px-4 py-3 text-left font-medium">Motif</th>
              <th className="px-4 py-3 text-left font-medium">Source</th>
              <th className="px-4 py-3 text-left font-medium">Ajouté le</th>
              <th className="px-4 py-3 text-left font-medium">Expiration</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.items.map((item) => (
              <tr key={item.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs">{item.emailHashHMAC.slice(0, 12)}…</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">
                    {item.reason}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{item.source}</td>
                <td className="px-4 py-3">{new Date(item.addedAt).toLocaleDateString('fr-CA')}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {item.expiresAt ? new Date(item.expiresAt).toLocaleDateString('fr-CA') : '—'}
                </td>
                <td className="px-4 py-3">
                  {/* RemoveSuppressionModal — T131 */}
                  <span className="text-xs text-muted-foreground">Retirer…</span>
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Aucune entrée en suppression list.
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
