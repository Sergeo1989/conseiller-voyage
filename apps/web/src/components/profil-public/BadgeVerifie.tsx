// T084 — Badge "Vérifié OPC/TICO" (A3 — boolean au MVP).
//
// ConformiteQueryPort actuel n'expose que `verified: boolean`. La liste
// détaillée des certificats (type + référence + date d'expiration) sera
// ajoutée par feature 016 SEO qui étendra le port.

interface BadgeVerifieProps {
  readonly verifie: boolean;
}

export function BadgeVerifie({ verifie }: BadgeVerifieProps) {
  if (!verifie) return null;
  return (
    <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-900">
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4 text-emerald-700"
        role="img"
        aria-labelledby="badge-verifie-icon-title"
      >
        <title id="badge-verifie-icon-title">Vérifié</title>
        <path
          fillRule="evenodd"
          d="M16.704 5.296a1 1 0 010 1.414l-7.5 7.5a1 1 0 01-1.414 0l-3.5-3.5a1 1 0 011.414-1.414l2.793 2.793 6.793-6.793a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
      Vérifié OPC/TICO
    </div>
  );
}
