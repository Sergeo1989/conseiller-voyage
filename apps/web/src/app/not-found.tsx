// Root not-found — fallback global 404 (Principe XI WCAG 2.1 AA +
// signature HTTP unifiée SC-003 anti-énumération). Wrappé par
// `app/layout.tsx` qui pose <html lang="fr-CA">.
//
// Note Next.js 15 : `metadata.title` n'est PAS injecté dans <head> pour
// les not-found pages (limitation du streaming SSR). On rend un
// <title> élément directement dans JSX — React 19 le hoist
// automatiquement dans <head>. Cf.
// https://react.dev/reference/react-dom/components/title

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
    <>
      <title>Page introuvable — Conseiller Voyage</title>
      <meta name="robots" content="noindex,nofollow" />
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
    </>
  );
}
