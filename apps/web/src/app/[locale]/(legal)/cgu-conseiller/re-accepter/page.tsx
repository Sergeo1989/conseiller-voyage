// T073 — Page ré-acceptation CGU B2B (US3 P2).
//
// Le middleware redirige ici quand le user a accepté une version
// antérieure ou jamais accepté. Affiche un résumé du document courant +
// le changelog (depuis le frontmatter MDX) + un formulaire qui poste
// vers POST /api/me/legal/accept.

import { reacceptCguAction } from '@/features/legal';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.ReactElement> {
  const { locale } = await params;
  const localePrefix = locale === 'en' ? '/en' : '/fr';
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Mise à jour des CGU</h1>
        <p className="text-sm text-muted-foreground">
          Les Conditions générales d&apos;utilisation ont été mises à jour. Pour continuer à
          utiliser votre espace conseiller, veuillez relire et accepter la nouvelle version.
        </p>
      </header>

      <section aria-labelledby="changelog-heading" className="rounded-lg border bg-card p-4">
        <h2 id="changelog-heading" className="text-base font-medium">
          Ce qui change
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Voir le résumé des modifications dans la{' '}
          <a className="underline" href={`${localePrefix}/cgu-conseiller`}>
            page CGU complète
          </a>
          .
        </p>
      </section>

      <form action={reacceptCguAction} className="space-y-4">
        {/* Préserve la locale courante pour les redirects du Server Action. */}
        <input type="hidden" name="locale" value={locale === 'en' ? 'en' : 'fr-CA'} />
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="accept"
            value="on"
            required
            aria-required="true"
            className="mt-1 size-4 shrink-0 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary"
          />
          <span>
            J&apos;ai lu et j&apos;accepte la nouvelle version des Conditions générales
            d&apos;utilisation.
          </span>
        </label>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Confirmer mon acceptation
        </button>
      </form>
    </main>
  );
}
