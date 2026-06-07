// T014 [US2] — « Pourquoi 3, et pas une liste » (FR-003, FR-014).
// Argument différenciateur vs annuaire. Copie « jusqu'à 3 » (jamais une garantie).
// Composant présentationnel pur (RSC).

interface SectionPourquoiTroisProps {
  readonly heading: string;
  readonly body: string;
  readonly note: string;
}

export function SectionPourquoiTrois({ heading, body, note }: SectionPourquoiTroisProps) {
  return (
    <section aria-labelledby="p3-heading" className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h2 id="p3-heading" className="text-2xl font-bold text-slate-900 sm:text-3xl">
        {heading}
      </h2>
      <p className="mt-4 text-lg text-slate-600">{body}</p>
      <p className="mt-4 font-medium text-slate-900">{note}</p>
    </section>
  );
}
