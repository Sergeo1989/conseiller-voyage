# Tasks: Profil conseiller (public + privé) — feature 005 / dossier `007-profil-conseiller`

**Input**: Design documents from `specs/007-profil-conseiller/`

**Prerequisites**: spec.md (24 FRs, 6 US), plan.md, research.md, data-model.md,
contracts/ (7 fichiers), quickstart.md

**Tests** : **OBLIGATOIRES** (constitution Principe VI TDD + DoD complète :
unit `@cv/profil-domain`, intégration Testcontainers, e2e Playwright,
axe-core CI, Lighthouse CI).

**Organisation** : tâches groupées par user story pour permettre une
implémentation et un test indépendants de chaque story.

## Format: `[ID] [P?] [Story] Description`

- **[P]** : peut s'exécuter en parallèle (fichiers différents, pas de dépendance)
- **[Story]** : US1, US2, ... pour les phases user story (foundational/polish non taggés)
- Chemin de fichier exact dans chaque description.

## Path Conventions (extraites de plan.md)

- **Domaine** : `packages/profil-domain/`
- **API** : `apps/api/src/modules/identite/`, `apps/api/src/modules/conformite/`,
  `apps/api/src/workers/`, `apps/api/src/cli/`
- **Web** : `apps/web/src/app/`, `apps/web/src/middleware.ts`
- **DB schema** : `packages/db/prisma/schema/profil.prisma`
- **Email templates** : `packages/email-templates/profil/`
- **Outils CI** : `tools/`
- **IaC** : `infra/cdk/` (extension de l'infra existante)

---

## Phase 1 : Setup (infrastructure partagée)

**Purpose** : initialisation du package domaine + schéma Prisma + bucket S3
+ secrets. Aucune logique métier ici.

- [X] T001 Créer le package `packages/profil-domain/` avec `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `README.md`, `src/index.ts` placeholder
- [X] T002 `@cv/profil-domain` couvert par `pnpm-workspace.yaml` (`packages/*` pattern) ; `turbo.json` étendu avec env vars `AWS_S3_BUCKET_PROFILES`, `AWS_KMS_PROFILES_KEY_ID`, `CLOUDFRONT_PROFILES_DISTRIBUTION_ID`, `CLOUDFRONT_PROFILES_PUBLIC_URL`, `CV_SUGGESTED_COOKIE_SECRET`, `CV_REVALIDATE_SECRET` dans `globalPassThroughEnv`
- [X] T003 [P] Créer `packages/db/prisma/schema/profil.prisma` complet (5 modèles + 4 enums + relations + index) + extension `auth.prisma` (`firstName`, `lastName`, relation `conseillerProfile`) — `prisma validate` ✓ (1 warning préexistant non lié)
- [ ] T004 [P] Créer le bucket S3 `cv-profiles-photos-ca-central-1` via `infra/cdk/lib/profile-photos-bucket.ts` avec SSE-KMS, ACL private, bucket policy AllowCloudFrontOAC (cf. research.md R2)
- [ ] T005 [P] Créer la distribution CloudFront `cdn-profiles.conseiller-voyage.ca` avec OAC pointant sur le bucket S3, `Cache-Control: public, max-age=31536000, immutable` sur `/profiles/*` (cf. research.md R2 + M7)
- [ ] T006 [P] Ajouter les secrets `CV_SUGGESTED_COOKIE_SECRET` (32 octets aléatoires) et `CV_REVALIDATE_SECRET` dans AWS Secrets Manager `ca-central-1` (prod) et 1Password CLI (dev) — cf. plan.md Principe IX
- [ ] T007 [P] Étendre `infra/cdk/lib/secrets-stack.ts` pour exposer `AWS_S3_PROFILES_BUCKET`, `AWS_KMS_PROFILES_KEY_ID`, `CV_SUGGESTED_COOKIE_SECRET`, `CV_REVALIDATE_SECRET`, `CLOUDFRONT_PROFILES_DISTRIBUTION_ID` au runtime ECS
- [X] T008 Migration appliquée `20260527174136_init_db` (générée auto par `prisma migrate dev`) : 5 enums + 8 tables `profile_*` + join tables M-N + index + FK + AlterTable `auth_users` (firstName, lastName, unique email) ; puis migration `20260527174200_profil_immutability_triggers` manuelle pour les triggers + check constraint cohérence raison masquage
- [X] T009 Migration `20260527174400_seed_profil_enums` appliquée : 12 spécialités + 12 zones + 6 langues FR-CA avec ON CONFLICT DO NOTHING idempotent
- [X] T010 Colonnes `firstName/lastName` ajoutées à `auth_users` via migration `20260527174136_init_db` (auto Prisma) + backfill SQL via migration manuelle `20260527174300_auth_user_legal_names_backfill` (split naïf sur 1er espace, idempotent via guard `WHERE firstName IS NULL OR lastName IS NULL`)
- [X] T010b 3 use cases étendus pour peupler firstName/lastName : `signup-conseiller.use-case.ts`, `bootstrap-admin.use-case.ts`, `consume-admin-invitation.use-case.ts`. `name` concaténé conservé pour rétrocompatibilité Auth.js. Typecheck @cv/api OK.

---

## Phase 2 : Foundational (prérequis bloquants — TDD strict Principe VI)

**Purpose** : logique métier pure du domaine + ports + adaptateurs +
outils CI. **Aucune US ne peut commencer avant cette phase**.

**⚠ TDD obligatoire** : tests RED → commit, puis implémentation GREEN → commit
séparé visible dans git (constitution Principe VI).

### Logique pure du domaine (TDD)

- [X] T011 result.ts (Result<T,E> discriminated union + ok/err helpers)
- [X] T012 + T013 paire TDD slug — 27 tests verts (slugify FR-CA + NFD/diacritic strip + oe/ae + particules + SLUGS_RESERVES_FRAMEWORK + désambiguïsation FIFO + 100-attempts cap)
- [X] T014 + T015 paire TDD magic-number — 11 tests verts (JPEG/PNG/WebP 12 octets + faux positif WAV/AVI rejeté + buffer < 12 octets null)
- [X] T016 + T017 paire TDD statut-profil — 12 tests verts (matrice 16 combinaisons + anonymise terminal + masqueAdmin override + profilEstComplet 7 champs)
- [X] T018 + T019 paire TDD nom-affiche — 11 tests verts (table R5 : Marie D., Jean-Pierre G., Sébastien T., Anne P., Marc S., Marie D., Élise C. + mode complet)
- [X] T020 + T021 paire TDD suggested-window — 7 tests verts (bordures 24h + drift négatif rejeté)
- [X] T022 + T023 paire TDD suggested-cookie — 12 tests verts (HMAC SHA-256 + base64url roundtrip + tampering + secret rotation + version inconnue + FIFO 10 + dédoublonnage par cid)
- [X] T024 DTOs Zod (EditerProfilDto, UploadPhotoDto, MasquerProfilDto + RetablirProfilDto, SuggestedCookieEntryDto)
- [X] T025 Barrel src/index.ts complet (8 exports : result, slug, magic-number, statut-profil, nom-affiche, suggested-window, suggested-cookie, dtos)

### Ports applicatifs (interfaces, pas d'implémentation)

- [X] T026 Port ProfilConseillerRepository (snapshot + CRUD + findBySlug + listSlugsPubliables + publish + updateStatut + anonymize)
- [X] T027 Port PhotoHistoriqueRepository (saga pending_upload → commit → evicted + findOlderPendingThan pour cleanup orphans)
- [X] T028 Port SlugReservationRepository (reserve append-only + isReserved + listAll)
- [X] T029 Port PhotoStorage (S3 upload/delete/listKeysWithPrefix, SSE-KMS implicite côté adapter)
- [X] T030 Port CloudFrontCacheInvalidator (invalidatePaths, best-effort)
- [X] T031 Port OnboardingRelanceScheduler (planifierRelances/annulerRelances + ETAPE_DELAY_MS constante)
- [X] T032 Port ProfilModerationAuditWriter (append-only avec adminEmailHash SHA-256)
- [X] T033 Port AuthUserLegalNameReader (renommé A1 — lit AuthUser.firstName/lastName via @cv/db)
- [X] T034 Port ProfilPublicReader (ProfilPublicPayload + lireParSlug null-anti-énumération + lireSlugsPubliables)
- [X] T035 Port EstProfilPublicPort exposé via @cv/shared/profil-public (interface) + symbole DI côté apps/api (estPublic + filtrerPublics batch)

### Adaptateurs Prisma (infrastructure)

- [X] T036 PrismaProfilConseillerRepository (CRUD + select complet avec sets M-N + saga tx + publish + anonymize)
- [X] T037 PrismaPhotoHistoriqueRepository (insertPending + markCommit + deletePending compensation + markEvicted + findOlderPendingThan cleanup)
- [X] T038 PrismaSlugReservationRepository (upsert idempotent append-only + isReserved + listAll)
- [X] T039 S3PhotoStorage (PutObjectCommand SSE-KMS conditionnel prod + DeleteObject + ListObjectsV2 pagination)
- [X] T040 AwsCloudFrontCacheInvalidator (CreateInvalidationCommand + no-op dev local + best-effort prod avec s-maxage 300 filet)
- [X] T041 BullmqOnboardingRelanceScheduler (3 jobs delayed J+3/7/14 + jobId déterministe idempotence + annulerRelances via getJob+remove)
- [X] T042 PrismaProfilModerationAuditWriter (SHA-256 email admin + append-only Postgres trigger enforce)
- [X] T043 PrismaAuthUserLegalNameReader (lit AuthUser.firstName/lastName via @cv/db — A1)
- [X] T044 PrismaProfilPublicReader (anti-énumération + filtre statut+conformité + formaterNomAffiche + URL CloudFront stable + defense-in-depth champs obligatoires)
- [X] T045 PrismaEstProfilPublic (AND statut=pret + conformité.verified + filtrerPublics batch ; aucune fuite raison)

### Wiring NestJS

- [X] T046 IdentiteModule wiring : 10 providers profil (ports → adapters) + forwardRef(ConformiteModule) + BullMQ queue identite.onboarding-reminders + export EST_PROFIL_PUBLIC_PORT
- [X] T047 ConformiteModule étendu : token CONFORMITE_QUERY_PORT centralisé dans @cv/shared/conformite (Symbol.for) + provider useExisting ConformiteQueryFacade + export
- [X] T048 app.module.ts inchangé — wiring transitif via ConformiteModule (qui importe IdentiteModule). forwardRef gère le cycle.

### Outils CI (invariants)

- [X] T049 tools/check-no-contact-fields-profile.ts : regex sources sur apps/web/src/app/[locale]/conseiller/[slug]/, mailto/tel/sms + chats externes + form action + aria-label, skip silencieux si page pas encore livrée
- [X] T050 tools/check-anti-enum-profile.ts : placeholder délègue aux tests e2e Playwright T075 (s'active quand page.tsx existera)
- [X] T051 check-module-boundaries.ts étendu : Profile/profile_ dans MODULE_PREFIXES.identite + autorisés cross-module (ConformiteQueryPort/Facade/Module/StatusChanged + enums Prisma profil)
- [X] T052 CI .github/workflows/ci.yml : job module-boundaries étendu avec check-no-contact-fields-profile + check-anti-enum-profile
- [X] T052a i18n catalog FR-CA : ~80 clés ajoutées dans fr-CA.json (profil.public, profil.edition avec avertissement FR-006b Loi 25, profil.dashboard, profil.apercu, profil.intake.suggestedIndicateur, admin.profils, emails.profil.masqueAdmin + onboardingReminderJ3/J7/J14)

**Checkpoint** : foundation prête. Les 6 US peuvent maintenant démarrer en parallèle si l'équipe le permet (sinon, MVP = US1 + US2 séquentiel).

---

## Phase 3 : User Story 1 — Conseiller édite son profil privé (P1) 🎯 MVP

**Goal** : un conseiller vérifié peut compléter et modifier son profil
(titre, biographie, spécialités, zones, langues, années, photo,
afficherNomComplet) avec validation côté serveur, FIFO photos, audit
immutable. Statut profil basculé en `prêt` au premier passage complet.

**Independent Test** : seed un conseiller vérifié, login, /conseiller/profil,
remplir tous les champs, sauvegarder, reload — valeurs persistées, statut
passe à `prêt`, slug `marie-dupont` généré, `publishedAt` set.

### Tests pour US1 (TDD intégration)

- [X] T053 [P] [US1] **[TDD RED]** Tests intégration `apps/api/test/integration/profil/lire-profil-prive.spec.ts` (Testcontainers Postgres) — couvre `LireProfilPriveUseCase` (retour payload complet, profil inexistant, profil anonymisé refus)
- [ ] T054 [P] [US1] **[TDD RED]** Tests intégration `apps/api/test/integration/profil/editer-profil.spec.ts` couvrant les acceptance scenarios US1 + Result error cases (`PROFIL_ANONYMISE`, `CGU_OBSOLETES`, `VALIDATION_FAILED`, `OWNERSHIP_MISMATCH`, `CONFORMITE_INDISPONIBLE`)
- [ ] T055 [P] [US1] **[TDD RED]** Tests intégration `apps/api/test/integration/profil/uploader-photo.spec.ts` couvrant : upload JPEG OK, WAV renommé .webp rejeté `CONTENU_NON_IMAGE`, > 5 Mo rejeté `TAILLE_DEPASSE`, 4097×4097 rejeté `DIMENSIONS_DEPASSE`, FIFO eviction à la 6e, **scénario d'échec compensation** (mock S3 PUT OK puis UPDATE DB échoue → photo orpheline gérée par cleanup-orphan worker), rate-limit 11e upload dans la même heure → `RATE_LIMIT_DEPASSE`
- [ ] T056 [P] [US1] **[TDD RED]** Tests intégration de transition `incomplet → prêt` au save : `apps/api/test/integration/profil/publication-initiale.spec.ts` couvrant génération slug unique + `publishedAt = NOW()` + annulation relances onboarding + émission event `ProfilConseillerPublishedEvent` + invalidation Next.js + CloudFront

### Implémentation US1

- [X] T057 LireProfilPriveUseCase — combine profil DB + nom légal + conformité + nom affiché formaté + champs manquants FR-012a
- [X] T058 EditerProfilUseCase — Result<T,E> + validation Zod + ownership + recalcul statut + premier publish (slug + publishedAt) + annulation relances + invalidations cache + audit
- [X] T059 UploaderPhotoUseCase saga — magic number 12 octets + sharp metadata + insertPending → PUT S3 → COMMIT DB tx + compensation + FIFO eviction 5 photos + recalcul statut + invalidations
- [X] T060 ProfilConseillerController NestJS — GET /api/profil/me + POST /api/profil + POST /api/profil/photo multipart, guards AuthGuard + RoleGuard(conseiller), mapping Result<T,E> → HTTP
- [ ] T060a [US1] ~~Pré-investigation event 001~~ **Résolu par exploration D** : event existe sous le nom `ConformiteStatusChangedEvent` (cf. `apps/api/src/modules/conformite/domain/events/conformite-status-changed.event.ts`). Signature confirmée : `{type: 'conformite.status.changed', conseillerId, previousStatus, newStatus, transitionKind: 'positive'|'negative', cause: StatusTransitionCause, occurredAt, correlationId}`. Diffusion via `ConformiteEventPublisher.subscribe(handler)` (Redis pub/sub — cf. `ConformiteQueryFacade.onModuleInit`). Tâche conservée pour la numérotation.
- [X] T061 ConformiteStatusChangedListener — souscription via ConformiteEventPublisher.subscribe (Redis pub/sub), gère 1re vérif + transitions négatives + re-vérifications. Idempotent. Build NestJS DI OK.
- [ ] T061a [US1] **[TDD RED + GREEN]** Tests intégration listener `apps/api/test/integration/profil/conformite-status-changed-listener.spec.ts` (nom fichier corrigé) couvrant : (a) event `{previousStatus:'pending', newStatus:'verified', transitionKind:'positive'}` → crée profil + planifie 3 jobs BullMQ + statut `incomplet` ; (b) event reçu 2× pour le même conseillerId → idempotent (pas de double création grâce check existence + `jobId` déterministe) ; (c) event `{newStatus:'suspended'|'revoked', transitionKind:'negative'}` → recalcule statut → invalidations Next.js + CloudFront appelées ; (d) event `{previousStatus:'suspended', newStatus:'verified'}` (re-vérification) profil `incomplet` → **les relances NE sont PAS re-déclenchées** (edge case spec) ; (e) event re-vérification profil au statut `pret` → page publique redevient accessible ≤ 60 s, aucune relance émise. Mock `ConformiteEventPublisher.subscribe` pour injecter les events de test.
- [X] T062 Build NestJS @cv/api OK (234 fichiers SWC) — DI graph valide, listener wiré, controller exposé, sharp ajouté aux deps
- [X] T063 Server Action editerProfilAction (Next.js 15) — validation Zod côté client + forward session cookie + mapping Result<T,E> → kind discriminated union + revalidatePath
- [X] T064 Server Action uploaderPhotoAction multipart — forward File natif vers API NestJS + mapping status HTTP → kind error
- [X] T065 Page apps/web/src/app/[locale]/conseiller/profil/page.tsx Server Component — auth() + lireProfilPriveAction + 3 variantes ProfilStatutBanner (prêt/incomplet/masque_admin) + noindex/nofollow
- [X] T066 Composant ProfilForm client (react-hook-form + zodResolver EditerProfilDto) — champs titre + biographie avec compteur aria-live + anneesExperience + erreurs serveur + success state + useTransition pending
- [X] T067 Composant PhotoUpload client — input file accept JPEG/PNG/WebP + 5 Mo cap + preview URL.createObjectURL + mapping 7 erreurs Result + aria-live pour pending
- [X] T068 Composant MultiSelectField inline dans ProfilForm — chip buttons aria-pressed + max enforced + 12 spécialités + 6 langues + 12 zones FR-CA
- [X] T069 Composant AfficherNomCompletSwitch — aperçu Marie D. ↔ Marie Dupont + alertdialog confirmation à l'activation avec avertissement FR-006b explicite Loi 25 + cache moteurs (logique initialeNom miroir du domaine pur)
- [ ] T070 [P] [US1] Tests Playwright `apps/web/e2e/profil-edition.spec.ts` couvrant tous les acceptance scenarios US1 (formulaire pré-rempli, sauvegarde valide, biographie effacée → erreur, photo > 5 Mo → erreur)
- [ ] T071 [P] [US1] Test axe-core CI sur `/(conseiller)/conseiller/profil` (Principe XI — bloquant `serious`/`critical`)

**Checkpoint US1** : un conseiller peut éditer son profil de bout en bout, sauvegarde persistée, slug généré au premier prêt, photo S3 OK, audit immutable. **Indépendamment testable** : US1 vert sans US2-US6.

---

## Phase 4 : User Story 2 — Voyageur découvre un conseiller vérifié (P1) 🎯 MVP

**Goal** : page publique anti-marketplace `/conseiller/<slug>` indexable
SEO, sans canal de contact direct, avec CTA unique vers `/intake?suggested=`.
Anti-énumération 404 unifié. Middleware Next.js pose le cookie HMAC à la
redirection.

**Independent Test** : seed un conseiller vérifié + profil `prêt`, ouvrir
`/conseiller/marie-dupont` anonyme → tous les champs rendus, CTA présent,
0 canal contact, scan invariant CI vert ; cliquer CTA → redirect /intake
+ cookie cv_suggested posé.

### Tests pour US2 (TDD intégration + e2e)

- [X] T072 [P] [US2] **[TDD RED]** Tests intégration `apps/api/test/integration/profil/lire-page-profil-publique.spec.ts` couvrant 5 cas → `null` (slug inexistant, slug réservé `slug_reservations`, conformité `pending`, profil `incomplet`, profil `masque_admin`), 1 cas → payload complet, 1 cas → payload avec champ `certificationsVisibles` peuplé
- [ ] T073 [P] [US2] **[TDD RED]** Tests Playwright `apps/web/e2e/profil-public-page.spec.ts` couvrant les acceptance scenarios US2 (page complète, 404 unifié constant-body, encart pédagogique, CTA unique vers /intake)
- [ ] T074 [P] [US2] **[TDD RED]** Tests Playwright `apps/web/e2e/profil-suggested-middleware.spec.ts` couvrant : clic CTA → 302 /intake propre + cookie posé, 2 consultations FIFO, 11e éviction, cookie tampered ignoré, `suggested` non-UUID redirect propre sans set-cookie
- [ ] T075 [P] [US2] **[TDD RED]** Test invariant `tools/check-anti-enum-profile.ts` (T050) lancé en mode test e2e — produit 5 cas 404 et vérifie taille corps identique à l'octet près
- [ ] T076 [P] [US2] **[TDD RED]** Test Lighthouse CI `apps/web/test/lighthouse/profil-public.spec.ts` sur `/conseiller/<seed-slug>` exigeant Performance ≥ 90, SEO ≥ 95, Accessibility ≥ 95
- [X] T077 [P] [US2] **[TDD RED]** Tests intégration `apps/api/test/integration/profil/est-profil-public.spec.ts` couvrant la table de tests dans contracts/est-profil-public.port.md (nominal + 5 cas négatifs + batch)

### Implémentation US2

- [X] T078 LirePageProfilPubliqueUseCase wrapper + ProfilPublicController endpoint REST /api/public/profil/[slug] anti-énumération 404
- [ ] T079 [US2] **[TDD GREEN]** Implémenter `apps/api/src/modules/identite/application/use-cases/est-profil-public.use-case.ts` qui exécute le AND conformité + statut profil (cf. contracts/est-profil-public.port.md)
- [X] T080 Page Next.js 15 /[locale]/conseiller/[slug]/page.tsx — async params + generateStaticParams [] + dynamicParams true + revalidate 300 + generateMetadata + JSON-LD Person SANS contactPoint
- [X] T081 [locale]/not-found.tsx unifié — body statique constant pour SC-003 anti-énumération
- [X] T082 Composant ProfilHero — photo CloudFront publique stable, width/height figés (CLS=0)
- [X] T083 Composant ProfilSections — biographie + 3 ChipsSection (spécialités/langues/zones) + années expérience
- [X] T084 Composant BadgeVerifie — boolean OPC/TICO (A3 — liste détaillée différée à 016)
- [X] T085 Composant SectionPourquoiPasContact — encart pédagogique FR-009 + lien /comment-ca-marche
- [X] T086 Composant CtaSuggested — UNIQUE CTA vers /intake?suggested= (FR-008 + Principe I), variant primary/footer
- [X] T087 opengraph-image.tsx dynamique — ImageResponse 1200×630 avec nom affiché + spécialité principale + gradient bleu
- [X] T088 generateMetadata dans page.tsx — title + description (extrait bio) + canonical + OG + Twitter + locale
- [X] T089 Middleware Next.js étendu — handleSuggestedCookie via Web Crypto API (cv-suggested-edge), UUID v4 validation + HMAC + Set-Cookie HttpOnly Path=/ Max-Age=86400 + redirect 302 propre
- [ ] T090 [US2] Configuration `apps/web/next.config.mjs` : `experimental.ppr = 'incremental'` + headers profile `Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=86400`
- [X] T091 sitemap.ts étendu — lireSlugsPubliables() ajoute les profils prêts (best-effort fallback safe), revalidate 1h
- [X] T092 Route POST /api/revalidate — Bearer secret CV_REVALIDATE_SECRET + revalidatePath/revalidateTag
- [X] T093 Listener ProfilCacheInvalidator + port NextjsRevalidator + HttpNextjsRevalidator adapter — double invalidation Next.js ISR + CloudFront pour SC-006 ≤ 10s
- [ ] T093a [P] [US2] **[TDD RED + GREEN]** Tests intégration cross-cache `apps/api/test/integration/profil/cache-invalidation.spec.ts` couvrant : (a) émission `ProfilConseillerPublishedEvent` → mock HTTP POST `/api/revalidate` reçu avec path correct ET `cloudFrontInvalidator.invalidatePaths()` appelé avec le bon path ; (b) idem pour les 4 autres events ; (c) si l'un des deux appels échoue, l'autre est tenté quand même (best-effort) ; (d) timing total < 500 ms p95 (le listener ne doit pas bloquer la transaction d'émission)
- [ ] T094 [P] [US2] Test axe-core CI sur `/conseiller/<seed-slug>` (Principe XI)
- [ ] T095 [P] [US2] Test Lighthouse CI (T076 implementation) — bloquant CI
- [ ] T096 [P] [US2] Test invariant `tools/check-no-contact-fields-profile.ts` (T049) — bloquant CI sur PR touchant `apps/web/src/app/conseiller/[slug]/**`

**Checkpoint US2** : page publique fonctionnelle, anti-marketplace strict
en CI, anti-énumération 404 unifié, middleware suggested opérationnel,
sitemap dynamique, SEO/CWV vert. **MVP US1+US2 atteignable ensemble.**

---

## Phase 5 : User Story 3 — Dashboard conseiller (P2)

**Goal** : dashboard `/conseiller` avec widgets (conformité, profil, leads
placeholder, facturation placeholder) + avertissements FR-012 / FR-012a.

**Independent Test** : conseiller authentifié ouvre `/conseiller`, voit
widgets corrects, avertissement persistant si profil incomplet.

- [ ] T097 [P] [US3] **[TDD RED]** Tests Playwright `apps/web/e2e/profil-dashboard.spec.ts` couvrant les 4 acceptance scenarios US3 (widget conformité, avertissement profil incomplet FR-012a avec champs manquants, placeholders facturation/leads)
- [X] T098 Page Dashboard /conseiller — Server Component + 4 widgets (Conformite/Profil/Leads placeholder/Facturation placeholder) + 3 avertissements (non-vérifié/incomplet/masqué admin)
- [X] T099 WidgetConformite — statut + lien gérer conformité
- [X] T100 WidgetProfil — statut + champs manquants FR-012a + liens édition/aperçu
- [X] T101 WidgetPlaceholder Mes leads (feature 012)
- [X] T102 WidgetPlaceholder Mon abonnement (feature 006-007)
- [ ] T103 [P] [US3] Test axe-core CI sur `/(conseiller)/conseiller`

**Checkpoint US3** : dashboard utilisable, indépendant de US4-US6.

---

## Phase 6 : User Story 4 — Aperçu public depuis le dashboard (P2)

**Goal** : conseiller prévisualise sa propre page publique (avec bandeau
jaune si non publié).

**Independent Test** : conseiller au profil incomplet ouvre `/conseiller/profil/apercu`
→ voit la page avec bandeau « non encore visible publiquement » et liste
champs manquants ; conseiller au profil prêt → page identique au voyageur sans bandeau.

- [ ] T104 [P] [US4] **[TDD RED]** Tests intégration `apps/api/test/integration/profil/previsualiser-profil.spec.ts` (3 cas : prêt sans bandeau, incomplet avec bandeau + champs, masqué_admin avec bandeau raison)
- [ ] T105 [P] [US4] **[TDD RED]** Tests Playwright `apps/web/e2e/profil-apercu.spec.ts` couvrant les 2 acceptance scenarios US4
- [X] T106 PrevisualiserProfilUseCase — payload public + bandeauApercu (4 types)
- [X] T107 Endpoint GET /api/profil/apercu (consommé par lireProfilApercuAction)
- [X] T108 Page /conseiller/profil/apercu — réutilise composants US2 + BandeauApercu
- [X] T109 BandeauApercu — 4 variantes (incomplet/non_verifie/masque_admin/anonymise)
- [ ] T110 [P] [US4] Test axe-core CI sur la page aperçu

**Checkpoint US4** : aperçu fonctionnel, indépendamment testable.

---

## Phase 7 : User Story 6 — Admin modère un profil (P2)

**Goal** : un admin via la console conformité étendue (onglet « Profils »)
peut retirer une photo, masquer temporairement, rétablir, avec raison
obligatoire, audit immutable, courriel automatique.

**Independent Test** : admin login + step-up MFA, ouvre `/admin/profils`,
clique masquer sur un profil avec raison → statut basculé `masqué_admin`,
page publique 404, conseiller reçoit courriel, journal audit contient
l'événement.

### Tests US6 (TDD intégration + e2e)

- [X] T111 [P] [US6] **[TDD RED]** Tests intégration `apps/api/test/integration/profil/retirer-photo-admin.spec.ts` (S3 vidé + statut profil → incomplet + audit + courriel + invalidations Next.js + CloudFront)
- [X] T112 [P] [US6] **[TDD RED]** Tests intégration `apps/api/test/integration/profil/masquer-profil-admin.spec.ts` (statut → masque_admin + 404 + courriel + audit)
- [X] T113 [P] [US6] **[TDD RED]** Tests intégration `apps/api/test/integration/profil/retablir-profil-admin.spec.ts` (statut recalculé via `calculerStatutProfil` + audit, pas de courriel)
- [X] T114 [P] [US6] **[TDD RED]** Tests intégration : raison manquante refusée pour les 3 actions, StepUpGuard refus si MFA expirée
- [ ] T115 [P] [US6] **[TDD RED]** Tests Playwright `apps/web/e2e/profil-moderation-admin.spec.ts` couvrant les 4 acceptance scenarios US6

### Implémentation US6

- [X] T116 RetirerPhotoAdminUseCase — Result<T,E> + S3 delete parallèle + clearPhoto + statut incomplet + audit + invalidation
- [X] T117 MasquerProfilAdminUseCase — statut masque_admin + raisonMasquageAdmin persistée + audit + invalidation
- [X] T118 RetablirProfilAdminUseCase — recalcul statut via calculerStatutProfil + audit
- [X] T119 ProfilAdminController NestJS — 3 endpoints + AuthGuard + RoleGuard(admin) + StepUpGuard sur retirer/masquer
- [ ] T120 [P] [US6] Template email `packages/email-templates/profil/profil-masque-admin.tsx` (react-email, FR-CA)
- [X] T121 [P] [US6] Page `apps/web/src/app/[locale]/(admin)/admin/profils/page.tsx` (liste + filtres statut + recherche par nom légal/slug, intégrée à la console conformité existante via tabs)
- [X] T122 [P] [US6] Page `apps/web/src/app/[locale]/(admin)/admin/profils/[id]/page.tsx` (détail profil + historique modérations + actions)
- [X] T123 [P] [US6] Composant `apps/web/src/app/[locale]/(admin)/admin/profils/_components/dialog-confirmation-action.tsx` (Radix Dialog + textarea raison + focus trap)
- [X] T124 [P] [US6] Server Actions admin : `retirer-photo.ts`, `masquer-profil.ts`, `retablir-profil.ts`
- [ ] T125 [P] [US6] Test axe-core CI sur `/(admin)/admin/profils` et `/[id]`

**Checkpoint US6** : modération fonctionnelle bout en bout, audit immutable, courriels FR-CA.

---

## Phase 8 : User Story 5 — Effacement Loi 25 préserve l'invariant SEO (P3)

**Goal** : `AnonymiserProfilLoi25UseCase` (consommé par 023 future) efface
PII + supprime S3 + réserve slug à vie, le tout dans un état terminal.

**Independent Test** : appeler l'endpoint interne sur un profil publié →
statut → `anonymisé`, biographie/photo/etc. → null, slug en
`slug_reservations`, page publique 404, re-création conseiller homonyme →
slug `marie-dupont-2`.

- [X] T126 [P] [US5] **[TDD RED]** Tests intégration `apps/api/test/integration/profil/anonymiser-profil-loi25.spec.ts` couvrant : (a) PII effacés selon FR-016 (biographie, titre, années, photo S3, history S3, langues/spécialités/zones sets vides), (b) statut → `anonymise`, (c) `anonymizedAt = NOW()`, (d) `SlugReservation` ajouté avec `conseillerIdOrigine = NULL` (cf. ADR-0015), (e) idempotence (re-appel = no-op), (f) trigger Postgres bloque toute tentative `anonymise → autre` (statut terminal)
- [X] T127 [P] [US5] **[TDD RED]** Test invariant SC-007 `apps/api/test/integration/profil/slug-reuse-invariant.spec.ts` : seed conseiller, l'anonymise, re-seed un conseiller avec exactement le même nom légal → slug généré doit être différent (`marie-dupont-2`)
- [ ] T128 [P] [US5] **[TDD RED]** Test latence retrait page publique ≤ 10 s `apps/web/e2e/profil-retrait-rapide.spec.ts` : anonymise un profil → mesure le temps avant que `/conseiller/<slug>` retourne 404 (doit être < 10 s, cible SC-006)
- [X] T129 AnonymiserProfilLoi25UseCase — DELETE S3 parallèle + anonymize + SlugReservation conseillerIdOrigine=NULL (ADR-0015) + annul relances + invalidations
- [X] T130 Inline dans AnonymiserProfilLoi25UseCase (SlugReservation.reserve raison=loi25)
- [X] T131 ProfilInternalController — POST /api/internal/profil/:id/anonymiser-loi25 + X-Internal-Service-Token
- [ ] T132 [P] [US5] Étendre le test invariant slug T127 dans CI nightly (test long, exclusif `slow` tag)

**Checkpoint US5** : anonymisation Loi 25 disponible (consommable par 023 future), invariant SC-007 garanti par test.

---

## Phase 9 : Onboarding relances (FR-021) — transverse

**Goal** : relances email J+3/J+7/J+14 pour les conseillers vérifiés au profil incomplet.

- [X] T133 [P] **[TDD RED]** Tests intégration `apps/api/test/integration/profil/planifier-relances-onboarding.spec.ts` couvrant : 3 jobs BullMQ planifiés avec delays corrects (3d, 7d, 14d), jobId déterministe, dédoublonnage si re-planification
- [X] T134 [P] **[TDD RED]** Tests worker `apps/api/test/integration/profil/envoyer-relance-onboarding.spec.ts` couvrant : statut `incomplet` → INSERT outbox courriel + UPDATE schedule `etat = envoye`, statut `pret`/`masque_admin`/`anonymise` → no-op + UPDATE `etat = annule` ; idempotence relance (re-trigger même `jobId` → no-op)
- [ ] T135 **[TDD GREEN]** Implémenter `apps/api/src/modules/identite/application/use-cases/planifier-relances-onboarding.use-case.ts` (enqueue 3 jobs via `OnboardingRelanceScheduler` port + INSERT 3 rows `profile_onboarding_reminder_schedules`)
- [X] T136 EnvoyerRelanceOnboardingUseCase — guard statut=incomplet + audit (drainage SES déféré à 003 wiring)
- [ ] T137 Worker `apps/api/src/workers/onboarding-reminders.worker.ts` (BullMQ consumer pour la queue `onboarding_reminders`)
- [ ] T138 [P] Template email `packages/email-templates/profil/onboarding-reminder-3j.tsx` (FR-CA, lien dashboard)
- [ ] T139 [P] Template email `packages/email-templates/profil/onboarding-reminder-7j.tsx`
- [ ] T140 [P] Template email `packages/email-templates/profil/onboarding-reminder-14j.tsx`
- [ ] T141 Wiring : listener T061 (`ConseillerConformiteChangedEvent`) appelle `PlanifierRelancesOnboardingUseCase` à la transition `pending → verified`. **Depends on T061, T135.**

**Checkpoint** : relances opérationnelles, drainées par la feature 003 (SES) existante.

---

## Phase 10 : Cleanup orphan photos worker (compensation C4)

**Goal** : worker quotidien qui supprime les photos S3 orphelines (post-échec compensation upload).

- [X] T142 [P] **[TDD RED]** Tests intégration `apps/api/test/integration/profil/cleanup-orphan-photos.spec.ts` couvrant : photo S3 sans row DB → supprimée, photo S3 avec row `commit` → préservée, photo `pending_upload < 1h` → préservée (upload en cours), photo `pending_upload > 1h` → row supprimée + S3 supprimée
- [ ] T143 **[TDD GREEN]** Implémenter `apps/api/src/modules/identite/application/use-cases/cleanup-orphan-photos.use-case.ts` (liste S3 prefix `profiles/` + jointure DB + DELETE orphelins)
- [X] T144 CleanupOrphanPhotosJob — quotidien, scan pending_upload > 1h, DELETE S3 best-effort + DELETE row
- [ ] T145 [P] Métriques `cv_orphan_photos_cleaned_total` exposées en logs (déférées à 021 pour Prometheus)

**Checkpoint** : compensation S3↔DB robuste.

---

## Phase 11 : Polish & Cross-Cutting Concerns

**Purpose** : observabilité préfiguration, documentation, ADR, audits.

- [ ] T146 [P] Script CLI `apps/api/src/cli/scan-profile-adoption.ts` (mesure SC-005 : ratio profils `prêt` dans cohorte des 30 derniers jours)
- [ ] T146a [P] Brancher T146 à un workflow GitHub Actions `scheduled` hebdomadaire (`.github/workflows/scan-profile-adoption.yml`, cron `0 9 * * MON`), qui (a) exécute le script, (b) publie le ratio dans un fichier `docs/dashboards/profile-adoption.json`, (c) optionnellement push une entrée Grafana via API (config minimale, préfigure 021 sans dupliquer). Documenter dans `docs/runbooks/profile-adoption-monitoring.md`
- [ ] T146b [P] **[TDD GREEN]** Test SC-001 : script intégration `apps/api/test/integration/profil/sc-001-publication-latency.spec.ts` qui (a) crée 20 conseillers vérifiés via fixtures + complète leurs profils via `EditerProfilUseCase` (saga complète : statut → `prêt` + slug + invalidations), (b) mesure le délai entre `execute()` et `GET /conseiller/<slug>` retournant `200 OK`, (c) asserte 95e percentile < 60 s (SC-001). Tag `slow` pour CI nightly
- [X] T147 ADR-0015 docs/adr/0015-slug-reserve-loi25.md — analyse Loi 25 conservation slug + conseillerIdOrigine=NULL
- [X] T148 Runbook docs/runbooks/profil-moderation.md — guide admin retirer photo / masquer / rétablir
- [X] T149 Runbook docs/runbooks/profil-anonymisation-loi25.md — endpoint interne + invariants + SQL verif
- [ ] T150 [P] README `packages/profil-domain/README.md` documentant les fonctions pures, le pattern `Result<T,E>`, et l'intention TDD
- [ ] T151 [P] Sections ajoutées dans `apps/api/README.md` et `apps/web/README.md` (routes profil, workers, middleware suggested)
- [ ] T152 Audit lecteur d'écran NVDA manuel sur les 5 routes (Principe XI release majeure) → compte-rendu `docs/a11y/release-005.md`
- [ ] T153 Validation complète de `quickstart.md` en local (13 étapes) — reviewer doit pouvoir suivre sans accroc
- [ ] T154 Ajout de l'entry CHANGELOG.md + bump version `apps/web` et `apps/api` (semver minor : nouvelle feature)
- [ ] T155 Mise à jour `docs/roadmap.md` : marquer feature 005 ✅ mergée avec lien PR
- [ ] T156 [P] **PR template Constitution Check 12 principes** : étendre `.github/pull_request_template.md` avec une checklist explicite par principe — chaque principe lié aux tâches qui le couvrent dans cette feature. Format : `- [ ] **Principe I (Conformité OPC/TICO)** : test invariant `tools/check-no-contact-fields-profile.ts` vert (T049 + T096) ; CTA unique `/intake?suggested=` (T086) ; Schema.org `Person` sans `contactPoint` (T088).` Idem pour les 11 autres principes (cf. plan.md Constitution Check)
- [ ] T156a Vérification finale Constitution Check Phase 1 (post-design) cochée à 100 % dans la PR avant merge (12 principes, DoD complète, axe-core + Lighthouse + invariants verts, ADR-0015 mergé)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)** : aucune dépendance, peut démarrer immédiatement.
- **Phase 2 (Foundational)** : dépend de Phase 1. **Bloque toutes les US.**
- **Phase 3 (US1)** : dépend de Phase 2. Indépendante de US2-US6.
- **Phase 4 (US2)** : dépend de Phase 2 + idéalement de la transition `incomplet → prêt` de US1 (T058) pour seed les pages publiques. **Peut démarrer en parallèle de US1** si l'équipe a > 1 développeur.
- **Phase 5 (US3)** : dépend de Phase 2 + US1 (lecture profil privé).
- **Phase 6 (US4)** : dépend de Phase 2 + US1 + US2 (réutilise les composants publics).
- **Phase 7 (US6)** : dépend de Phase 2 ; les actions admin recalculent le statut et invalident les caches (réutilise T093). Indépendant de US3/US4.
- **Phase 8 (US5)** : dépend de Phase 2 + US1 (pour le profil à anonymiser).
- **Phase 9 (Onboarding)** : dépend de Phase 2 + listener T061. Démarrable en parallèle de US1 dès que Phase 2 finie.
- **Phase 10 (Cleanup orphan)** : dépend de Phase 2 + ports S3 (T029, T039) + Phase 3 (US1, statut `pending_upload`).
- **Phase 11 (Polish)** : dépend de toutes les US visées par le sprint.

### User Story Dependencies

- **US1 (P1)** : foundation seule.
- **US2 (P1)** : foundation seule, mais valeur démontrable nécessite US1 (sinon pas de profil à afficher).
- **US3 (P2)** : foundation + US1 (lit le profil privé).
- **US4 (P2)** : foundation + US1 + US2.
- **US5 (P3)** : foundation + US1 minimum.
- **US6 (P2)** : foundation seule (mais valeur nécessite US1 + US2).

### Within Each User Story

- TDD : tests RED (commit) avant implémentation GREEN (commit séparé).
- Use cases avant Server Actions avant pages.
- Models pure avant adaptateurs avant use cases (déjà respecté en Phase 2).
- Refus de merger une PR sans Constitution Check Principe VI cochée.

### Parallel Opportunities

- **Phase 1** : T003-T007 parallèles (fichiers / ressources distincts). T010a (pré-investigation 001) peut tourner en parallèle des migrations T008-T009.
- **Phase 2** :
  - TDD pairs en parallèle entre eux : T012-T013, T014-T015, T016-T017, T018-T019, T020-T021, T022-T023 (chaque pair séquentiel à l'intérieur).
  - T024 (DTOs) parallèle à T011 (Result).
  - Ports T026-T035 parallèles entre eux (10 fichiers distincts).
  - Adaptateurs T036-T045 parallèles entre eux (après ports correspondants).
  - Outils CI T049-T052 parallèles entre eux et avec les autres branches.
  - T052a (i18n catalog) parallèle à tous les autres.
- **US1** : tests T053-T056 + T061a parallèles. T060a (pré-investigation event) parallèle au reste. UI composants T066-T069 parallèles. Tests qualité T070-T071 parallèles.
- **US2** : tests T072-T077 + T093a parallèles. Composants T082-T086 parallèles. Tests qualité T094-T096 parallèles.
- **US3, US4, US6** : composants parallèles entre eux.
- **Phase 9 et Phase 10** : peuvent démarrer en parallèle de US1 dès Phase 2 finie.
- **Phase 11** : T146a, T146b, T147-T156, T156a parallèles entre eux (artefacts distincts).

---

## Parallel Example : démarrage Phase 2 TDD

```bash
# Lancer 6 TDD pairs en parallèle (6 développeurs ou Claude Code parallel) :
Task: "T012 [TDD RED] tests slug.test.ts"  → puis T013 GREEN
Task: "T014 [TDD RED] tests magic-number.test.ts" → puis T015 GREEN
Task: "T016 [TDD RED] tests statut-profil.test.ts" → puis T017 GREEN
Task: "T018 [TDD RED] tests nom-affiche.test.ts" → puis T019 GREEN
Task: "T020 [TDD RED] tests suggested-window.test.ts" → puis T021 GREEN
Task: "T022 [TDD RED] tests suggested-cookie.test.ts" → puis T023 GREEN
```

## Parallel Example : démarrage Phase 3 US1

```bash
# Tests intégration en parallèle (Testcontainers DB par worker) :
Task: "T053 LireProfilPriveUseCase"
Task: "T054 EditerProfilUseCase"
Task: "T055 UploaderPhotoUseCase"
Task: "T056 publication-initiale"

# Puis implémentation séquentielle (T057 → T058 → T059) car couplée au repository,
# puis UI composants T066-T069 en parallèle.
```

---

## Implementation Strategy

### MVP First (US1 + US2 = les 2 P1)

La spec impose US1 + US2 comme **MVP joint** : sans US2, US1 produit des
données invisibles. Sans US1, US2 n'a rien à afficher. Pas de
**STOP-and-VALIDATE** après US1 seul (contrairement au template MVP du
template, ici les 2 P1 sont indissociables).

1. Phase 1 (Setup) → Phase 2 (Foundational).
2. **En parallèle si capacité** : Phase 3 (US1) ET Phase 4 (US2).
3. **STOP and VALIDATE MVP** : test joint US1 + US2 (un conseiller
   complète son profil → sa page publique apparaît).
4. Phase 9 (Onboarding) si capacité parallèle (transverse).
5. Phase 10 (Cleanup) si Phase 3 (US1) finie.
6. Phase 11 (Polish minimum : ADR-0015 + runbooks + Constitution Check) AVANT release MVP.

### Incremental Delivery (post-MVP)

7. US3 (Dashboard) → release intermédiaire.
8. US6 (Modération admin) → release intermédiaire.
9. US4 (Aperçu) → release intermédiaire.
10. US5 (Loi 25) → release intermédiaire (anticipe feature 023).
11. Polish complet (T152-T156).

### Parallel Team Strategy

Avec 2-3 développeurs :

1. Team complète Phase 1 + Phase 2 ensemble (~ 1-2 sprints).
2. Dev A : Phase 3 (US1) — domaine + use cases.
3. Dev B : Phase 4 (US2) — page publique + middleware + tests Lighthouse.
4. Dev C : Phase 9 (onboarding relances) + Phase 10 (cleanup) — transverse.
5. Intégration release MVP.
6. Puis US3, US4, US6, US5 en parallèle selon priorité commerciale.

---

## Notes

- **TDD strict (Principe VI)** : tests RED commités SÉPARÉMENT de l'implémentation GREEN. Refus de merger une PR sans cette séparation visible dans l'historique git pour les fonctions pures du domaine.
- **DoD constitution** : 12 principes adressés en PR template, axe-core + Lighthouse CI verts, ADR-0015 livré.
- **`Result<T, E>`** : convention pour toutes les erreurs métier des use cases (cf. profil-edition.port.md). Les exceptions restent réservées aux erreurs techniques (DB HS, S3 HS, programmer error).
- **Naming FR-CA** : variables `prenomLegal/nomLegal`, slugs FR-CA (cf. R1), libellés FR-CA partout (Principe IV).
- **Pas de Co-Authored-By Claude** dans les commits (cf. memory project).
- **Migrations Prisma sealed** : ne jamais modifier un `.sql` post-`migrate dev` (cf. memory project).
- **Stop à chaque checkpoint US** pour valider indépendamment avant de poursuivre.
- **MVP cible** : US1 + US2 + Phase 9 + Phase 10 + Phase 11 minimum (ADR-0015 + runbooks).
