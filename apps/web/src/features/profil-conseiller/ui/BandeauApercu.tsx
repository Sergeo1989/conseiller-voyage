// T109 — Bandeau Aperçu (feature 007 US4 FR-013).

interface BandeauApercuProps {
  readonly bandeau: {
    readonly type: 'profil_incomplet' | 'non_verifie' | 'masque_admin' | 'anonymise';
    readonly elementsManquants: readonly string[];
    readonly raisonMasquage: string | null;
  };
}

export function BandeauApercu({ bandeau }: BandeauApercuProps) {
  return (
    <div
      role="alert"
      className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900"
    >
      <p className="font-medium">Aperçu — non visible publiquement</p>
      <BandeauBody bandeau={bandeau} />
    </div>
  );
}

function BandeauBody({ bandeau }: BandeauApercuProps) {
  if (bandeau.type === 'masque_admin') {
    return (
      <p className="mt-1 text-sm">
        Votre profil est temporairement masqué par un administrateur.
        {bandeau.raisonMasquage && <span> Raison : {bandeau.raisonMasquage}</span>}
      </p>
    );
  }
  if (bandeau.type === 'non_verifie') {
    return (
      <p className="mt-1 text-sm">
        Votre conformité OPC/TICO doit être vérifiée pour publier votre profil.
      </p>
    );
  }
  if (bandeau.type === 'anonymise') {
    return <p className="mt-1 text-sm">Ce profil a été anonymisé.</p>;
  }
  return (
    <p className="mt-1 text-sm">
      Éléments à compléter : <strong>{bandeau.elementsManquants.join(', ')}</strong>
    </p>
  );
}
