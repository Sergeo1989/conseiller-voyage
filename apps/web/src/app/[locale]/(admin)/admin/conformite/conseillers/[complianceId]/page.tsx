// T105 — Page admin détail conseiller avec action Révoquer (US4 FR-010).

import { auth } from '@/auth';
import { RevokeModal } from '@/features/conformite-admin';
import { type Locale, toUrlLocale } from '@/i18n';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

interface PageProps {
  params: Promise<{ locale: Locale; complianceId: string }>;
}

export default async function AdminConseillerDetailPage({ params }: PageProps): Promise<ReactNode> {
  const { locale, complianceId } = await params;
  const urlLocale = toUrlLocale(locale);
  const session = await auth();
  if (!session?.user) {
    redirect(
      `/${urlLocale}/login?callbackUrl=/${urlLocale}/admin/conformite/conseillers/${complianceId}`,
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
        <Link href={`/${urlLocale}/admin/conformite`} style={{ color: '#2563eb' }}>
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
