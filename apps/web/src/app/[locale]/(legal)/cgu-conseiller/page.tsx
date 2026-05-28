// Page publique « CGU conseiller » (US2 P1 — B2B).

import { buildLegalMetadata, renderLegalPage } from '@/features/legal/ui/page-helpers';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const dynamic = 'force-static';

const SLUG = 'cgu-conseiller';

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
