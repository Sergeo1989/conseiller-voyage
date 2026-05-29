// T123 — AdminBriefDetail (Server Component).
// Affiche brief avec toutes les données (sans PII contact directe dans ce
// MVP — la PII contact est exposée via un endpoint séparé en Phase 8).

import {
  type BriefSummary,
  formatBudgetRange,
  formatConseillerLanguage,
  formatFamiliarity,
  formatSpeciality,
} from '@cv/shared/intake';
import type { ReactNode } from 'react';
import { PushToConseillerForm } from './PushToConseillerForm';

interface AdminBriefDetailProps {
  readonly summary: BriefSummary;
  readonly locale: 'fr' | 'en';
}

export function AdminBriefDetail({ summary, locale }: AdminBriefDetailProps): ReactNode {
  const formatterLocale = locale === 'en' ? 'en' : 'fr-CA';

  return (
    <article className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Brief {summary.briefId.slice(0, 8)}…</h1>
        <p className="text-sm text-muted-foreground">
          Soumis le {new Date(summary.submittedAt).toLocaleDateString(formatterLocale)}
          {' · '}
          Vérifié le{' '}
          {summary.verifiedAt
            ? new Date(summary.verifiedAt).toLocaleDateString(formatterLocale)
            : '—'}
        </p>
      </header>

      <section className="grid gap-4 rounded border bg-card p-4 sm:grid-cols-2">
        <Field label="Destinations" value={summary.destinations.map((d) => d.country).join(', ')} />
        <Field label="Budget" value={formatBudgetRange(summary.budgetRange, formatterLocale)} />
        <Field label="Spécialité" value={formatSpeciality(summary.speciality, formatterLocale)} />
        <Field
          label="Langue"
          value={formatConseillerLanguage(summary.conseillerLanguage, {
            locale: formatterLocale,
            otherIsoCode: summary.conseillerLanguageOther,
          })}
        />
        <Field label="Expérience" value={formatFamiliarity(summary.familiarity, formatterLocale)} />
        <Field
          label="Adultes / enfants"
          value={`${summary.adultsCount} + ${summary.childrenAges.length}`}
        />
      </section>

      <section className="rounded border bg-card p-4">
        <h2 className="mb-3 text-lg font-medium">Push manuel vers un conseiller</h2>
        <PushToConseillerForm briefId={summary.briefId} />
      </section>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}
