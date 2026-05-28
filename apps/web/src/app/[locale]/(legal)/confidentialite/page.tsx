// Page publique « Politique de confidentialité » (US2 P1 — Loi 25).

import { buildLegalMetadata, renderLegalPage } from '@/features/legal';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const dynamic = 'force-static';

const SLUG = 'confidentialite';

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
