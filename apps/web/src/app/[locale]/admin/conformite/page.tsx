// T078 — Page admin "File de revue" paginée.
// Server Component qui charge la file via apiClient (T080), avec
// pagination cursor-less (page/pageSize) et filtre par statut via
// query params.

import { apiClient } from '@/shared/lib/http';
import { formatDate } from '@cv/shared/conformite';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth } from '../../../../auth';
import { type Locale, toUrlLocale } from '../../../../i18n';

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface QueueApiResponse {
  items: ReadonlyArray<{
    submissionId: string;
    conseillerComplianceId: string;
    submittedAt: string;
    status: 'pending' | 'approved' | 'refused';
  }>;
  totalCount: number;
  page: number;
  pageSize: number;
}

export default async function AdminQueuePage({
  params,
  searchParams,
}: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  const urlLocale = toUrlLocale(locale);
  const sp = await searchParams;

  const session = await auth();
  if (!session?.user) {
    redirect(`/${urlLocale}/login?callbackUrl=/${urlLocale}/admin/conformite`);
  }

  const t = await getTranslations({ locale, namespace: 'conformite.admin.queue' });
  const tShared = await getTranslations({ locale, namespace: 'conformite.shared' });

  const status = parseStatus(sp.status);
  const page = parsePositiveInt(sp.page, 1);
  const pageSize = 20;

  const result = await apiClient.get<QueueApiResponse>(
    `/api/conformite/admin/queue?status=${status}&page=${page}&pageSize=${pageSize}`,
  );

  if (!result.ok) {
    return (
      <main style={mainStyle}>
        <h1>{t('title')}</h1>
        <p style={{ color: '#dc2626' }}>Erreur API ({result.status}).</p>
      </main>
    );
  }

  const data = result.data;
  const totalPages = Math.max(1, Math.ceil(data.totalCount / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, data.totalCount);

  return (
    <main style={mainStyle}>
      <h1>{t('title')}</h1>
      <p style={{ color: '#6b7280' }}>{t('subtitle')}</p>

      <nav aria-label={t('filterByStatus')} style={filterBarStyle}>
        {(['pending', 'approved', 'refused'] as const).map((s) => (
          <Link
            key={s}
            href={`?status=${s}`}
            style={status === s ? activeFilterStyle : filterStyle}
          >
            {renderStatus(s, tShared)}
          </Link>
        ))}
      </nav>

      {data.items.length === 0 ? (
        <p>{t('noResults')}</p>
      ) : (
        // Wrapper overflow-x : la table 5 colonnes déborde sur mobile/iPad
        // portrait (< 768px). Sans ce wrapper, c'est la page entière qui
        // scrollait latéralement. Avec, le scroll est contenu à la table.
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>{t('tableHeaders.submissionId')}</th>
                <th style={thStyle}>{t('tableHeaders.conseiller')}</th>
                <th style={thStyle}>{t('tableHeaders.submittedAt')}</th>
                <th style={thStyle}>{t('tableHeaders.status')}</th>
                <th style={thStyle}>{t('tableHeaders.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.submissionId}>
                  <td style={tdStyle}>
                    <code style={{ fontSize: 12 }}>{item.submissionId.slice(0, 8)}…</code>
                  </td>
                  <td style={tdStyle}>
                    <code style={{ fontSize: 12 }}>{item.conseillerComplianceId.slice(0, 8)}…</code>
                  </td>
                  <td style={tdStyle}>{formatDate(new Date(item.submittedAt), locale)}</td>
                  <td style={tdStyle}>{renderStatus(item.status, tShared)}</td>
                  <td style={tdStyle}>
                    <Link
                      href={`/${urlLocale}/admin/conformite/${item.submissionId}`}
                      style={linkButtonStyle}
                    >
                      {t('viewDetails')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav aria-label="Pagination" style={paginationStyle}>
        <span>{t('pagination.showing', { from, to, total: data.totalCount })}</span>
        <span>{t('pagination.page', { current: page, total: totalPages })}</span>
        <span>
          {page > 1 && (
            <Link href={`?status=${status}&page=${page - 1}`} style={pagerLinkStyle}>
              ← {t('pagination.previous')}
            </Link>
          )}
          {page < totalPages && (
            <Link href={`?status=${status}&page=${page + 1}`} style={pagerLinkStyle}>
              {t('pagination.next')} →
            </Link>
          )}
        </span>
      </nav>
    </main>
  );
}

// --- Helpers ---

function parseStatus(raw: string | string[] | undefined): 'pending' | 'approved' | 'refused' {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  if (candidate === 'approved' || candidate === 'refused') return candidate;
  return 'pending';
}

function parsePositiveInt(raw: string | string[] | undefined, defaultValue: number): number {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  if (!candidate) return defaultValue;
  const n = Number.parseInt(candidate, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultValue;
}

function renderStatus(
  s: 'pending' | 'approved' | 'refused',
  tShared: Awaited<ReturnType<typeof getTranslations>>,
): string {
  if (s === 'approved') return tShared('decisionApproved');
  if (s === 'refused') return tShared('decisionRefused');
  return tShared('decisionPending');
}

// --- Styles ---

const mainStyle = {
  maxWidth: 1100,
  margin: '32px auto',
  padding: '0 24px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const filterBarStyle = {
  display: 'flex',
  gap: 8,
  margin: '16px 0',
};

const filterStyle = {
  padding: '6px 12px',
  borderRadius: 4,
  background: '#f3f4f6',
  color: '#1f2937',
  textDecoration: 'none',
};

const activeFilterStyle = {
  ...filterStyle,
  background: '#2563eb',
  color: '#fff',
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  margin: '16px 0',
};

const thStyle = {
  textAlign: 'left' as const,
  padding: '8px 12px',
  borderBottom: '2px solid #d1d5db',
  background: '#f9fafb',
};

const tdStyle = {
  padding: '12px',
  borderBottom: '1px solid #e5e7eb',
};

const linkButtonStyle = {
  display: 'inline-block',
  background: '#2563eb',
  color: '#fff',
  padding: '6px 12px',
  borderRadius: 4,
  textDecoration: 'none',
  fontSize: 14,
};

const paginationStyle = {
  display: 'flex',
  justifyContent: 'space-between' as const,
  alignItems: 'center' as const,
  margin: '16px 0',
  color: '#6b7280',
};

const pagerLinkStyle = {
  marginLeft: 12,
  color: '#2563eb',
  textDecoration: 'none',
};
