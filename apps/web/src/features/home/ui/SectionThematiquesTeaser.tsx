// T016 [US2] — Teaser de thématiques de voyage (FR-023).
// Chaque entrée mène à l'INTAKE (jamais au contact d'un conseiller, ADR-0002).
// L'arborescence complète relève de 018/027 (différée). Présentationnel pur (RSC).

import Link from 'next/link';

interface SectionThematiquesTeaserProps {
  readonly heading: string;
  readonly items: readonly string[];
  readonly urlLocale: string;
}

export function SectionThematiquesTeaser({
  heading,
  items,
  urlLocale,
}: SectionThematiquesTeaserProps) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="themes-heading" className="mx-auto max-w-5xl px-4 py-16 text-center">
      <h2 id="themes-heading" className="text-2xl font-bold text-slate-900 sm:text-3xl">
        {heading}
      </h2>
      <ul className="mt-8 flex flex-wrap justify-center gap-3">
        {items.map((item) => (
          <li key={item}>
            <Link
              href={`/${urlLocale}/voyage/nouveau`}
              className="inline-flex min-h-[44px] items-center rounded-full border border-slate-300 px-5 text-sm font-medium text-slate-700 transition-colors hover:border-blue-700 hover:text-blue-700"
            >
              {item}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
