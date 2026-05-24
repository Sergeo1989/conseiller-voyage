// T105 — Page admin détail conseiller avec action Révoquer (US4 FR-010).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth } from '../../../../../../auth';
import type { Locale } from '../../../../../../i18n';
import { RevokeModal } from './revoke-modal';

interface PageProps {
  params: Promise<{ locale: Locale; complianceId: string }>;
}

export default async function AdminConseillerDetailPage({ params }: PageProps): Promise<ReactNode> {
  const { locale, complianceId } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(
      `/${locale}/login?callbackUrl=/${locale}/admin/conformite/conseillers/${complianceId}`,
    );
  }

  return (
    <main
      style={{
        maxWidth: 800,
        margin: '32px auto',
        padding: '0 24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <p>
        <Link href={`/${locale}/admin/conformite`} style={{ color: '#2563eb' }}>
          ← File de revue
        </Link>
      </p>
      <h1>
        Conseiller <code style={{ fontSize: 16 }}>{complianceId.slice(0, 8)}…</code>
      </h1>
      <p style={{ color: '#6b7280' }}>
        Vue détaillée + action de révocation manuelle (US4). La révocation est un état final et
        envoie un email au conseiller avec le motif.
      </p>

      <h2 style={{ marginTop: 32, color: '#dc2626' }}>Zone dangereuse</h2>
      <RevokeModal complianceId={complianceId} locale={locale} />
    </main>
  );
}
