// Page publique « CGU voyageur » (US2 P1 — B2C).

import { buildLegalMetadata, renderLegalPage } from '@/lib/legal/page-helpers';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const dynamic = 'force-static';

const SLUG = 'cgu-voyageur';

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
