// Page publique « Comment ça marche » (US1 P1 — pivot Principe I).
// Énonce explicitement que la plateforme n'est PAS une agence de voyages.
// SSG force-static, contenu chargé depuis packages/legal-content/.

import { buildLegalMetadata, renderLegalPage } from '@/lib/legal/page-helpers';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const dynamic = 'force-static';

const SLUG = 'comment-ca-marche';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildLegalMetadata(locale, SLUG);
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactNode> {
  const { locale } = await params;
  return renderLegalPage(locale, SLUG);
}
