// FR-025 [US2] — « Pourquoi un conseiller (le côté humain) ».
// Met en avant l'accompagnement humain, le suivi par un pro, et le fait de
// rester concentré sur SON projet — loin du bruit des comparateurs en ligne.
// Composant présentationnel pur (RSC).

interface Point {
  readonly title: string;
  readonly body: string;
}

interface SectionAvantageConseillerProps {
  readonly heading: string;
  readonly intro: string;
  readonly points: readonly Point[];
}

export function SectionAvantageConseiller({
  heading,
  intro,
  points,
}: SectionAvantageConseillerProps) {
  return (
    <section aria-labelledby="avantage-heading" className="mx-auto max-w-5xl px-4 py-16">
      <div className="mx-auto max-w-3xl text-center">
        <h2 id="avantage-heading" className="text-2xl font-bold text-slate-900 sm:text-3xl">
          {heading}
        </h2>
        <p className="mt-4 text-lg text-slate-600">{intro}</p>
      </div>
      <ul className="mt-10 grid gap-6 sm:grid-cols-2">
        {points.map((point) => (
          <li key={point.title} className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="font-semibold text-slate-900">{point.title}</h3>
            <p className="mt-2 text-slate-600">{point.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
