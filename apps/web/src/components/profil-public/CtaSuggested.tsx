// T086 — CTA principal vers /intake?suggested= (feature 007 FR-008).
//
// **SEUL CTA AUTORISÉ sur la page publique** (Principe I + ADR-0002 +
// SC-002 + check-no-contact-fields-profile.ts en CI bloquant).
//
// Le paramètre `suggested=<conseillerId>` sera lu par le middleware
// Next.js (T089) qui pose un cookie HMAC pour boost soft du scoring
// (FR-008a, validité 24h, plafond Principe III préservé).
//
// Affiché 2 fois sur la page (hero + footer après section pédagogique) —
// signal d'intention clair sans contact direct.

import Link from 'next/link';

interface CtaSuggestedProps {
  readonly locale: string;
  readonly conseillerId: string;
  readonly variant: 'primary' | 'footer';
}

export function CtaSuggested({ locale, conseillerId, variant }: CtaSuggestedProps) {
  const href = `/${locale}/intake?suggested=${encodeURIComponent(conseillerId)}`;

  if (variant === 'primary') {
    return (
      <div className="mt-8 rounded-lg border border-blue-200 bg-blue-50 p-6 text-center">
        <p className="text-lg font-medium text-blue-900">
          Intéressé(e) par les services de ce conseiller&nbsp;?
        </p>
        <p className="mt-2 text-sm text-blue-800">
          Décrivez votre projet — peut-être ce conseiller, peut-être un autre mieux aligné,
          jusqu&apos;à 3 maximum.
        </p>
        <Link
          href={href}
          className="mt-4 inline-block rounded-md bg-blue-600 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Décrivez votre projet
        </Link>
      </div>
    );
  }

  // footer variant — rappel discret après la section pédagogique.
  return (
    <div className="mt-8 text-center">
      <Link
        href={href}
        className="inline-block rounded-md border border-blue-600 px-5 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        Décrivez votre projet
      </Link>
    </div>
  );
}
