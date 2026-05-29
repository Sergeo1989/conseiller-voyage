// T084 — BriefRecap (Server Component).
// Affiche un récap lecture-seule du brief avec formatters i18n + status
// badge. Le data vient déjà fetch côté serveur dans la page parente.

import {
  type BriefSummary,
  formatBudgetRange,
  formatConseillerLanguage,
  formatFamiliarity,
  formatSpeciality,
} from '@cv/shared/intake';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BriefStatusBadge } from './BriefStatusBadge';
import { OtherBriefsLink } from './OtherBriefsLink';

interface BriefRecapProps {
  readonly summary: BriefSummary;
  readonly locale: 'fr' | 'en';
}

export async function BriefRecap({ summary, locale }: BriefRecapProps): Promise<ReactNode> {
  const t = await getTranslations('intake.recap');
  const formatterLocale = locale === 'en' ? 'en' : 'fr-CA';

  const submittedDate = new Date(summary.submittedAt).toLocaleDateString(formatterLocale);
  const expiresDate = new Date(summary.expiresAt).toLocaleDateString(formatterLocale);
  const departure = new Date(summary.departureDate).toLocaleDateString(formatterLocale);
  const returnDate = new Date(summary.returnDate).toLocaleDateString(formatterLocale);

  return (
    <article className="mx-auto max-w-3xl space-y-6 py-8">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <BriefStatusBadge status={summary.status} />
      </header>

      <div className="grid gap-2 text-sm text-muted-foreground">
        <div>{t('submittedOn', { date: submittedDate })}</div>
        <div>{t('expiresOn', { date: expiresDate })}</div>
      </div>

      <section className="rounded border bg-card p-4">
        <h2 className="mb-3 text-lg font-medium">Destinations</h2>
        <ul className="space-y-1">
          {summary.destinations.map((d, idx) => (
            <li key={`dest-${idx}-${d.country}`} className="text-sm">
              {d.country}
              {d.region ? ` — ${d.region}` : ''}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3 rounded border bg-card p-4 sm:grid-cols-2">
        <RecapField label="Départ" value={departure} />
        <RecapField label="Retour" value={returnDate} />
        {summary.datesFlexible && (
          <RecapField label="Flexibilité" value={`± ${summary.datesFlexibilityDays ?? 0} jours`} />
        )}
        <RecapField label="Adultes" value={String(summary.adultsCount)} />
        {summary.childrenAges.length > 0 && (
          <RecapField
            label="Enfants"
            value={summary.childrenAges.map((a) => `${a} ans`).join(', ')}
          />
        )}
        {summary.infantsCount > 0 && (
          <RecapField label="Bébés" value={String(summary.infantsCount)} />
        )}
      </section>

      <section className="grid gap-3 rounded border bg-card p-4 sm:grid-cols-2">
        <RecapField
          label="Budget"
          value={formatBudgetRange(summary.budgetRange, formatterLocale)}
        />
        <RecapField
          label="Spécialité"
          value={formatSpeciality(summary.speciality, formatterLocale)}
        />
        {summary.specialityOther && (
          <RecapField label="Précision" value={summary.specialityOther} />
        )}
        <RecapField
          label="Langue conseiller"
          value={formatConseillerLanguage(summary.conseillerLanguage, {
            locale: formatterLocale,
            otherIsoCode: summary.conseillerLanguageOther,
          })}
        />
        <RecapField
          label="Expérience"
          value={formatFamiliarity(summary.familiarity, formatterLocale)}
        />
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <OtherBriefsLink locale={locale} />
        <Link
          href={`/${locale}/voyage/${summary.briefId}/effacement`}
          className="text-sm font-medium text-destructive underline decoration-1 underline-offset-2 hover:text-destructive/80"
        >
          {t('eraseButton')}
        </Link>
      </footer>
    </article>
  );
}

function RecapField({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}
