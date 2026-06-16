# Implementation Plan: Enrichissement LLM de l'intake voyageur

**Branch**: `016-intake-llm-enrichment` | **Date**: 2026-06-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/016-intake-llm-enrichment/spec.md` (roadmap **009**).

## Summary

Couche d'**enrichissement best-effort** du brief d'intake (008), au service du matching
(011). Un port `LlmProvider` (nouveau, Bedrock `ca-central-1` derrière l'interface) extrait
des **intentions structurées** depuis les seuls champs texte libre du brief (`budgetNote`,
`specialityOther`, notes de région) — valeur concrète (clarifications 2026-06-15) :
**résoudre `speciality = 'autre'` → spécialité canonique** ET **augmenter l'ensemble de
destinations** (union, déterministes toujours conservées), sous seuil de confiance. Aucun
texte libre (ni langue détectée) n'est persisté (minimisation Loi 25) ; un **avis de traitement
automatisé** léger est ajouté (FR-016). L'enrichissement vit **en arrière-plan, en amont du
scoring** : un consumer intake sur `voyageur.brief.activated` lance le job, qui **expurge la PII**
du texte libre (FR-017) avant l'appel LLM, persiste l'enrichi, **puis publie
`voyageur.brief.enriched`** ; le `BriefActivatedConsumer` du matching est **repointé** sur cet
événement (révision 2026-06-15 — le câblage activation→matching étant lui-même déjà différé). Il
**ne touche jamais** le chemin voyageur, **ne bloque jamais** le matching (timeout + sweep), et
**n'écrase jamais** une donnée validée déterministe. Idempotent par `briefId`, coût borné, région
CA, anti-PII, cascade Loi 25. Couplage inter-module : port public `BriefEnrichmentQueryPort` +
événement `voyageur.brief.enriched`.

## Technical Context

**Language/Version** : TypeScript ≥ 5 strict.

**Primary Dependencies** : NestJS + Fastify · Prisma · BullMQ (job d'enrichissement) ·
Zod (validation de la sortie LLM) · OTel (métriques) · **AWS Bedrock ca-central-1** (adaptateur
`LlmProvider`, ADR-0028). Domaine pur (zéro SDK).

**Storage** : PostgreSQL ≥ 16 — nouvelle table `brief_enrichments` (1:1 idempotente par
`briefId`) + enum `EnrichmentStatus` + trigger de cascade Loi 25. Aucune modif de
`voyageur_briefs` ni des tables matching.

**Testing** : Vitest (fonctions pures `mergeEnrichmentIntoSnapshot` + validation/sanitisation
sortie LLM, **TDD**) · Testcontainers (job idempotent, cascade, mode dégradé) · fake
`LlmProvider` déterministe (aucun appel réseau en test) · scan anti-PII étendu.

**Target Platform** : API NestJS (ECS Fargate ca-central-1) + worker BullMQ.

**Project Type** : Web (monolithe modulaire — backend `apps/api`, module `intake`). Aucun front.

**Performance Goals** : enrichissement sous **budget strict** (timeout court, p. ex. ≤ 3 s) ;
**0** ajout de latence au chemin voyageur (post-activation, arrière-plan, SC-001). Coût
LLM **≤ 0,05 USD/requête** (Principe V).

**Constraints** : Loi 25 / région CA (FR-004/005/015) ; mode dégradé obligatoire
(FR-002/013) ; déterminisme préservé (FR-003) ; idempotence (FR-007) ; anti-marketplace
ADR-0002 (FR-011) ; frontière de confiance LLM — sortie validée avant usage (FR-006).

**Scale/Scope** : régime de démarrage (≤ quelques centaines de briefs/jour) ; 1 module
backend, ~1 nouvelle table, 1 port nouveau + 1 port public, 1 job + 1 sweep.

## Constitution Check

*GATE : passé avant Phase 0, re-vérifié après Phase 1.*

### I. Conformité réglementaire (NON-NÉGOCIABLE) — ✅ PASS
Aucune touche à une réservation/encaissement/versement. L'enrichissement n'introduit ni
montant, ni lien de réservation, ni coordonnée (FR-011, anti-marketplace ADR-0002, invariant
testé sur les intentions structurées + la vue du port). N'affecte pas le filtre `verified` du
matching (inchangé, FR-008). Aucun texte libre n'est stocké ni exposé (minimisation).

### II. Vie privée et Loi 25 (NON-NÉGOCIABLE) — ✅ PASS
**Minimisation** : seuls le texte de projet (`budgetNote`, `specialityOther`, notes de région)
+ champs structurés **non identifiants** sont envoyés au LLM ; `voyageurContactId` et toute
PII de contact **exclus** (FR-004, SC-004). **Scrub PII du texte libre (FR-017, révision
2026-06-15)** : `budgetNote`/`specialityOther`/notes expurgés par filtre déterministe (regex
courriel/téléphone) **avant** l'appel LLM — le voyageur peut y taper une coordonnée. **Région
CA** : Bedrock ca-central-1 (FR-005, SC-008). **Minimisation renforcée** : **aucun texte libre
ni langue détectée persistés** — seules les intentions structurées (**spécialité, destinations**)
sont stockées → surface anti-PII minimale. **Avis de traitement automatisé** léger ajouté
(FR-016 ; divulgation intake + politique Loi 25 / feature 004), sans porte de consentement
dédiée. **Effacement** : cascade trigger Postgres (pattern ADR-0023) neutralise les
destinations enrichies quand le brief est anonymisé (FR-015). **Anti-PII defense-in-depth** :
scan étendu aux tables d'enrichissement.

### III. Qualité de lead avant volume — ✅ PASS
Améliore la **qualité** d'appariement (résolution de `autre` → meilleure pertinence, SC-006)
sans toucher au **plafond 3** ni à la traçabilité d'état (matching/012 inchangés, FR-008).

### IV. Français d'abord — ✅ PASS
FR-CA par défaut ; prise en charge d'une saisie non francophone (langue détectée comme
intention, FR-012). **Copie utilisateur nouvelle** = l'avis de traitement automatisé (FR-016,
clarification 2026-06-15) → rédigée **FR-CA** + clés i18n (EN), intégrée à l'intake / politique
Loi 25 (feature 004).

### V. Architecture : monolithe modulaire — ✅ PASS
Module **intake**. LLM **derrière `LlmProvider`** (constitution). **Plafond coût ≤ 0,05 USD/req**
(maxTokens + troncature). **Cache** = le `BriefEnrichment` idempotent par `briefId` (0 ré-appel,
FR-007). Couplage inter-module **uniquement** via le port public `BriefEnrichmentQueryPort`
(matching le lit ; ne touche jamais la table).

### VI. Logique métier déterministe et testée (NON-NÉGOCIABLE) — ✅ PASS
Seule logique sensible nouvelle = **fonctions pures** : `mergeEnrichmentIntoSnapshot` (règle
de fusion : déterministe prévaut ; `speciality` enrichie seulement si `autre` + confiance ≥
seuil ; `destinations` = **union** sous seuil, déterministes toujours conservées) et la
**validation/sanitisation de la sortie LLM**. **TDD obligatoire** (tests écrits AVANT, commits
séparés ; cas : déterministe-prévaut, union destinations, confiance < seuil, sortie non
fiable). La validation de brief 008 reste inchangée.

### VII. Observabilité — ✅ PASS
Métriques OTel `cv.intake.enrichment.*` (attempts/success/fallback par cause/latency/tokens),
surveillent le taux de mode dégradé. Pas de nouvelle métrique de boucle économique (agit en
amont du taux d'acceptation 012). Lié au README du module intake.

### VIII. Clean Architecture & SOLID — ✅ PASS
`domaine` : `EnrichedIntentions` (VO), `mergeEnrichmentIntoSnapshot` (pur), interfaces de port
— zéro framework. `application` : `EnrichBriefUseCase`. `infrastructure` : `BedrockLlmProvider`,
`PrismaBriefEnrichmentRepository`, `EnrichBriefJob` (BullMQ), trigger SQL. `interface` : n/a
(pas d'endpoint public ; déclenché par event). DIP : application dépend des ports, pas de
Bedrock. SRP : port LLM ≠ use case ≠ persistance ≠ fusion scoring.

### IX. Sécurité applicative (NON-NÉGOCIABLE) — ✅ PASS
Pas de nouvel endpoint exposé (déclenchement interne par event) → surface d'attaque nulle
côté HTTP. **Frontière de confiance LLM** : sortie **non fiable**, validée Zod avant toute
persistance/usage (FR-006, SC-009) — empêche l'injection de données via le modèle. Aucun
secret en clair (Bedrock via Secrets Manager). Aucun SQL brut applicatif (le seul SQL est le
trigger de cascade, justifié comme les triggers 008/011). Pas de PII en logs.

### X. Fiabilité et résilience — ✅ PASS
**Mode dégradé** documenté pour chaque panne (timeout/indispo/schéma/confiance/job perdu/entrée
vide — cf. contracts/enrichment-flow.md) : le matching s'exécute **toujours**. **Idempotence**
par `briefId` (FR-007). **Sweep de réconciliation** (pattern 012) = filet anti-perte de job.
Budget de temps strict (pas de blocage). SLO : le chemin voyageur n'est pas touché.

### Definition of Done
DoD constitution cochée avant merge : Vitest (purs, TDD) + Testcontainers verts ; lint
Biome ; tsc ; boundaries ; scan anti-PII vert (tables d'enrichissement) ; invariant
anti-marketplace ; FR-CA/i18n ; **ADR-0028** mergé ; **avis de traitement automatisé** (FR-016)
implémenté — divulgation intake + politique Loi 25 (feature 004) ; migration testée en
staging ; coût LLM mesuré sous plafond.

## Project Structure

### Documentation (this feature)

```text
specs/016-intake-llm-enrichment/
├── plan.md              # Ce fichier
├── research.md          # Phase 0 — décisions (surface texte, placement, port, idempotence, Loi 25)
├── data-model.md        # Phase 1 — BriefEnrichment + EnrichedIntentions + fonction de fusion
├── quickstart.md        # Phase 1 — parcours de validation
├── contracts/
│   ├── llm-provider.port.md          # port LLM (nouveau)
│   ├── brief-enrichment.port.md      # port public lu par le matching
│   └── enrichment-flow.md            # déclencheur → job → matching + modes dégradés
└── tasks.md             # Phase 2 (/speckit-tasks — NON créé ici)
```

### Source Code (repository root)

```text
apps/api/src/modules/intake/
├── domain/
│   ├── value-objects/enriched-intentions.ts        # VO + schéma Zod cible
│   └── services/
│       ├── merge-enrichment-into-snapshot.ts       # fonction PURE (TDD)
│       └── scrub-contact-pii.ts                    # fonction PURE (TDD) — FR-017 scrub texte libre
├── application/
│   ├── ports/llm-provider.port.ts                  # NOUVEAU port (interface)
│   ├── ports/brief-enrichment-repository.port.ts
│   ├── ports/brief-enrichment-query.port.ts        # PUBLIC (consommé par matching)
│   └── use-cases/enrich-brief.use-case.ts
├── infrastructure/
│   ├── llm/bedrock-llm-provider.ts                 # adaptateur Bedrock ca-central-1
│   ├── llm/__fakes__/fake-llm-provider.ts          # test double déterministe
│   ├── prisma-brief-enrichment-repository.ts
│   ├── prisma-brief-enrichment-query.ts            # adaptateur du port public
│   └── jobs/
│       ├── brief-activated.consumer.ts             # consumer intake → EnrichBriefJob
│       ├── enrich-brief.job.ts                     # BullMQ : scrub→LLM→persist→publish enriched
│       └── enrichment-reconciliation.sweep.ts      # filet (pattern 012)
├── intake.module.ts                                # + enregistrement DI (providers/ports/job)
└── (interface/ : aucun endpoint — déclenché par event)

apps/api/src/modules/intake/.../outbox                # + eventType 'voyageur.brief.enriched'

apps/api/src/modules/matching/
├── application/ports/brief-snapshot-reader.port.ts  # étendu : compose enrichi via le port public
├── infrastructure/jobs/brief-activated.consumer.ts  # REPOINTÉ sur 'voyageur.brief.enriched'
├── matching.module.ts                               # + injection BriefEnrichmentQueryPort
└── ...                                              # scoring INCHANGÉ (poids, plafond 3, verified)

packages/db/prisma/schema/intake.prisma             # + model BriefEnrichment + enum + 2 migrations (table, trigger)
packages/shared/src/intake/enrichment.ts            # types EnrichmentStatus / EnrichedIntentions / vue port
tools/check-no-pii-matching-audit.ts (ou jumeau)     # scan étendu à brief_enrichments
docs/adr/0028-llm-provider-intake-enrichment.md      # ADR fournisseur LLM + placement
```

**Structure Decision** : backend-only, module `intake`. L'enrichissement est une couche
additive autour du brief 008 ; le matching le consomme via un port public. Aucune nouvelle
table dans 008/011 ; le scoring n'est pas modifié (seule l'entrée `speciality=autre` est
résolue via une fonction pure).

## Complexity Tracking

> Aucune violation de la Constitution Check. `LlmProvider` est mandaté par la constitution ;
> le trigger SQL de cascade suit le pattern établi (ADR-0023) ; le sweep réutilise 012.
> Pas de *Complexity Tracking* requis.

## Phasing

- **Phase 0 — research.md** : surface réelle de texte libre, placement (timing) du flux,
  port `LlmProvider`, idempotence/coût, Loi 25, déterminisme, observabilité. ✅
- **Phase 1 — data-model.md + contracts/ + quickstart.md** : `BriefEnrichment`,
  `EnrichedIntentions`, fonction de fusion pure, port LLM, port public, flux + modes dégradés,
  parcours de validation. ✅ + **ADR-0028** (décision structurante fournisseur LLM).
- **Phase 2 — tasks.md** (`/speckit-tasks`) : Setup → Foundational (port + schéma + migration)
  → US1 (enrichissement non bloquant + mode dégradé, TDD fonctions pures d'abord) → US2
  (consommation matching via port public — speciality + union destinations) → US3
  (idempotence/coût/observabilité) → Polish (scan anti-PII étendu, **avis FR-016** dans
  l'intake + politique Loi 25 / feature 004, runbook, ADR).
