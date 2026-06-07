// T018 [US2] — Bandeau Loi 25 (FR-005). Vie privée par conception, rendue visible.
// Composant présentationnel pur (RSC).

interface BandeauLoi25Props {
  readonly heading: string;
  readonly body: string;
}

export function BandeauLoi25({ heading, body }: BandeauLoi25Props) {
  return (
    <section aria-labelledby="loi25-heading" className="mx-auto max-w-3xl px-4 py-12">
      <div className="flex items-start gap-4 rounded-lg border border-slate-200 bg-white p-6">
        <span aria-hidden="true" className="text-2xl">
          🔒
        </span>
        <div>
          <h2 id="loi25-heading" className="text-lg font-semibold text-slate-900">
            {heading}
          </h2>
          <p className="mt-1 text-slate-600">{body}</p>
        </div>
      </div>
    </section>
  );
}
