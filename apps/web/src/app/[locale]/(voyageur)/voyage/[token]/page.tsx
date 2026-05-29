// T088 — Page voyageur /voyage/[token] (US2 récap).
//
// Le segment dynamique `[token]` n'est PAS le clear token — c'est le
// briefId que la page email-envoyé / le mailing pointent (le clear token
// vit dans le cookie, posé après POST /verify). Cette page lit le cookie
// et appelle GET /api/intake/briefs/:briefId pour récupérer le récap.
//
// Si le cookie est absent (lien direct copié-collé sans session), on
// redirige vers /voyage/lien-expire pour que l'utilisateur redemande
// un magic link.

import { BriefRecap, fetchBriefById, verifyMagicLinkAction } from '@/features/intake';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

interface PageProps {
  readonly params: Promise<{ locale: string; token: string }>;
}

export default async function VoyageurRecapPage({ params }: PageProps): Promise<ReactNode> {
  const { locale, token } = await params;
  const localeKey = locale === 'en' ? 'en' : 'fr';

  // Heuristique : si le segment ressemble à un clear token (hex 64), c'est
  // un magic link non encore consommé → on tente la vérification puis on
  // récupère le briefId pour l'afficher. Sinon, on traite comme briefId
  // direct.
  if (token.length === 64 && /^[0-9a-f]+$/.test(token)) {
    const verify = await verifyMagicLinkAction(token);
    if (!verify.ok) {
      redirect(`/${localeKey}/voyage/lien-expire`);
    }
    const fetchResult = await fetchBriefById(verify.data.briefId);
    if (!fetchResult.ok || !fetchResult.data) {
      redirect(`/${localeKey}/voyage/lien-expire`);
    }
    return (
      <main className="container mx-auto px-4 py-8">
        <BriefRecap summary={fetchResult.data} locale={localeKey} />
      </main>
    );
  }

  // Cas briefId direct : lecture avec cookie (session déjà active)
  const fetchResult = await fetchBriefById(token);
  if (!fetchResult.ok || !fetchResult.data) {
    redirect(`/${localeKey}/voyage/lien-expire`);
  }
  return (
    <main className="container mx-auto px-4 py-8">
      <BriefRecap summary={fetchResult.data} locale={localeKey} />
    </main>
  );
}
