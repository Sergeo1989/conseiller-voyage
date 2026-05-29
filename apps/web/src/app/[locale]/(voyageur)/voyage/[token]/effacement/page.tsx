// T111 — Page voyageur /voyage/[token]/effacement (FR-022).
// Affiche le formulaire d'effacement d'un brief précis.

import { ErasureForm } from '@/features/intake';
import type { ReactNode } from 'react';

interface PageProps {
  readonly params: Promise<{ locale: string; token: string }>;
}

export default async function ErasureBriefPage({ params }: PageProps): Promise<ReactNode> {
  const { locale, token } = await params;
  const localeKey = locale === 'en' ? 'en' : 'fr';
  return (
    <main className="container mx-auto max-w-2xl px-4 py-8">
      <ErasureForm briefId={token} locale={localeKey} />
    </main>
  );
}
