// T005 [US1] — CTA primaire unique de la page d'accueil (FR-002, ADR-0002).
//
// Seul chemin de mise en relation : l'intake voyageur (`/<locale>/voyage/nouveau`).
// Composant présentationnel pur (RSC), réutilisé par le héro et le CTA répété.
// Reçoit le segment d'URL de langue déjà résolu (pas d'accès i18n ici) afin de
// rester trivialement testable.

import Link from 'next/link';

interface CtaDecrireVoyageProps {
  /** Segment d'URL de langue déjà résolu (ex. "fr", "en"). */
  readonly urlLocale: string;
  /** Libellé du CTA (issu de `home.ctaPrimary`). */
  readonly label: string;
  /** Classes utilitaires optionnelles (variante visuelle). */
  readonly className?: string;
}

const DEFAULT_CLASSES =
  'inline-flex items-center justify-center rounded-lg bg-blue-700 px-6 py-3 ' +
  'text-base font-semibold text-white shadow-sm transition-colors hover:bg-blue-800 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-blue-700';

export function CtaDecrireVoyage({ urlLocale, label, className }: CtaDecrireVoyageProps) {
  return (
    <Link href={`/${urlLocale}/voyage/nouveau`} className={className ?? DEFAULT_CLASSES}>
      {label}
    </Link>
  );
}
