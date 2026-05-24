// T079 — Page admin "Détail d'une soumission".
// Server Component qui charge le détail (avec URLs S3 GET signées),
// affiche certificats + affiliations + actions (panneau client).

import { formatDate } from '@cv/shared/conformite';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth } from '../../../../../auth';
import type { Locale } from '../../../../../i18n';
import { apiClient } from '../../../../_lib/api-client';
import { DecisionPanel } from './decision-panel';

interface PageProps {
  params: Promise<{ locale: Locale; submissionId: string }>;
}

interface SubmissionDetailApi {
  submissionId: string;
  conseillerComplianceId: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'refused';
  decidedAt: string | null;
  decisionReason: string | null;
  certificates: ReadonlyArray<{
    id: string;
    province: 'QC' | 'ON';
    certificateNumber: string;
    issuedAt: string;
    expiresAt: string;
    decision: 'pending' | 'approved' | 'refused';
    documentDownloadUrl: string;
  }>;
  affiliations: ReadonlyArray<{
    id: string;
    agencyName: string;
    agencyPermitNumber: string;
    agencyProvince: 'QC' | 'ON';
    decision: 'pending' | 'approved' | 'refused';
    proofDownloadUrl: string;
  }>;
}

export default async function AdminSubmissionDetailPage({ params }: PageProps): Promise<ReactNode> {
  const { locale, submissionId } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/${locale}/login?callbackUrl=/${locale}/admin/conformite/${submissionId}`);
  }

  const t = await getTranslations({ locale, namespace: 'conformite.admin.detail' });
  const tShared = await getTranslations({ locale, namespace: 'conformite.shared' });

  const result = await apiClient.get<SubmissionDetailApi>(
    `/api/conformite/admin/submissions/${submissionId}`,
  );

  if (!result.ok && result.status === 404) {
    notFound();
  }
  if (!result.ok) {
    return (
      <main style={mainStyle}>
        <p style={{ color: '#dc2626' }}>Erreur API ({result.status}).</p>
      </main>
    );
  }

  const detail = result.data;
  const alreadyDecided = detail.status !== 'pending';

  return (
    <main style={mainStyle}>
      <p>
        <Link href={`/${locale}/admin/conformite`} style={{ color: '#2563eb' }}>
          ← {t('backToQueue')}
        </Link>
      </p>

      <h1>{t('title', { submissionId: `${detail.submissionId.slice(0, 8)}…` })}</h1>
      <p style={{ color: '#6b7280' }}>
        {t('submittedAt', { date: formatDate(new Date(detail.submittedAt), locale) })}
      </p>

      <section style={cardStyle} aria-labelledby="decision-heading">
        <h2 id="decision-heading">{t('currentDecision')}</h2>
        <p style={{ fontSize: 18 }}>{renderDecision(detail.status, tShared)}</p>
        {detail.decisionReason && (
          <p>
            <strong>{t('decisionReasonLabel')}:</strong> {detail.decisionReason}
          </p>
        )}
      </section>

      <section style={cardStyle} aria-labelledby="certs-heading">
        <h2 id="certs-heading">{t('certificatesSection')}</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {detail.certificates.map((c) => (
            <li key={c.id} style={listItemStyle}>
              <strong>{c.province === 'QC' ? tShared('provinceQC') : tShared('provinceON')}</strong>{' '}
              — {c.certificateNumber}
              <br />
              <span style={{ color: '#6b7280' }}>
                {formatDate(new Date(c.issuedAt), locale)} →{' '}
                {formatDate(new Date(c.expiresAt), locale)}
              </span>
              <br />
              <a
                href={c.documentDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                {t('viewDocument')}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section style={cardStyle} aria-labelledby="affils-heading">
        <h2 id="affils-heading">{t('affiliationsSection')}</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {detail.affiliations.map((a) => (
            <li key={a.id} style={listItemStyle}>
              <strong>{a.agencyName}</strong> — {a.agencyPermitNumber} (
              {a.agencyProvince === 'QC' ? tShared('provinceQC') : tShared('provinceON')})
              <br />
              <a
                href={a.proofDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                {t('viewProof')}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <DecisionPanel
        submissionId={detail.submissionId}
        locale={locale}
        alreadyDecided={alreadyDecided}
      />
    </main>
  );
}

function renderDecision(
  status: 'pending' | 'approved' | 'refused',
  tShared: Awaited<ReturnType<typeof getTranslations>>,
): string {
  if (status === 'approved') return tShared('decisionApproved');
  if (status === 'refused') return tShared('decisionRefused');
  return tShared('decisionPending');
}

// --- Styles ---

const mainStyle = {
  maxWidth: 900,
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

const linkStyle = {
  color: '#2563eb',
  textDecoration: 'underline',
};
