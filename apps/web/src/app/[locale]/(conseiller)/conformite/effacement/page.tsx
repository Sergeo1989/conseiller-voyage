// T125a — Page conseiller "Demande d'effacement Loi 25" (FR-017).
// Explication détaillée des conséquences (irréversible, conservation
// audit 7 ans) + formulaire avec confirmation explicite par typage.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth } from '../../../../../auth';
import { type Locale, toUrlLocale } from '../../../../../i18n';
import { ErasureForm } from './erasure-form';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function ErasureRequestPage({ params }: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  const urlLocale = toUrlLocale(locale);
  const session = await auth();
  if (!session?.user) {
    redirect(`/${urlLocale}/login?callbackUrl=/${urlLocale}/conseiller/conformite/effacement`);
  }
  return (
    <main
      style={{
        maxWidth: 700,
        margin: '32px auto',
        padding: '0 24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <p>
        <Link href={`/${urlLocale}/conseiller/conformite`} style={{ color: '#2563eb' }}>
          ← Mon dossier
        </Link>
      </p>

      <h1 style={{ color: '#dc2626' }}>Demande d'effacement de mes données (Loi 25)</h1>

      <section
        style={{
          background: '#fef2f2',
          border: '2px solid #dc2626',
          borderRadius: 8,
          padding: 24,
          margin: '24px 0',
        }}
      >
        <h2 style={{ margin: '0 0 12px' }}>⚠ Conséquences de cette demande</h2>
        <ul style={{ paddingLeft: 20, lineHeight: 1.7 }}>
          <li>
            <strong>Irréversible</strong> : tous vos documents (certificats, preuves d'affiliation)
            sont supprimés des serveurs S3.
          </li>
          <li>
            Votre dossier de conformité est marqué <strong>anonymisé</strong> et n'est plus visible
            aux voyageurs ni aux administrateurs.
          </li>
          <li>
            Votre <strong>journal d'audit</strong> (historique des décisions) est
            <strong> conservé 7 ans</strong> sous forme anonymisée (obligation légale OPC/TICO).
          </li>
          <li>
            Si vous souhaitez à nouveau apparaître sur la plateforme par la suite, vous devrez
            ouvrir un nouveau compte et soumettre un nouveau dossier complet.
          </li>
          <li>
            Le traitement est <strong>asynchrone</strong> : la suppression effective sera complétée
            sous 30 jours (Loi 25), et vous recevrez une confirmation par courriel.
          </li>
        </ul>
      </section>

      <ErasureForm locale={locale} />
    </main>
  );
}
