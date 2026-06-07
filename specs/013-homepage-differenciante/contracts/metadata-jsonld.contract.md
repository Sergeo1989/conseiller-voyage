# Contrat Métadonnées + JSON-LD — Page d'accueil (013)

## Métadonnées (`generateMetadata` dans `app/[locale]/page.tsx`)

| Clause | Champ | Exigence | Réf |
|---|---|---|---|
| M1 | `title` | titre FR-CA explicite (promesse + marque), depuis i18n | FR-010, FR-013 |
| M2 | `description` | résumé FR-CA du positionnement, depuis i18n | FR-010 |
| M3 | `alternates.canonical` | URL canonique par langue (`/<locale>`) | FR-013 |
| M4 | `openGraph` | `title`, `description`, `type: website`, `locale`, `url` | FR-010 |
| M5 | `twitter` | `card: summary_large_image` (ou `summary`) cohérent OG | FR-010 |
| M6 | `robots` | indexable (pas de `noindex`) | FR-013 |

OG image : si un asset social existe, le référencer ; sinon omettre (ne pas bloquer la
porte SEO ; l'image sociale fine peut arriver avec l'infra 017).

## JSON-LD (builder pur `buildHomepageJsonLd(locale, baseUrl)`)

| Clause | Assertion | Réf |
|---|---|---|
| L1 | Retourne un nœud `@type: "Organization"` valide | FR-010, SC-007 |
| L2 | Retourne un nœud `@type: "WebSite"` valide | FR-010, SC-007 |
| L3 | `@context` = `https://schema.org` sur chaque nœud | SC-007 |
| L4 | **Aucune** propriété `contactPoint` | SC-007, ADR-0002 |
| L5 | **Aucune** propriété `telephone` ni `email` | SC-007, ADR-0002 |
| L6 | `url` pointe vers `<baseUrl>/<locale>` | FR-013 |
| L7 | Fonction pure : même entrée → même sortie, aucun I/O | Principe VI |
| L8 | Sérialisé dans un `<script type="application/ld+json">` unique et bien formé | FR-010 |

## Validation

- **Unitaire (Vitest, TDD rouge d'abord)** : L1–L7 sur `buildHomepageJsonLd`.
- **Données structurées** : la sortie passe un validateur Schema.org sans erreur (SC-007).
- **Lighthouse SEO** : ≥ 95 sur `/` (inclut la présence de métadonnées valides).
