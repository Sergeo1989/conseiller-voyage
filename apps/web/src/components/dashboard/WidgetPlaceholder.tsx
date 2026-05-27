// T101 + T102 — Widget Placeholder pour leads + facturation.

interface WidgetPlaceholderProps {
  readonly title: string;
  readonly message: string;
}

export function WidgetPlaceholder({ title, message }: WidgetPlaceholderProps) {
  return (
    <article className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
      <h2 className="text-lg font-semibold text-slate-700">{title}</h2>
      <p className="mt-3 text-sm text-slate-600">{message}</p>
    </article>
  );
}
