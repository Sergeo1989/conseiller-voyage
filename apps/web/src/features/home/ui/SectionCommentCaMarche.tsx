// T012 [US2] — « Comment ça marche » en 3 étapes (FR-020).
// Inspiré du lead-gen, SANS aucune étape de devis/soumission/comparaison de prix.
// Composant présentationnel pur (RSC) : reçoit les étapes déjà traduites.

interface Step {
  readonly title: string;
  readonly body: string;
}

interface SectionCommentCaMarcheProps {
  readonly heading: string;
  readonly steps: readonly Step[];
}

export function SectionCommentCaMarche({ heading, steps }: SectionCommentCaMarcheProps) {
  return (
    <section aria-labelledby="ccm-heading" className="mx-auto max-w-5xl px-4 py-16">
      <h2 id="ccm-heading" className="text-center text-2xl font-bold text-slate-900 sm:text-3xl">
        {heading}
      </h2>
      <ol className="mt-10 grid gap-8 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title} className="flex flex-col items-center text-center">
            <span
              aria-hidden="true"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-700 text-lg font-bold text-white"
            >
              {i + 1}
            </span>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">{step.title}</h3>
            <p className="mt-2 text-slate-600">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
