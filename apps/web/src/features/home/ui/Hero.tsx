// T008 [US1] — Héro de la page d'accueil (FR-001, FR-021).
//
// Héro texte centré (décision spec 2026-06-06) : le LCP est le <h1>, aucune
// image, CLS nul. Porte la promesse mandatée (neutralité + appariement), le CTA
// primaire unique, le message « gratuit, sans engagement » et la micro-confiance
// OPC/TICO. Composant présentationnel pur (RSC) : reçoit des chaînes déjà
// traduites + le segment d'URL de langue, donc testable sans runtime next-intl.

import { CtaDecrireVoyage } from './CtaDecrireVoyage';

interface HeroProps {
  /** Segment d'URL de langue déjà résolu (ex. "fr"). */
  readonly urlLocale: string;
  /** H1 mandaté (`home.hero.title`). */
  readonly title: string;
  /** Sous-titre mandaté (`home.hero.subtitle`). */
  readonly subtitle: string;
  /** Libellé du CTA primaire (`home.ctaPrimary`). */
  readonly ctaLabel: string;
  /** Message de levée de friction (`home.trust.freeForTravelers`). */
  readonly freeLabel: string;
  /** Micro-confiance (`home.trust.opcTicoBanner`). */
  readonly trustLabel: string;
}

export function Hero({ urlLocale, title, subtitle, ctaLabel, freeLabel, trustLabel }: HeroProps) {
  return (
    <section
      aria-labelledby="hero-heading"
      className="mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center sm:py-24"
    >
      <h1
        id="hero-heading"
        className="text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl"
      >
        {title}
      </h1>
      <p className="mt-6 max-w-2xl text-pretty text-lg text-slate-600">{subtitle}</p>
      <div className="mt-8">
        <CtaDecrireVoyage urlLocale={urlLocale} label={ctaLabel} />
      </div>
      <p className="mt-3 text-sm text-slate-500">{freeLabel}</p>
      <p className="mt-2 text-sm font-medium text-slate-700">
        <span aria-hidden="true">✔ </span>
        {trustLabel}
      </p>
    </section>
  );
}
