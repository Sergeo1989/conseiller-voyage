// T083 — Sections de contenu page publique (biographie + chips).
//
// Pas d'interactivité — RSC pur. Tailwind classes pour rendre les
// labels en pastilles inline.

interface ProfilSectionsProps {
  readonly biographie: string;
  readonly specialites: readonly { code: string; label: string }[];
  readonly langues: readonly { code: string; label: string }[];
  readonly zonesGeographiques: readonly { code: string; label: string }[];
  readonly anneesExperience: number;
}

export function ProfilSections({
  biographie,
  specialites,
  langues,
  zonesGeographiques,
  anneesExperience,
}: ProfilSectionsProps) {
  return (
    <div className="mt-8 space-y-8">
      <section aria-labelledby="bio-heading">
        <h2 id="bio-heading" className="text-xl font-semibold text-slate-900">
          À propos
        </h2>
        <p className="mt-2 whitespace-pre-wrap text-slate-700">{biographie}</p>
      </section>

      <ChipsSection headingId="specialites-heading" title="Spécialités" items={specialites} />

      <ChipsSection headingId="langues-heading" title="Langues parlées" items={langues} />

      <ChipsSection
        headingId="zones-heading"
        title="Zones d'expertise"
        items={zonesGeographiques}
      />

      <section aria-labelledby="experience-heading">
        <h2 id="experience-heading" className="text-xl font-semibold text-slate-900">
          Expérience
        </h2>
        <p className="mt-2 text-slate-700">
          {anneesExperience === 1 ? '1 an d’expérience' : `${anneesExperience} ans d’expérience`}
        </p>
      </section>
    </div>
  );
}

interface ChipsSectionProps {
  readonly headingId: string;
  readonly title: string;
  readonly items: readonly { code: string; label: string }[];
}

function ChipsSection({ headingId, title, items }: ChipsSectionProps) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="text-xl font-semibold text-slate-900">
        {title}
      </h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <li
            key={item.code}
            className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-sm text-slate-700"
          >
            {item.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
