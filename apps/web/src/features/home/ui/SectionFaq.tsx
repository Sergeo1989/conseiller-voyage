// T017 [US2] — FAQ (FR-022). Passages courts citables (magnétisme GEO).
// <details>/<summary> natif : accessible et fonctionnel SANS JavaScript (SC-009).
// Le balisage FAQPage JSON-LD est ajouté côté page (US3). Présentationnel pur (RSC).

interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

interface SectionFaqProps {
  readonly heading: string;
  readonly items: readonly FaqItem[];
}

export function SectionFaq({ heading, items }: SectionFaqProps) {
  return (
    <section aria-labelledby="faq-heading" className="bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h2 id="faq-heading" className="text-center text-2xl font-bold text-slate-900 sm:text-3xl">
          {heading}
        </h2>
        <dl className="mt-8 divide-y divide-slate-200 border-t border-slate-200">
          {items.map((item) => (
            <details key={item.question} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-slate-900">
                <dt>{item.question}</dt>
                <span
                  aria-hidden="true"
                  className="ml-4 text-slate-400 transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <dd className="mt-2 text-slate-600">{item.answer}</dd>
            </details>
          ))}
        </dl>
      </div>
    </section>
  );
}
