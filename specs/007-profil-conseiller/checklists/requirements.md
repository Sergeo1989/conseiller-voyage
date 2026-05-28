# Specification Quality Checklist: Profil conseiller (public + privé)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-05-27
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
- All quality items pass on first iteration.
- `/speckit-clarify` exécuté le 2026-05-27 (session unique, 5 questions) — décisions actées et intégrées à la section *Clarifications* du spec :
  - Slug : `prenom-nom` slugifié FR-CA + suffixe numérique en cas de collision (Q1)
  - CTA `?suggested=` : boost soft ≤ +10 % cumulé, validité 24 h, sans override du plafond 3 (Q2)
  - Onboarding profil : facultatif avec relances email J+3/J+7/J+14 (Q3)
  - Nom affiché : `Prénom + initiale-nom` par défaut, opt-in nom complet, aucun pseudonyme (Q4)
  - Modération : extension de la console conformité existante (Q5)
- **Passe de cohérence 2026-05-27** (post-clarify, après interruption de session) : 11 écarts détectés et corrigés — US2 description et scenario 4 (alignés sur Q2 et Q4), US3 scenario `verified` + `incomplet` ajouté, US6 « Admin modère un profil » créée avec 4 acceptance scenarios pour cadrer FR-023/FR-024, edge cases « renomme titre/pseudonyme » + « asymétrie slug ↔ nom affiché » + « modération photo » + « re-vérification » reformulés ou ajoutés, FR-003 enum statut étendu (`incomplet`/`prêt`/`masqué_admin`/`anonymisé`), FR-005 clarifié (terminal vs masquage), FR-007 liste 404 explicite, FR-008a mécanique middleware Next.js précisée, FR-016 liste PII anonymisées détaillée, Key Entities `ConseillerProfile` champs typés et statut/raisonMasquageAdmin ajoutés, naming `masqué_admin` aligné (suppression de `profil_masqué_admin` et `non-visible`).
- **Revue architecte 2026-05-27** (post-plan, avant tasks) : 13 findings appliqués sur plan + research + data-model + contracts + spec. **Critiques P0** : (C1) liste de slugs réservés framework `SLUGS_RESERVES_FRAMEWORK` pour éviter collision routes Next.js, (C2) invalidation CloudFront en complément de `revalidatePath` pour SC-006 ≤ 10s, (C3) magic number WebP corrigé à 12 octets (RIFF + WEBP), (C4) pipeline transactionnel S3 ↔ DB avec statut `pending_upload`/`commit`/`evicted` + worker quotidien `cleanup-orphan-photos.worker.ts`, (C5) `generateStaticParams` retourne `[]` + `dynamicParams = true` (anti build long à 5k+ profils) + plan pagination sitemap > 50k URLs. **Modérés P1** : (M1) ADR-0015 sur slug réservé Loi 25 + `conseillerIdOrigine = NULL` post-anonymisation, (M2) StepUpGuard sur retirer-photo et masquer (actions destructrices), (M3) test anti-marketplace en 2 niveaux (regex sources rapide + e2e Playwright), (M4) FR-006b ajouté (avertissement explicite avant opt-in nom complet + politique Loi 25), (M5) rate-limit 10 uploads/h/conseiller, (M6) statut profil persisté + recalculé à chaque transition (use cases), (M7) URLs CloudFront publiques stables via OAC (pas de signed URL) pour cache navigateur long terme, (M8) clarification port vs use case, (M9) naming `prenomLegal`/`nomLegal` standardisé. **Modernité P2** : (L1) Next.js 15 `params: Promise<...>` async, (L2) React 19 `useActionState`, (L3) PPR opt-in sur la page profil, (L4) `Result<T, E>` (discriminated union) pour erreurs métier remplace exceptions.
