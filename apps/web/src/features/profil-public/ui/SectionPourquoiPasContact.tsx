// T085 — Section pédagogique permanente "Pourquoi pas de contact direct ?"
// (feature 007 FR-009 + Principe I + ADR-0002).
//
// Cette section est OBLIGATOIRE sur toute page profil publique. Elle
// explique au voyageur le modèle anti-marketplace de la plateforme.
//
// Pas d'interactivité — RSC pur. Link vers /comment-ca-marche (feature 004).

import Link from 'next/link';

interface SectionPourquoiPasContactProps {
  readonly locale: string;
}

export function SectionPourquoiPasContact({ locale }: SectionPourquoiPasContactProps) {
  return (
    <section
      aria-labelledby="pourquoi-pas-contact-heading"
      className="mt-12 rounded-lg border border-slate-200 bg-slate-50 p-6"
    >
      <h2 id="pourquoi-pas-contact-heading" className="text-lg font-semibold text-slate-900">
        Pourquoi je ne peux pas contacter ce conseiller directement&nbsp;?
      </h2>
      <p className="mt-2 text-sm text-slate-700">
        Conseiller Voyage est un service de mise en relation qualifiée, pas un annuaire de
        coordonnées. Nous ne fournissons aucun moyen de contact direct (courriel, téléphone, chat)
        pour garantir un appariement par algorithme et préserver la qualité du lead.
      </p>
      <p className="mt-3 text-sm">
        <Link
          href={`/${locale}/comment-ca-marche`}
          className="font-medium text-blue-700 underline hover:text-blue-900"
        >
          Comment ça marche →
        </Link>
      </p>
    </section>
  );
}
