# ADR-0025 — Machine d'état du lead : fonction pure du domaine

**Date** : 2026-06-05
**Statut** : proposé (feature 012)
**Décideurs** : équipe technique
**Spec lié** : [012-lead-notifications-state-machine/spec.md](../../specs/012-lead-notifications-state-machine/spec.md), FR-006 + FR-007 + FR-020
**Plan lié** : [012-lead-notifications-state-machine/plan.md](../../specs/012-lead-notifications-state-machine/plan.md), Constitution Check Principe VI
**Research lié** : [012-lead-notifications-state-machine/research.md](../../specs/012-lead-notifications-state-machine/research.md), R4 + R5

---

## Contexte

Le lead d'un conseiller suit un cycle de vie :
`envoye → vu → accepte → refuse → devis_envoye → reservation_confirmee → perdu`.

Cette logique est précisément le cœur métier sensible visé par le Principe VI
(NON-NÉGOCIABLE) : déterministe, testé **avant** implémentation. Les exigences :

- FR-006 : transitions autorisées définies, toute transition non autorisée rejetée.
- FR-007 : historique **append-only** (aucune mutation rétroactive).
- FR-020 : concurrence optimiste + transitions montantes idempotentes (no-op).
- SC-003 : 0 transition illégale acceptée (vérifié par invariant + property tests).

Trois stratégies évaluées pour porter la logique de transition :

| Stratégie | Avantages | Inconvénients |
|---|---|---|
| **Fonction pure du domaine + table de transitions** | Testable en isolation, déterministe, OCP | Persistance de l'état séparée (use case) |
| **Logique dispersée dans les use cases** | Moins de couches | Non testable en isolation, viole VI |
| **Librairie XState** | Outillage riche | Surdimensionné pour une logique triviale, dépendance |

## Décision

Implémenter la machine d'état comme une **fonction pure du domaine** sans I/O :

```
applyLeadTransition(current: LeadState, action: LeadAction, actor: LeadTransitionActor)
  → Result<LeadTransitionOutcome, TransitionError>
```

avec une **table de transitions autorisées** explicite (data-model §Transitions) :

- `envoye → {vu, perdu}`
- `vu → {accepte, refuse, perdu}` (`marquer_vu` sur `vu`+ = **no-op idempotent**)
- `accepte → {devis_envoye, perdu}`
- `devis_envoye → {reservation_confirmee, perdu}`
- terminaux `{refuse, reservation_confirmee, perdu}` : aucune sortie
- `clore_systeme → perdu` autorisé depuis **tout état non terminal** (re-match, all_revoked ; acteur = `systeme`)

L'issue distingue **`applied`** (nouvelle transition à persister), **`noop`**
(idempotent, aucune entrée d'historique) et **`rejected`** (TransitionError).

L'état courant est **dénormalisé** sur `leads.current_state` (mis à jour
transactionnellement avec l'insert de transition) pour permettre le guard de
concurrence optimiste `WHERE current_state = :expected` sans recalcul.

**Valeurs ASCII snake_case** partout (code + DB) ; les libellés accentués FR-CA
vivent uniquement dans l'i18n d'affichage.

### TDD strict

Tests RED commités **avant** GREEN (pattern hérité 008/011). Tests de propriété
`fast-check` : aucune transition hors table acceptée (SC-003, 1 000 tirages) +
idempotence des montées (FR-020).

## Conséquences

### Positives

1. **Principe VI satisfait** — cœur métier déterministe, testé avant implémentation.
2. **Invariant SC-003 trivial** — la table explicite rend la vérification directe.
3. **OCP** — ajout d'un état/transition = une ligne de table + un test, sans toucher aux use cases.
4. **Réutilisable** — la même fonction sert les transitions conseiller (HTTP) et système (re-match, all_revoked, sweep).

### Négatives / risques

1. **Double source d'état** (colonne dénormalisée + historique) — risque de dérive. Mitigation : la colonne n'est mutée que par le use case qui insère aussi la transition, dans la même transaction DB ; trigger append-only sur l'historique.

## Alternatives considérées

| Alternative | Rejet |
|---|---|
| Machine d'état implicite dans les use cases | Non testable en isolation, viole Principe VI |
| Librairie XState | Surdimensionné, dépendance pour une logique triviale |
| Event sourcing pur (pas de colonne état) | Surcoût de lecture injustifié pour le guard de concurrence |

## Statut d'implémentation

À compléter (statut → accepté) à la fin de la Phase 4 (US2) avec les notes
d'implémentation et les références de tests (T033-T035).
