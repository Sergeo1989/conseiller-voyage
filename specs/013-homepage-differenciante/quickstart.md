# Quickstart — Page d'accueil publique différenciante (013)

## Pré-requis

- Monorepo installé (`pnpm install` à la racine).
- Travailler dans `apps/web`.

## Lancer en dev

```bash
pnpm --filter @cv/web dev
# Ouvrir http://localhost:3000/fr  → page d'accueil voyageur
```

## Vérifier le contenu et les invariants (mappés aux Success Criteria)

| Vérification | Comment | SC |
|---|---|---|
| H1 + sous-titre + CTA au-dessus de la flottaison | Charger `/fr`, viewport mobile + desktop | SC-001 |
| Un seul CTA primaire vers l'intake | Inspecter la page ; `href` = `/fr/voyage/nouveau` | SC-003 |
| Zéro contact direct | Rechercher `mailto:`, `tel:`, formulaire de contact → 0 | SC-002 |
| Liens pédagogiques | Bandeau OPC/TICO + mention anti-contact → `/fr/comment-ca-marche` | — |
| Rendu sans JS | DevTools → désactiver JavaScript → contenu + CTA fonctionnels | SC-009 |
| JSON-LD | Voir `<script type="application/ld+json">` ; valider sur un validateur Schema.org ; 0 `contactPoint`/`telephone` | SC-007 |

## Tests automatisés

```bash
# Unitaires + composant (builder JSON-LD pur + invariants de contenu) — TDD rouge d'abord
pnpm --filter @cv/web test -- home

# Accessibilité (Playwright + axe-core), tag @a11y
pnpm --filter @cv/web test:a11y -- --grep @a11y

# Lighthouse CI (perf/seo/a11y) — la home (/fr) doit être dans lighthouserc.json
pnpm --filter @cv/web build && pnpm --filter @cv/web start &
npx lhci autorun
```

## Portes qualité attendues (DoD)

- Vitest : builder JSON-LD + invariants de contenu **verts** (SC-002/003/007).
- axe-core : **0** violation sérieuse/critique sur `/` (SC-006).
- Lighthouse : Perf ≥ 90, SEO ≥ 95, A11y ≥ 95 ; LCP < 2,5 s, CLS < 0,1 (SC-004/005).
- Biome lint + `tsc` : verts.
- Copie 100 % FR-CA via i18n (SC-008) ; EN stub présent.

## À confirmer avant gel de copie

- Libellé exact de certification (**OPC/TICO** vs « CCV/TICO » de l'ancienne clé) avec le
  module conformité (001).
