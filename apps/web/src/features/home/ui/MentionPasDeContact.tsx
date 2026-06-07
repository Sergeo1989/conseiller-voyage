// T019 [US2] — Mention « Pourquoi pas de contact direct ? » (FR-006, FR-007).
// Pédagogie du modèle anti-marketplace ; renvoie vers /comment-ca-marche.
// Aucune coordonnée de contact. Composant présentationnel pur (RSC).

import Link from 'next/link';

interface MentionPasDeContactProps {
  readonly heading: string;
  readonly body: string;
  readonly linkLabel: string;
  readonly urlLocale: string;
}

export function MentionPasDeContact({
  heading,
  body,
  linkLabel,
  urlLocale,
}: MentionPasDeContactProps) {
  return (
    <section aria-labelledby="pas-contact-heading" className="mx-auto max-w-3xl px-4 py-12">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6">
        <h2 id="pas-contact-heading" className="text-lg font-semibold text-slate-900">
          {heading}
        </h2>
        <p className="mt-2 text-slate-600">{body}</p>
        <p className="mt-3">
          <Link
            href={`/${urlLocale}/comment-ca-marche`}
            className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline"
          >
            {linkLabel}
          </Link>
        </p>
      </div>
    </section>
  );
}
