// T077 — Page conseiller "Mon dossier de conformité" (overview).
//
// Server Component qui :
//   1. Lit la session via auth() — redirige vers /login si absente.
//   2. Charge le dossier via apiClient.get('/api/conformite/me').
//   3. Affiche le statut courant + listes certificats/affiliations,
//      avec un CTA "Soumettre un nouveau dossier" si pas de dossier
//      ou si dernier dossier expire bientôt.
//
// Toutes les strings passent par getTranslations() — convention T074a.

import { auth } from '@/auth';
import { HistorySection } from '@/features/conformite/ui/HistorySection';
import { type Locale, toUrlLocale } from '@/i18n';
import { apiClient } from '@/shared/lib/http';
import { formatDate } from '@cv/shared/conformite';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

interface DossierApiShape {
  conseillerComplianceId: string;
  status: 'pending' | 'verified' | 'suspended' | 'revoked';
  lastVerifiedAt: string | null;
  lastStatusChangeAt: string;
  consentToProcessGivenAt: string | null;
  certificates: ReadonlyArray<{
    id: string;
    province: 'QC' | 'ON';
    certificateNumber: string;
    issuedAt: string;
    expiresAt: string;
    decision: 'pending' | 'approved' | 'refused';
  }>;
  affiliations: ReadonlyArray<{
    id: string;
    agencyName: string;
    agencyPermitNumber: string;
    agencyProvince: 'QC' | 'ON';
    decision: 'pending' | 'approved' | 'refused';
    inactivatedAt: string | null;
  }>;
}

export default async function ConseillerOverviewPage({ params }: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  const urlLocale = toUrlLocale(locale);
  const session = await auth();
  if (!session?.user) {
    redirect(`/${urlLocale}/login?callbackUrl=/${urlLocale}/conseiller/conformite`);
  }

  const t = await getTranslations({ locale, namespace: 'conformite' });
  const tCommon = await getTranslations({ locale });

  const result = await apiClient.get<DossierApiShape>('/api/conformite/me');

  // 404 → pas de dossier — afficher CTA d'ouverture
  if (!result.ok && result.status === 404) {
    return (
      <main style={mainStyle}>
        <h1>{t('conseiller.overview.title')}</h1>
        <p>{t('conseiller.overview.noDossier')}</p>
        <p>
          <Link href={`/${urlLocale}/conseiller/conformite/soumettre`} style={ctaStyle}>
            {t('conseiller.overview.ctaSubmit')}
          </Link>
        </p>
      </main>
    );
  }

  if (!result.ok) {
    return (
      <main style={mainStyle}>
        <h1>{t('conseiller.overview.title')}</h1>
        <p style={{ color: '#dc2626' }}>{tCommon('errors.generic')}</p>
      </main>
    );
  }

  const dossier = result.data;

  return (
    <main style={mainStyle}>
      <h1>{t('conseiller.overview.title')}</h1>
      <p style={{ color: '#6b7280' }}>{t('conseiller.overview.subtitle')}</p>

      <section style={cardStyle} aria-labelledby="status-heading">
        <h2 id="status-heading" style={{ margin: 0 }}>
          {t('conseiller.overview.currentStatus')}
        </h2>
        <p style={{ fontSize: 24, margin: '8px 0' }}>{renderStatusBadge(dossier.status, t)}</p>
        <p style={{ color: '#6b7280', margin: 0 }}>
          {t('conseiller.overview.lastVerified')}:{' '}
          {dossier.lastVerifiedAt
            ? formatDate(new Date(dossier.lastVerifiedAt), locale)
            : t('conseiller.overview.lastVerifiedNever')}
        </p>
        <p style={{ color: '#6b7280', margin: '4px 0 0' }}>
          {dossier.consentToProcessGivenAt
            ? t('conseiller.overview.consentGivenOn', {
                date: formatDate(new Date(dossier.consentToProcessGivenAt), locale),
              })
            : t('conseiller.overview.consentMissing')}
        </p>
      </section>

      <section style={cardStyle} aria-labelledby="certs-heading">
        <h2 id="certs-heading">{t('conseiller.overview.certificatesSection')}</h2>
        {dossier.certificates.length === 0 ? (
          <p>{t('conseiller.overview.noCertificates')}</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {dossier.certificates.map((c) => (
              <li key={c.id} style={listItemStyle}>
                <strong>
                  {c.province === 'QC' ? t('shared.provinceQC') : t('shared.provinceON')}
                </strong>{' '}
                — {c.certificateNumber} — {renderDecisionLabel(c.decision, t)}
                <br />
                <span style={{ color: '#6b7280' }}>
                  {t('conseiller.overview.certificateExpires', {
                    date: formatDate(new Date(c.expiresAt), locale),
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={cardStyle} aria-labelledby="affils-heading">
        <h2 id="affils-heading">{t('conseiller.overview.affiliationsSection')}</h2>
        {dossier.affiliations.length === 0 ? (
          <p>{t('conseiller.overview.noAffiliations')}</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {dossier.affiliations.map((a) => (
              <li key={a.id} style={listItemStyle}>
                <strong>{a.agencyName}</strong> — {a.agencyPermitNumber} (
                {a.agencyProvince === 'QC' ? t('shared.provinceQC') : t('shared.provinceON')})
                <br />
                <span style={{ color: '#6b7280' }}>{renderDecisionLabel(a.decision, t)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p>
        <Link href={`/${urlLocale}/conseiller/conformite/renouveler`} style={ctaStyle}>
          {t('conseiller.overview.ctaRenew')}
        </Link>
      </p>

      <HistorySection locale={locale} nextRenewalDate={getEarliestExpiry(dossier.certificates)} />
    </main>
  );
}

function getEarliestExpiry(certs: DossierApiShape['certificates']): Date | null {
  const validCerts = certs.filter((c) => c.decision === 'approved');
  if (validCerts.length === 0) return null;
  return validCerts.reduce<Date>(
    (earliest, c) => {
      const exp = new Date(c.expiresAt);
      return exp < earliest ? exp : earliest;
    },
    new Date(validCerts[0]?.expiresAt ?? Date.now()),
  );
}

function renderStatusBadge(
  status: DossierApiShape['status'],
  t: Awaited<ReturnType<typeof getTranslations>>,
): ReactNode {
  // Couleurs darkened pour contraste WCAG AA ≥ 4.5:1 avec texte blanc.
  // Avant : pending #eab308 (2.1:1 FAIL), suspended #f97316 (2.9:1 FAIL).
  // Audit axe-core CI bloquerait à coup sûr.
  const colors: Record<DossierApiShape['status'], string> = {
    pending: '#a16207',
    verified: '#15803d',
    suspended: '#c2410c',
    revoked: '#b91c1c',
  };
  const labels: Record<DossierApiShape['status'], string> = {
    pending: t('shared.statusPending'),
    verified: t('shared.statusVerified'),
    suspended: t('shared.statusSuspended'),
    revoked: t('shared.statusRevoked'),
  };
  return (
    <span
      style={{
        background: colors[status],
        color: '#fff',
        padding: '4px 12px',
        borderRadius: 4,
        fontSize: 16,
      }}
    >
      {labels[status]}
    </span>
  );
}

function renderDecisionLabel(
  decision: 'pending' | 'approved' | 'refused',
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  if (decision === 'approved') return t('shared.decisionApproved');
  if (decision === 'refused') return t('shared.decisionRefused');
  return t('shared.decisionPending');
}

// --- Styles inline (Tailwind à venir feature ultérieure) ---

const mainStyle = {
  maxWidth: 800,
  margin: '32px auto',
  padding: '0 24px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

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

const ctaStyle = {
  display: 'inline-block',
  background: '#2563eb',
  color: '#fff',
  padding: '12px 24px',
  borderRadius: 6,
  textDecoration: 'none',
  marginTop: 16,
};
