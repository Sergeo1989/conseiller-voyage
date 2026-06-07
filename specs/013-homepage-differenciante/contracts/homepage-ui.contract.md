# Contrat UI — Page d'accueil `/[locale]` (013)

Contrat **testable** de la page d'accueil. Chaque clause est vérifiable par test
automatisé (Vitest composant + Playwright/axe) et trace une exigence du spec.

## Éléments requis (présence)

| Clause | Élément | Exigence |
|---|---|---|
| U1 | **Un seul** `<h1>` portant la promesse (H1 mandaté) | FR-001 |
| U2 | Sous-titre mandaté visible | FR-001 |
| U3 | **Exactement un** CTA primaire « Décrire mon voyage » avec `href` vers `/<locale>/voyage/nouveau` | FR-002, SC-003 |
| U4 | Bandeau « Tous vérifiés OPC/TICO » avec lien vers `/<locale>/comment-ca-marche` | FR-004 |
| U5 | Section « Pourquoi 3, et pas une liste » (3 étapes, copie « jusqu'à 3 ») | FR-003, FR-014 |
| U6 | Section « Indépendant et neutre » | FR-005 |
| U7 | Bandeau Loi 25 (résidence des données + non-partage) | FR-005 |
| U8 | Mention « pourquoi pas de contact direct » avec lien vers `/comment-ca-marche` | FR-006 |
| U9 | CTA répété (même cible que U3, pas un second chemin) | FR-002 |
| U10 | Pied de page (liens légaux + accès conseiller secondaire + langue) | FR-008, FR-015 |

## Invariants (absence / unicité) — garde-fous ADR-0002

| Clause | Invariant | Exigence |
|---|---|---|
| I1 | **0** `mailto:` sur la page | SC-002 |
| I2 | **0** `tel:` sur la page | SC-002 |
| I3 | **0** formulaire de contact / champ de saisie de contact | SC-002 |
| I4 | **0** lien menant au contact direct d'un conseiller ; aucune carte conseiller cliquable | SC-002, FR-007 |
| I5 | **Exactement un** CTA primaire menant à l'intake ; aucun CTA « demander une soumission » | SC-003 |
| I6 | Aucune copie codée en dur : toute chaîne provient d'une clé i18n | FR-008, SC-008 |

## Accessibilité (axe-core + clavier)

| Clause | Exigence | Référence |
|---|---|---|
| A1 | 0 violation axe sérieuse/critique | SC-006, FR-012 |
| A2 | Un seul `<h1>` ; `<h2>` par section avec `aria-labelledby` | FR-012 |
| A3 | Repères sémantiques `<header>`/`<main>`/`<footer>` | FR-012 |
| A4 | CTA et liens atteignables/activables au clavier, focus visible | SC-006 |
| A5 | Contraste ≥ 4,5:1 | FR-012 |
| A6 | Toute animation respecte `prefers-reduced-motion` (v1 : aucune animation) | FR-016 |

## Rendu sans JavaScript

| Clause | Exigence | Référence |
|---|---|---|
| J1 | Contenu principal + CTA (liens) fonctionnels avec JS client désactivé | SC-009, FR-009 |

## Indexabilité

| Clause | Exigence | Référence |
|---|---|---|
| X1 | Réponse 200, pas de `noindex` | FR-013 |
| X2 | Lien canonique présent par langue | FR-013 |
