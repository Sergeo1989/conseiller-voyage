// T015 [US2] — « Indépendant et neutre » (FR-005).
// Différenciateur vs réseaux captifs. Composant présentationnel pur (RSC).

interface SectionNeutraliteProps {
  readonly heading: string;
  readonly body: string;
}

export function SectionNeutralite({ heading, body }: SectionNeutraliteProps) {
  return (
    <section aria-labelledby="neutralite-heading" className="bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h2 id="neutralite-heading" className="text-2xl font-bold text-slate-900 sm:text-3xl">
          {heading}
        </h2>
        <p className="mt-4 text-lg text-slate-600">{body}</p>
      </div>
    </section>
  );
}
