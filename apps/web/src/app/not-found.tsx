// Root not-found — fallback global 404 quand notFound() est levé hors d'un
// segment ou quand Next.js 15 ne wrap pas [locale]/not-found.tsx avec son
// layout dans certains cas SSG/ISR (issue connue avec `dynamicParams=true`
// + `revalidate`). Garantit `<html lang>` (Principe XI WCAG 2.1 AA) +
// signature HTTP unifiée (SC-003 anti-énumération) pour tous les cas 404.
//
// FR-CA par défaut (locale primaire — `next-intl` defaultLocale='fr-CA').
// La version locale-aware [locale]/not-found.tsx reste utilisée quand
// le wrap layout fonctionne (cas nominaux). Cette racine est la garantie.

const containerStyle = {
  maxWidth: 640,
  margin: '64px auto',
  padding: '0 24px',
  textAlign: 'center' as const,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  color: '#111827',
};

const linkStyle = { color: '#1d4ed8', textDecoration: 'underline' };

export default function GlobalNotFound() {
  return (
    <html lang="fr-CA">
      <head>
        <title>Page introuvable — Conseiller Voyage</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta charSet="utf-8" />
      </head>
      <body style={{ margin: 0 }}>
        <main style={containerStyle}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0f172a', margin: 0 }}>
            Page introuvable
          </h1>
          <p style={{ marginTop: 16, color: '#334155' }}>
            La page que vous cherchez n&apos;existe pas ou n&apos;est plus disponible.
          </p>
          <p style={{ marginTop: 12 }}>
            <a href="/" style={linkStyle}>
              Retour à l&apos;accueil
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
