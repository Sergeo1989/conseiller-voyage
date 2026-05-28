// T082 — Hero page publique (photo + nom affiché + titre).
//
// Photo CloudFront publique stable (URL OAC, pas signée) — cacheable
// browser long terme (cf. R2 + M7). `width`/`height` figés pour CLS = 0
// (Principe XII).

interface ProfilHeroProps {
  readonly nomAffiche: string;
  readonly titre: string | null;
  readonly photoUrl: string;
  readonly photoWidth: number;
  readonly photoHeight: number;
}

export function ProfilHero({
  nomAffiche,
  titre,
  photoUrl,
  photoWidth,
  photoHeight,
}: ProfilHeroProps) {
  return (
    <header className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:text-left">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl}
        alt={`Portrait de ${nomAffiche}`}
        width={photoWidth}
        height={photoHeight}
        className="h-32 w-32 flex-shrink-0 rounded-full object-cover ring-2 ring-slate-200 sm:h-40 sm:w-40"
      />
      <div className="mt-4 sm:ml-6 sm:mt-0">
        <h1 className="text-3xl font-bold text-slate-900">{nomAffiche}</h1>
        {titre && <p className="mt-2 text-lg text-slate-700">{titre}</p>}
      </div>
    </header>
  );
}
