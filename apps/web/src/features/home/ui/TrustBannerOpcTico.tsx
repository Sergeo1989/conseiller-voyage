// T013 [US2] — Bandeau de confiance « Tous vérifiés OPC/TICO » (FR-004).
// Rend visible la garde `verified` (Principe I) ; renvoie vers /comment-ca-marche.
// Composant présentationnel pur (RSC).

import { BadgeCheck } from 'lucide-react';
import Link from 'next/link';

interface TrustBannerOpcTicoProps {
  readonly label: string;
  readonly linkLabel: string;
  readonly urlLocale: string;
}

export function TrustBannerOpcTico({ label, linkLabel, urlLocale }: TrustBannerOpcTicoProps) {
  return (
    <section aria-label={label} className="border-y border-slate-200 bg-slate-50">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-2 px-4 py-5 text-center sm:flex-row sm:gap-4">
        <p className="inline-flex items-center gap-2 font-semibold text-slate-900">
          <BadgeCheck aria-hidden="true" className="h-5 w-5 text-blue-700" />
          {label}
        </p>
        <Link
          href={`/${urlLocale}/comment-ca-marche`}
          className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline"
        >
          {linkLabel}
        </Link>
      </div>
    </section>
  );
}
