# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]

**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]

**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]

**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]

**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]

**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]

**Project Type**: [e.g., library/cli/web-service/mobile-app/compiler/desktop-app or NEEDS CLARIFICATION]

**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]

**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]

**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Doit passer avant Phase 0 (recherche). Re-vérifier après Phase 1 (design).*

Pour chaque principe pertinent à la feature, documenter explicitement la conformité.
Les principes **NON-NÉGOCIABLES** (I, II, VI, IX) **DOIVENT** être adressés dans
tous les plans, même brièvement. Source de vérité : `.specify/memory/constitution.md`.

### I. Conformité réglementaire par conception (NON-NÉGOCIABLE)

[Cette feature touche-t-elle, même indirectement, à une réservation, un encaissement
client, un versement fournisseur, ou à l'affichage/notification d'un conseiller ?
Si oui, comment respecte-t-elle la frontière transactionnelle ? Le filtrage du
statut "vérifié" est-il appliqué en couche de données ?]

### II. Vie privée et Loi 25 (NON-NÉGOCIABLE)

[Quelles données personnelles sont collectées ou traitées ? Justification de
chacune via minimisation. Résidence canadienne confirmée pour tout sous-traitant.
Effacement implémenté de bout en bout ? Rétention conforme au tableau de la
constitution ?]

### III. Qualité de lead avant volume

[Si la feature touche au matching ou à la notification : respect du plafond
3 conseillers ? Traçabilité d'état du lead instrumentée dès J1 ?]

### IV. Français d'abord

[Copie utilisateur livrée en FR-CA ? Clés i18n en place pour l'EN futur ?
Formats régionaux (date, monnaie CAD, adresse) corrects ?]

### V. Architecture : monolithe modulaire

[Module concerné. Interfaces publiques utilisées. Le LLM (si utilisé) passe-t-il
bien par `LlmProvider` ? Coût LLM sous le plafond de 0,05 USD/requête ? Cache LLM
en place ?]

### VI. Logique métier déterministe et testée (NON-NÉGOCIABLE)

[La feature introduit-elle de la logique métier sensible (scoring, validation,
acceptation/refus) ? Si oui : tests écrits AVANT implémentation (commits séparés
visibles), fonctions pures sans I/O caché, cas nominal ET cas d'erreur couverts.]

### VII. Observabilité de la boucle économique

[Quelles métriques de la boucle économique (intake completion / acceptation /
conversion / churn) sont touchées ? Instrumentation prévue. Seuils d'alerte
configurés. Tableau de bord lié dans le README du module.]

### VIII. Clean Architecture et SOLID

[Couches respectées (domaine pur, application, infrastructure, interface).
Ports identifiés. Aucun import infrastructure dans domaine ou application.
Application concrète des 5 lettres SOLID dans le découpage proposé.]

### IX. Sécurité applicative (NON-NÉGOCIABLE)

[RBAC vérifié en couche application. AuthN approprié (MFA conseiller).
Validation Zod côté serveur. En-têtes HTTP en place. Checklist OWASP Top 10
revue pour les changements d'endpoint. Aucun secret en clair. Aucun SQL brut.]

### X. Fiabilité et résilience

[SLO endpoints concernés (p95 < 800 ms). Idempotence implémentée pour les
écritures publiques. Modes dégradés documentés pour chaque dépendance externe.
Health checks exposés. Circuit breakers en place.]

### Definition of Done

[Confirmer que la DoD de la constitution (section *Flux de développement*)
sera cochée intégralement avant merge.]

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
