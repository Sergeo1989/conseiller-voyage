// T100 — Page admin "Déclaration de retrait de permis" (US3 FR-015).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth } from '../../../../../auth';
import { type Locale, toUrlLocale } from '../../../../../i18n';
import { PermitRevokeForm } from './permit-revoke-form';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function AdminPermitsPage({ params }: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  const urlLocale = toUrlLocale(locale);
  const session = await auth();
  if (!session?.user) {
    redirect(`/${urlLocale}/login?callbackUrl=/${urlLocale}/admin/conformite/permis`);
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
      <h1>Déclaration de retrait de permis</h1>
      <p style={{ color: '#6b7280' }}>
        Le retrait propage automatiquement la cascade : toutes les affiliations avec ce permis
        seront inactivées, et les conseillers qui en dépendent seront bascules en statut{' '}
        <strong>suspendu</strong>. Action irréversible — utilisez avec discernement.
      </p>
      <PermitRevokeForm locale={locale} />
    </main>
  );
}
