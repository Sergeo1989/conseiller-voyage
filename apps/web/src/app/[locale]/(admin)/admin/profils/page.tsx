// T121 — Console admin profils — liste paginée avec filtre statut.
//
// Server Component qui :
//   1. Vérifie session admin (redirect si rôle != admin).
//   2. Charge la liste via apiClient (GET /api/admin/profils).
//   3. Affiche table 5 colonnes + filtres statut + pagination.

import { auth } from '@/auth';
import { type Locale, toUrlLocale } from '@/i18n';
import { apiClient } from '@/shared/lib/http';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type StatutProfil = 'incomplet' | 'pret' | 'masque_admin' | 'anonymise';

interface ListResponse {
  items: ReadonlyArray<{
    profilId: string;
    authUserId: string;
    slug: string | null;
    statut: StatutProfil;
    nomLegal: string;
    publishedAt: string | null;
    updatedAt: string;
  }>;
  totalCount: number;
  page: number;
  pageSize: number;
}

const STATUT_LABELS: Record<StatutProfil, string> = {
  incomplet: 'Incomplet',
  pret: 'Prêt',
  masque_admin: 'Masqué (admin)',
  anonymise: 'Anonymisé Loi 25',
};

const STATUT_FILTERS: readonly (StatutProfil | 'tous')[] = [
  'tous',
  'incomplet',
  'pret',
  'masque_admin',
  'anonymise',
];

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminProfilsListPage({
  params,
  searchParams,
}: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  const urlLocale = toUrlLocale(locale);
  const sp = await searchParams;

  const session = await auth();
  if (!session?.user) {
    redirect(`/${urlLocale}/connexion?callbackUrl=/${urlLocale}/admin/profils`);
  }
  if (session.user.role !== 'admin') {
    redirect(`/${urlLocale}/conseiller`);
  }

  const statut = parseStatut(sp.statut);
  const page = parsePositiveInt(sp.page, 1);
  const pageSize = 20;

  const query = new URLSearchParams();
  if (statut !== 'tous') query.set('statut', statut);
  query.set('page', String(page));
  query.set('pageSize', String(pageSize));

  const res = await apiClient.get<ListResponse>(`/api/admin/profils?${query.toString()}`);

  if (!res.ok) {
    return (
      <main style={mainStyle}>
        <h1>Modération des profils conseillers</h1>
        <p style={errorStyle}>Erreur API ({res.status}). Vérifiez votre session admin et l'API.</p>
      </main>
    );
  }

  const { items, totalCount } = res.data;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <main style={mainStyle}>
      <h1>Modération des profils conseillers</h1>
      <p style={subtitleStyle}>
        Console de modération admin — actions auditées immuablement (Principe IX).
      </p>

      <nav aria-label="Filtrer par statut" style={filterBarStyle}>
        {STATUT_FILTERS.map((s) => (
          <Link
            key={s}
            href={s === 'tous' ? '?' : `?statut=${s}`}
            style={statut === s ? activeFilterStyle : filterStyle}
          >
            {s === 'tous' ? 'Tous' : STATUT_LABELS[s]}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p style={emptyStyle}>Aucun profil ne correspond à ce filtre.</p>
      ) : (
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Nom légal</th>
                <th style={thStyle}>Statut</th>
                <th style={thStyle}>Slug</th>
                <th style={thStyle}>Mis à jour</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.profilId}>
                  <td style={tdStyle}>{item.nomLegal}</td>
                  <td style={tdStyle}>
                    <StatutBadge statut={item.statut} />
                  </td>
                  <td style={tdStyle}>
                    {item.slug ? (
                      <code style={{ fontSize: 12 }}>{item.slug}</code>
                    ) : (
                      <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>—</span>
                    )}
                  </td>
                  <td style={tdStyle}>{formatDateFrCa(item.updatedAt)}</td>
                  <td style={tdStyle}>
                    <Link
                      href={`/${urlLocale}/admin/profils/${item.profilId}`}
                      style={linkButtonStyle}
                    >
                      Voir le détail
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav aria-label="Pagination" style={paginationStyle}>
        <span>
          {from}–{to} sur {totalCount}
        </span>
        <span>
          Page {page} / {totalPages}
        </span>
        <span>
          {page > 1 && (
            <Link
              href={statut === 'tous' ? `?page=${page - 1}` : `?statut=${statut}&page=${page - 1}`}
              style={pagerLinkStyle}
            >
              ← Précédent
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={statut === 'tous' ? `?page=${page + 1}` : `?statut=${statut}&page=${page + 1}`}
              style={pagerLinkStyle}
            >
              Suivant →
            </Link>
          )}
        </span>
      </nav>
    </main>
  );
}

function StatutBadge({ statut }: { statut: StatutProfil }) {
  const colors: Record<StatutProfil, { bg: string; color: string }> = {
    incomplet: { bg: '#fef3c7', color: '#92400e' },
    pret: { bg: '#d1fae5', color: '#065f46' },
    masque_admin: { bg: '#fed7aa', color: '#9a3412' },
    anonymise: { bg: '#e5e7eb', color: '#4b5563' },
  };
  const c = colors[statut];
  return (
    <span
      style={{
        background: c.bg,
        color: c.color,
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      {STATUT_LABELS[statut]}
    </span>
  );
}

// ---- Helpers ----

function parseStatut(raw: string | string[] | undefined): StatutProfil | 'tous' {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  if (
    candidate === 'incomplet' ||
    candidate === 'pret' ||
    candidate === 'masque_admin' ||
    candidate === 'anonymise'
  ) {
    return candidate;
  }
  return 'tous';
}

function parsePositiveInt(raw: string | string[] | undefined, defaultValue: number): number {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  if (!candidate) return defaultValue;
  const n = Number.parseInt(candidate, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultValue;
}

function formatDateFrCa(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('fr-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---- Styles ----

const mainStyle = {
  maxWidth: 1100,
  margin: '32px auto',
  padding: '0 24px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const subtitleStyle = { color: '#6b7280', margin: '4px 0 24px 0' };

const filterBarStyle = { display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' as const };

const filterStyle = {
  padding: '6px 12px',
  borderRadius: 4,
  background: '#f3f4f6',
  color: '#1f2937',
  textDecoration: 'none',
};

const activeFilterStyle = { ...filterStyle, background: '#2563eb', color: '#fff' };

const tableStyle = { width: '100%', borderCollapse: 'collapse' as const, margin: '16px 0' };

const thStyle = {
  textAlign: 'left' as const,
  padding: '8px 12px',
  borderBottom: '2px solid #d1d5db',
  background: '#f9fafb',
};

const tdStyle = { padding: '12px', borderBottom: '1px solid #e5e7eb' };

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

const pagerLinkStyle = { marginLeft: 12, color: '#2563eb', textDecoration: 'none' };

const errorStyle = { color: '#dc2626', padding: 16, background: '#fef2f2', borderRadius: 4 };

const emptyStyle = { padding: 24, textAlign: 'center' as const, color: '#6b7280' };
