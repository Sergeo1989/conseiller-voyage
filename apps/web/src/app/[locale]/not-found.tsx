// T081 — not-found.tsx unifié (feature 007 SC-003 anti-énumération).
//
// Cette page est rendue par Next.js pour TOUS les cas 404 sous [locale],
// y compris :
//   - slug conseiller inexistant
//   - slug réservé Loi 25
//   - profil masqué admin / anonymisé / incomplet
//   - conseiller en statut conformité != verified
//   - n'importe quel autre 404 légitime
//
// Body STATIQUE — pas de variables, pas d'API calls, pas de traduction
// runtime (à la rigueur i18n via getTranslations mais cela reste constant
// pour une locale donnée). L'objectif est que la signature HTTP soit
// IDENTIQUE pour tous les cas (status + content-type + taille à l'octet
// près) → SC-003 garanti.

export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center">
      <h1 className="text-3xl font-bold text-slate-900">Page introuvable</h1>
      <p className="mt-4 text-slate-700">
        La page que vous cherchez n&apos;existe pas ou n&apos;est plus disponible.
      </p>
      <p className="mt-2 text-slate-600">
        <a href="/" className="text-blue-700 underline hover:text-blue-900">
          Retour à l&apos;accueil
        </a>
      </p>
    </main>
  );
}
