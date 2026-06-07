# Research — Page d'accueil publique différenciante (013)

Phase 0. Aucune `NEEDS CLARIFICATION` ouverte dans le spec ; les points ci-dessous figent
les choix techniques et lèvent les ambiguïtés d'implémentation.

## R1 — Mode de rendu : statique (SSG/ISR)

- **Décision** : page **rendue statiquement** (RSC statique par défaut ; pas de
  `dynamic = 'force-dynamic'`). Contenu i18n connu au build ; aucune donnée par requête.
- **Rationale** : meilleur LCP/CLS (HTML pré-rendu, cacheable CDN), résilience (la home
  survit à une panne DB/Redis/SES — Principe X), conforme aux budgets CWV (FR-011).
- **Alternatives rejetées** : SSR par requête (aucune donnée dynamique → coût inutile,
  LCP dégradé) ; rendu client (viole SSR/SSG obligatoire pour pages publiques, FR-009).

## R2 — Données structurées JSON-LD

- **Décision** : `<script type="application/ld+json">` **inline**, produit par une fonction
  pure `buildHomepageJsonLd(locale, baseUrl)` retournant `Organization` + `WebSite`.
  Réutilise le pattern inline déjà présent (`conseiller/[slug]`, `voyage/nouveau`, legal).
- **Rationale** : pattern établi dans le repo, zéro dépendance nouvelle, testable (SC-007).
  **Sans** `contactPoint` ni `telephone` (cohérent ADR-0002, Principe I).
- **Alternatives rejetées** : librairie tierce (`next-seo`) — hors stack figée, superflu.

## R3 — Internationalisation

- **Décision** : étendre le namespace **`home.*`** de `fr-CA.json` (source canonique) ;
  ajouter les clés EN en stub dans `en.json` (repli FR jusqu'à 024). Aucun fork de gabarit.
- **Réconciliations** :
  - `home.ctaPrimary` « Décrire mon projet » → **« Décrire mon voyage »** (spec FR-001).
  - `home.trust.certificates` « CCV (Québec) et TICO (Ontario) » → **confirmer « OPC/TICO »**
    avec le module conformité (001) avant gel de copie ; ne pas inventer le libellé légal.
- **Rationale** : Principe IV (français d'abord) + FR-008 (zéro copie codée en dur).

## R4 — Garantie anti-marketplace (ADR-0002)

- **Décision** : invariant vérifié par **test automatisé** : (a) *exactement un* CTA
  primaire pointant vers la route d'intake (SC-003) ; (b) *zéro* `mailto:`, `tel:`, zéro
  formulaire de contact, zéro lien menant au contact d'un conseiller (SC-002).
- **Rationale** : transforme une règle produit en garde-fou exécutable (Principe VI/IX).
- **Note** : le concept « jusqu'à 3 » est illustré sans aucune carte conseiller réelle ni
  cliquable (évite la dérive annuaire).

## R5 — Cible du CTA

- **Décision** : `/[locale]/voyage/nouveau` (intake brief, feature 008) via `next/link`
  locale-aware. C'est l'unique route de mise en relation (invariant produit).
- **Rationale** : confirmé par l'inspection du routage (`(public)/voyage/nouveau/page.tsx`).

## R6 — Accessibilité (WCAG 2.1 AA, Principe XI)

- **Décision** : un seul `<h1>` (héro) ; sections en `<section aria-labelledby>` + `<h2>` ;
  `<main>`/`<header>`/`<footer>` sémantiques ; focus visible ; contraste ≥ 4,5:1 via les
  tokens Tailwind existants ; **aucune animation** en v1 → `prefers-reduced-motion`
  trivialement satisfait (FR-016). Job CI `a11y` (axe-core) étendu à `/`.
- **Rationale** : porte axe-core bloquante héritée de 005 ; audit lecteur d'écran recommandé.

## R7 — Performance (CWV, Principe XII)

- **Décision** : héro **texte-only** (LCP = le H1, pas d'image au-dessus de la flottaison) ;
  pas de police web bloquante nouvelle ; pas de JS client (composants RSC) ; dimensions
  réservées pour tout media éventuel (CLS 0). Ajouter `http://localhost:3000/fr` à
  `lighthouserc.json` (Perf ≥ 90 / SEO ≥ 95 / A11y ≥ 95, LCP ≤ 2500, CLS ≤ 0.1).
- **Rationale** : budgets FR-011 ; le job `lighthouse` existant devient bloquant sur la home.

## R8 — Accès conseiller/admin (continuité soft-launch)

- **Décision** : lien **secondaire discret** « Espace conseiller » en en-tête et/ou pied de
  page, sans concurrencer le CTA voyageur, sans information de contact (FR-015).
- **Rationale** : préserve la porte d'entrée pilote sans trahir la cible voyageur de la home.

## Points ouverts (non bloquants pour le plan)

- **Libellé exact de certification** (OPC vs CCV) — à confirmer avec conformité avant gel
  de copie. Tâche de vérification dans `tasks.md`.
