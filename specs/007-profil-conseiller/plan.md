# Plan d'implémentation : Profil conseiller (public + privé) — feature 005 / dossier `007-profil-conseiller`

**Branche** : `007-profil-conseiller` | **Date** : 2026-05-27 | **Spec** : [spec.md](spec.md)

**Entrée** : Spécification fonctionnelle `specs/007-profil-conseiller/spec.md`

---

## Résumé exécutif

La feature 005 (premier sprint Tier 1) livre **la présence du conseiller** sur la
plateforme — la vue publique anti-marketplace (page `/conseiller/<slug>` indexable
SEO sans CTA de contact direct, conforme à [ADR-0002](../../docs/adr/0002-pas-de-cta-contact-direct.md))
ET la vue privée (dashboard `/conseiller`, édition de profil, aperçu public,
modération admin). Aucun matching, aucune notification cross-user : c'est
strictement de l'affichage et de l'édition.

L'implémentation tient en **4 couches** alignées sur la Clean Architecture du
projet :

1. **`packages/profil-domain/`** (nouveau, TypeScript pur) — entités
   `ProfilConseiller`, `Slug` (value object immuable + slugify FR-CA),
   `StatutProfil` (`incomplet` | `prêt` | `masqué_admin` | `anonymisé`),
   validation Zod des DTO (titre / biographie / spécialités / langues / zones /
   années / `afficherNomComplet`), politique de calcul du statut dérivé,
   politique de formatage du nom affiché (`Prénom + initiale-nom + "."` ou
   nom complet selon toggle). Zéro framework. **TDD obligatoire (Principe VI)**
   sur la slugification (collision + ASCII fold FR-CA), sur le calcul de
   statut, et sur le formatage du nom affiché.

2. **`apps/api/src/modules/identite/`** (extension du module existant
   002+002a+003) — ajout de :
   - entités domaine `ProfilConseiller`, `PhotoHistorique`, `SlugReservation`,
     `OnboardingRelance` ;
   - ports applicatifs : `ProfilConseillerRepository`, `PhotoHistoriqueRepository`,
     `SlugReservationRepository`, `PhotoStorage` (S3), `OnboardingRelanceScheduler`,
     `ProfilModerationAuditWriter` (étend `MfaAuditWriter` / `AuthAuditWriter`
     existants — utilise le même journal), `ConformiteNomLegalReader` (port
     consommant le module conformité pour lire prénom + nom légal vérifié) ;
   - cas d'usage : `EditerProfilUseCase`, `UploaderPhotoUseCase`,
     `CalculerStatutProfilUseCase`, `LirePageProfilPubliqueUseCase`,
     `PrevisualiserProfilUseCase`, `PlanifierRelancesOnboardingUseCase`,
     `EnvoyerRelanceOnboardingUseCase`, `RetirerPhotoUseCase` (admin),
     `MasquerProfilUseCase` (admin), `RetablirProfilUseCase` (admin),
     `AnonymiserProfilUseCase` (Loi 25), `EstProfilPublicUseCase` (port public
     consommé par matching feature 011), `ReserverSlugLoi25UseCase` ;
   - adaptateurs Prisma + S3 (réutilise l'infra documents de 001).

3. **`apps/web/src/app/`** (nouveau) — pages :
   - publiques : `/conseiller/[slug]` (SSG avec ISR on-demand, page
     conseiller indexable), `/intake` est touchée par le middleware
     `?suggested=` (cf. FR-008a) ;
   - privées : `/(conseiller)/conseiller` (dashboard), `/(conseiller)/conseiller/profil`
     (édition), `/(conseiller)/conseiller/profil/apercu` (aperçu public),
     `/(admin)/admin/profils` (console modération, onglet ajouté à la
     console conformité existante 001).
   - **Middleware Next.js** `apps/web/src/middleware.ts` étendu pour traiter
     `?suggested=<id>` sur `/intake` (cookie HttpOnly + redirect 302 URL propre,
     cf. FR-008a). Compatible avec le middleware CGU déjà en place (004) en
     l'ajoutant à la chaîne d'`auth.middleware` existante.

4. **Workers BullMQ** — un nouveau scheduler `onboarding-reminders.worker.ts`
   dans `apps/api/src/workers/` qui consomme les jobs `onboarding_reminder`
   (J+3, J+7, J+14) et écrit dans l'outbox courriel (drainé par feature 003).

**Le port public `EstProfilPublicUseCase`** est exposé par `packages/identite-public/`
(extension du barrel `@cv/identite-public` à créer ou réutiliser si déjà
introduit par 002a/006). Il retourne `true` si et seulement si le conseiller
est `verified` côté conformité ET son profil est en statut effectif `prêt`.
Cette signature simple (entrée : `conseillerId`, sortie : `boolean`) est la
seule chose dont les modules matching (011) et SEO (016) auront besoin
quand ils arriveront — pas de couplage fuyant aux internes du profil.

**Cohérence anti-énumération** (FR-007, SC-003) — toutes les conditions de
non-visibilité (slug inexistant, profil incomplet, conseiller pending /
expired / revoked / anonymized, profil masqué admin, profil anonymisé)
**DOIVENT** produire la même réponse HTTP 404 avec un corps identique
(une page 404 statique pré-rendue, identique pour tous les cas). Pas de
distinction par status code ni par message. La page publique elle-même
reste **SSG cacheable** au CDN, donc pas de mutation serveur au chargement.

---

## Contexte technique

**Langage / version** : TypeScript ≥ 5.6, Node.js ≥ 22 (figés par
`package.json`, alignés sur 001/002/003/004/006).

**Dépendances principales** :

- `next@^15` (App Router, RSC) — déjà installé. Page publique en **SSG avec
  ISR on-demand** (re-validation déclenchée sur transition statut, cf. FR-014
  + FR-022 spec 001 pour le mécanisme cross-module).
  - **`params` asynchrone** (Next 15 breaking change) : tous les segments
    dynamiques (`[slug]`, `[id]`) déclarent `params: Promise<{slug: string}>`
    et **doivent** `await params` avant utilisation. Idem pour `searchParams`.
  - **PPR (Partial Prerendering)** : opt-in côté segment `[slug]`
    (`export const experimental_ppr = true`) — la coquille (header,
    nom affiché, biographie) est statique, la photo (URL CloudFront
    publique stable) est dans un `<Suspense>` pour streaming. Encore
    meilleur LCP. Nécessite Next.js 15.x stable + `experimental.ppr` dans
    `next.config.mjs`.
- `react@^19` (avec `useActionState` pour les Server Actions — remplace
  `useFormState` déprécié de React 18 ; `useFormStatus` reste disponible).
- `@nestjs/common@^10`, `@nestjs/platform-fastify` — déjà installés.
- `@prisma/client@^5` — déjà installé. **Nouvelle migration** :
  `packages/db/prisma/schema/profil.prisma` (entités `ConseillerProfile`,
  `ProfilePhotoHistory`, `SlugReservation`, `ProfileOnboardingReminderSchedule`).
- `@aws-sdk/client-s3@^3` + `@aws-sdk/s3-request-presigner@^3` — **déjà
  installés** par 001 (documents conformité). Réutilisés pour la photo de
  profil avec un bucket logique distinct `cv-profiles-photos-ca-central-1`
  (SSE-KMS, ACL `private`, URLs signées pour rendu public — cf. ADR-0001).
- `sharp@^0.33` — **NOUVEAU** côté `apps/api/`. Validation MIME réelle + lecture
  de dimensions pour calcul `width`/`height` requis SEO (cf. Principe XII —
  CLS = 0). **Pas de resize au MVP** (cf. Assumptions spec), uniquement
  validation que le fichier est bien une image et lecture de ses dimensions.
- `react-hook-form@^7` + `@hookform/resolvers@^3` — **déjà installés** par 006.
- `zod@^3` — déjà installé.
- `next-intl@^3` — déjà installé. Tous les libellés FR-CA via clés i18n
  (Principe IV).
- `bullmq@^5` — déjà installé par 002a/003. Réutilisé pour le scheduler des
  relances onboarding.

**Stockage** :

- PostgreSQL 16 ca-central-1 (ADR-0001) via Prisma — nouveau fichier
  `packages/db/prisma/schema/profil.prisma`. Tables : `conseiller_profiles`,
  `profile_photo_history`, `slug_reservations`, `profile_onboarding_reminder_schedules`.
  Index : `slug` (unique), `auth_user_id` (unique), `statut + verified_at`
  pour query du scheduler des relances.
- **S3 ca-central-1** (ADR-0001) : bucket `cv-profiles-photos-ca-central-1`,
  SSE-KMS avec la même clé KMS que les documents conformité.
- **Aucun cache Redis** des pages profil au MVP — le SSG ISR Next.js +
  CloudFront suffisent. Invalidation cache CloudFront déclenchée par le
  module conformité au moment des transitions de statut (FR-022 spec 001 pour
  les transitions négatives <10s, mécanisme `revalidatePath('/conseiller/[slug]')`
  appelé depuis l'event listener de transition conformité).

**Tests** :

- `vitest` pour `packages/profil-domain/*` (logique pure ≥ 95 % de couverture,
  Principe VI TDD strict). Notamment **TDD obligatoire** sur :
  - `slugify` FR-CA (accents, espaces, ponctuation, longueur, caractères
    interdits) + politique de désambiguïsation collision.
  - Calcul de statut dérivé (matrice complète des combinaisons
    `verified|notVerified × profilComplet|profilIncomplet × masqué|nonMasqué × anonymisé|nonAnonymisé`).
  - Formatage du nom affiché (`Prénom + initiale + "."`, cas accents, cas
    nom composé `Marie-Claire Dupont` ou `Jean-Pierre Le Goff`, cas particule
    `de la Tour`).
- `vitest` + `Testcontainers` (Postgres réel + LocalStack S3) pour les
  repositories et use cases dans `apps/api/`. Notamment **test d'invariant
  SC-007** : aucun slug effacé Loi 25 jamais réattribué (test génère un
  conseiller, l'efface, en crée un autre avec exactement le même nom légal
  → vérifie qu'un suffixe est appliqué).
- `Playwright` + `axe-core` pour les flows e2e côté `apps/web/` (édition
  profil, vue publique avec/sans CTA, dashboard, aperçu public, modération
  admin). axe-core CI bloquant sur les 4 routes utilisateur + 1 route admin
  (cf. Principe XI).
- `MSW` pour stubber `ConformiteQueryPort` côté tests web.
- **Lighthouse CI** sur `/conseiller/<slug-de-seed>` : Performance ≥ 90,
  SEO ≥ 95, A11y ≥ 95 (Principe XII).

**Plateforme cible** : AWS ECS Fargate ca-central-1 (ADR-0005), même runtime
que toutes les features précédentes.

**Type de projet** : web-application (monorepo pnpm + Turborepo), même
structure que 001/002/003/004/006.

**Performance** :

- Page publique `/conseiller/<slug>` rendue en **SSG ISR** : LCP < 1,2 s p75
  (cible largement sous le budget 2,5 s du Principe XII), INP < 100 ms (pas
  d'interactivité lourde, juste un CTA et un menu d'ancres), CLS < 0,05
  (dimensions image figées par `width`/`height` extraits via `sharp` au
  moment de l'upload).
- Édition profil (`POST /api/profil`) : validation Zod + UPDATE + audit
  + invalidation cache → **< 600 ms p95** hors upload photo.
- Upload photo (`POST /api/profil/photo`) : validation `sharp` + PUT S3
  + UPDATE row + FIFO eviction + audit → **< 1,5 s p95** pour photo de 5 Mo.
  (Au-delà du SLO 800ms du Principe X, mais c'est une opération de fichier ;
  documenté ici comme acceptable. Pas d'opération bloquante côté UI, le
  formulaire affiche un spinner.)
- Lecture page publique (`GET /conseiller/<slug>`) : **< 100 ms p95** depuis
  l'edge CloudFront, **< 400 ms p95** au miss SSG (lecture DB + render +
  cache).
- Job BullMQ `onboarding_reminder` : < 200 ms d'exécution (juste un INSERT
  outbox + UPDATE schedule).

**Contraintes** :

- **Anti-marketplace strict** (FR-008, FR-009, SC-002) — aucun email,
  téléphone, formulaire de contact, lien chat externe sur la page publique.
  Test d'invariant : `tools/check-no-contact-fields-profile.ts` parse le JSX
  rendu et fait échouer la CI si un regex `mailto:|tel:|formulaire-contact|chat-direct`
  match.
- **Anti-énumération HTTP** (FR-007, SC-003) — toutes les conditions 404
  servent **la même page 404 statique** (même status, même content-type,
  même body, même timing à ± 10 ms). Implémenté via `notFound()` Next.js qui
  rend systématiquement `app/not-found.tsx` partagé.
- **Slug immuable post-publication** (FR-015, SC-007) — généré au premier
  `verified`, stocké en colonne unique, jamais réécrit. La transition
  Loi 25 → `SlugReservation` est append-only (insert vers la table de
  réservation, ne touche pas la colonne slug du `ConseillerProfile` qui est
  conservée).
- **Asymétrie slug ↔ nom affiché communiquée à l'UI** (edge case spec) —
  texte d'aide explicite au moment du toggle `afficherNomComplet` :
  « Le nom dans l'URL de votre page publique reste basé sur votre nom
  légal, indépendamment de ce choix. »
- **Toutes les données en région canadienne** ca-central-1 (Loi 25,
  Principe II).
- **CGU acceptance gate** (FR-019) — le middleware de 004 déjà en place sur
  les routes `/(conseiller)/**` valide l'acceptation CGU avant édition. Pas
  de réécriture, juste consommation.
- **Audit log immuable** (FR-018) — chaque édition de profil, upload de
  photo, action admin de modération est insérée dans `auth_audit_events`
  (table append-only triggerée par 002, réutilisée). Pas de nouvelle table.

**Échelle** :

- 50 à 500 conseillers en année 1 (cohérent avec 001).
- 50-500 pages publiques `/conseiller/<slug>` SSG.
- Trafic estimé : ~5 000 vues/jour sur l'ensemble des pages profil
  (acquisition organique principalement, faible volume initial).
- Photos S3 : 5 Mo max × 5 versions × 500 conseillers = ~12 Go stockage S3
  pour les profils. Négligeable.

---

## Vérification de la constitution

> **PORTE** : passer avant Phase 0 ET re-vérifier après Phase 1. Toute
> violation NON-NÉGOCIABLE non justifiée = échec.

### I. Conformité réglementaire par conception (NON-NÉGOCIABLE) — ✅ Adressé

**La feature 005 est l'endroit où l'anti-marketplace est rendu visible au
voyageur** — c'est précisément le point sensible. Garde-fous :

- **Aucun canal de contact direct** sur la page publique (FR-008, FR-009).
  CTA unique vers `/intake`. Test automatisé `tools/check-no-contact-fields-profile.ts`
  bloque en CI tout `mailto:`, `tel:`, formulaire ou chat sur la page profil.
- **Section pédagogique permanente** (FR-009) « Pourquoi je ne peux pas
  contacter ce conseiller directement ? » qui renvoie à `/comment-ca-marche`
  (feature 004).
- **Filtrage statut `verified` en couche DB** (FR-007, FR-022) — le port
  `EstProfilPublicUseCase` interroge `ConformiteQueryPort.estVerifie(id)`
  AVANT de retourner quoi que ce soit. La requête SQL de page publique
  filtre `WHERE statut_conformite = 'verified' AND statut_profil = 'pret'`.
  Aucun rendu UI qui dépendrait uniquement d'un check côté client.
- **Aucune frontière transactionnelle franchie** : pas de paiement, pas de
  réservation, pas de versement, pas de séquestre. La feature n'expose que
  de l'affichage et de l'édition d'identité conseiller. Stripe / abonnement
  conseiller B2B = features 006/007 distinctes.
- **Schema.org `Person` minimal** (FR-020) sans `contactPoint` ni
  `telephone` (cf. roadmap contrainte 016). L'objet structuré pointe
  exclusivement vers `/intake` comme action.

### II. Vie privée et Loi 25 (NON-NÉGOCIABLE) — ✅ Adressé

**Données personnelles collectées** :

- Biographie (texte libre, identifiant) — minimisation OK (le voyageur
  doit pouvoir évaluer le conseiller).
- Photo (image, identifiante) — minimisation OK (idem).
- Titre / accroche (texte libre) — minimisation OK.
- Spécialités, langues, zones, années d'expérience — usage de matching
  futur (011) + filtrage SEO 016. Minimisation OK.
- Slug (dérivé du nom légal) — usage SEO + permanence. Minimisation OK,
  asymétrie avec le nom affiché documentée comme compromis (edge case spec).
- `afficherNomComplet` (booléen) — choix de l'utilisateur sur son exposition.

**Le nom légal lui-même n'est PAS dupliqué** dans `ConseillerProfile` (cf.
Key Entities spec) : il est lu via `ConformiteNomLegalReader` (port public
du module conformité). Source unique de vérité.

**Analyse Loi 25 du `SlugReservation`** (point sensible à expliciter) :
le slug `marie-dupont` est dérivé du nom légal et persisté à vie dans
`slug_reservations` après effacement Loi 25 du conseiller. C'est en
apparence une **conservation de PII** post-effacement. Justification de
la conservation :

- **Obligation légale d'intégrité de l'historique d'audit** : la Loi 25
  reconnaît l'exception de conservation pour obligation légale (art. 23).
  Le slug réservé sert d'invariant de sécurité (anti-hijack SEO de l'URL
  d'un ancien conseiller) — c'est une **mesure de sécurité technique**
  documentée dans la spec (SC-007).
- **Le slug seul n'est pas suffisant pour identifier la personne** : sans
  croisement avec un index externe, `marie-dupont` est ambigu (combien de
  Marie Dupont au Québec ?). La conservation respecte donc la
  **minimisation** au sens où aucun champ supplémentaire n'est conservé
  (pas d'email, pas de téléphone, pas d'adresse).
- **Pas de réversibilité de l'effacement par le slug** : aucun chemin
  technique ne permet de remonter du slug vers le `AuthUser` original
  (la colonne `conseillerIdOrigine` dans `SlugReservation` peut être
  mise à `NULL` à l'anonymisation pour cette feature — décision à
  prendre).

**Décision sur `conseillerIdOrigine`** : le champ existe pour audit
(retrouver quel UUID interne a réservé ce slug), mais lors de
l'anonymisation Loi 25, il **DOIT** être mis à `NULL` simultanément avec
l'effacement des autres PII. Le lien historique reste dans
`auth_audit_events` (rétention 7 ans, justifiée par obligation comptable,
cf. ADR-0012 du module 002).

**ADR-0015 à créer** : `docs/adr/0015-slug-reserve-loi25.md` (statut
*ratifié par plan 007*) — formaliser cette analyse pour audit Loi 25
ultérieur.

**Résidence canadienne** : PostgreSQL ca-central-1 (ADR-0001), S3 ca-central-1
(ADR-0001), CloudFront edge YYZ + YUL (ADR-0005), Sentry self-hosted
ca-central-1 (ADR-0007). Aucun sous-traitant hors région.

**Effacement Loi 25** (FR-016) — orchestré par feature 023 future, mais le
cas d'usage `AnonymiserProfilUseCase` est livré ici (consommable). Cascade :

- biographie + titre → effacés (`UPDATE … SET biographie = NULL, titre = NULL`).
- photo courante + historique FIFO → supprimés de S3 (`DeleteObject`, pas
  tombstone).
- années d'expérience → `NULL`.
- toggle `afficherNomComplet` → `false`.
- spécialités, langues, zones → set vides `[]`.
- statut → `anonymisé` (irréversible).
- slug → reversé vers `SlugReservation` (jamais réattribué, SC-007).

L'enregistrement `ConseillerProfile` conserve `slug`, `publishedAt`,
`anonymizedAt`, `authUserId`. Pas de `DELETE` cascade (préservation
historique d'audit). Le `AuthUser` lui-même est anonymisé par le module
identité selon sa propre logique (hors scope ici).

**Rétention** : alignée sur le tableau de la constitution. *Profil conseiller
actif → tant qu'actif. Profil conseiller désactivé → 6 mois → pseudonymisation.*
Le statut `anonymisé` est terminal et conservé pour traçabilité d'audit
(7 ans).

### III. Qualité de lead avant volume — ✅ Adressé (préserve l'invariant)

005 **ne touche pas au matching** au sens algorithmique (pas de scoring,
pas de notification). MAIS elle pose le **contrat** que 011 consommera :

- **Port `EstProfilPublicUseCase`** est la source de vérité d'éligibilité
  matching (FR-022). 011 NE DOIT PAS filtrer par autre chose.
- **Paramètre `suggested=<id>`** (FR-008a) — boost soft ≤ +10 % cumulé,
  pas un override. Validité 24 h. Aucune entrée du cookie ne peut forcer
  l'inclusion d'un conseiller au-delà du plafond 3 (Principe III). 011
  appliquera le boost mais le top-3 reste algorithmique.
- **Plafond 3 conseillers strictement préservé** : si la liste du cookie
  contient 10 entrées (FR-008a, plafond technique), au moment du
  matching ces 10 IDs reçoivent un boost soft chacun mais la sélection
  finale reste 3 max. Documenté dans le contrat `intake-suggested-middleware.md`.

### IV. Français d'abord — ✅ Adressé

Tous les libellés FR-CA, clés i18n via `next-intl` en place :

- Page publique : « Profil de conseiller », « Spécialités », « Langues
  parlées », « Zones d'expertise », « Pourquoi je ne peux pas contacter
  ce conseiller directement ? », « Décrivez votre projet ».
- Édition : « Mon profil », « Titre / accroche », « Biographie »
  (100-2000 caractères), « Photo de profil », « Afficher mon nom complet
  sur ma page publique ».
- Dashboard : « Mon espace conseiller », « Mon profil », « Mes leads »
  (placeholder), « Mon abonnement » (placeholder), « Ma conformité ».
- Messages d'erreur : « La biographie doit faire entre 100 et 2000
  caractères », « Format d'image non supporté (JPEG, PNG ou WebP) »,
  « Fichier trop volumineux (5 Mo maximum) », « Veuillez sélectionner au
  moins une spécialité ».
- Modération admin : « Retirer la photo », « Masquer le profil
  temporairement », « Raison (obligatoire) ».

Slug FR-CA (cf. Q1) avec ASCII fold pour les accents (`éà` → `e a`,
`ç` → `c`, `œ` → `oe`, `æ` → `ae`).

Format de date FR-CA (last login, last update) via `date-fns/locale/fr-CA`.

### V. Architecture : monolithe modulaire — ✅ Adressé

**Module concerné** : `identite` (extension du module existant 002/002a/006).
Justification du choix de module (vs. créer un module `profil`) :

- Le profil est **owned by** l'identité du conseiller (1-1 avec `AuthUser`).
- Réutilisation maximale : `auth_audit_events` table, `MfaAuditWriter` port
  pattern, `RoleGuard` middleware, `StepUpGuard` pattern.
- Aucun nouveau module dans la roadmap (Principe V — *modules de premier
  niveau* fermés).

**Imports cross-module** documentés :

- 005 consomme `ConformiteQueryPort.estVerifie(conseillerId) → bool`
  (existant, 001).
- 005 consomme `ConformiteQueryPort.certifications(conseillerId) → Certif[]`
  (existant, 001) pour la liste de certifications visibles sur la page
  publique.
- 005 consomme `ConformiteNomLegalReader.lireNomLegal(conseillerId) → {prenom, nom}`
  (**nouveau port à ajouter au module conformité**) pour le formatage du
  nom affiché. C'est l'ajout structurel le plus important côté 001. Sera
  documenté dans `contracts/conformite-nom-legal.port.md` et **un PR
  préparatoire dans 001 sera nécessaire** avant l'implémentation de 005 —
  ou alors le port est défini ici (`apps/api/src/modules/identite/application/ports/conformite-nom-legal-reader.port.ts`)
  et l'implémentation conformité côté infrastructure (`apps/api/src/modules/conformite/infrastructure/prisma-nom-legal-reader.ts`)
  est livrée dans le même PR avec une revue croisée des deux modules.
- 005 **expose** `EstProfilPublicUseCase` (port public consommé futurement
  par 011 matching et 016 SEO).
- 005 **expose** le contrat du cookie `suggested` (consommé futurement par
  011 matching à la soumission de l'intake — décrit dans
  `contracts/intake-suggested-middleware.md`).

**Imports cross-module évités** : aucun import direct de Prisma dans le
domaine ni dans l'application. Aucun JOIN SQL cross-module (la jointure
profil ↔ conformité passe toujours par un port).

**LLM** : non utilisé par cette feature. Pas de coût LLM à plafonner. (Une
amélioration ultérieure pourrait suggérer une biographie générée par LLM
à partir des champs structurés — hors scope MVP, à reconsidérer par ADR si
mesurément utile.)

### VI. Logique métier déterministe et testée (NON-NÉGOCIABLE) — ✅ Adressé

**Logique métier sensible identifiée et placée dans `packages/profil-domain/`**
(fonctions pures, TDD obligatoire) :

1. **`slugify(prenom, nom, suffixe?) → Slug`** — slugification FR-CA. TDD
   sur :
   - Caractères accentués FR-CA (`éèêëàâäîïôöûüçÿæœ` + majuscules) → ASCII.
   - Espaces multiples, tirets multiples, ponctuation → un seul tiret.
   - Bornes : retire tirets en début/fin.
   - Longueur max 60 (tronquer en préservant un mot complet).
   - Caractères interdits (emoji, latin étendu non-FR-CA) → strip.

2. **`genererSlugUnique(prenom, nom, slugExistant: Set<string>, slugReserve: Set<string>) → Slug`**
   — politique de désambiguïsation. TDD sur :
   - Pas de collision → `prenom-nom`.
   - 1 collision → `prenom-nom-2`, puis `-3`, etc.
   - Slug réservé Loi 25 → saut au suivant disponible.
   - Cas pathologique : 100+ collisions → erreur explicite (jamais en prod
     attendu, mais bordure défensive).

3. **`calculerStatutProfil({verifie, profilComplet, masqueAdmin, anonymise}) → StatutProfil`**
   — matrice complète des 16 combinaisons booléennes. TDD couvre toutes les
   transitions. Règles :
   - `anonymise === true` → `anonymisé` (override).
   - sinon `masqueAdmin === true` → `masqué_admin` (override).
   - sinon `verifie === false || profilComplet === false` → `incomplet`
     (par convention, on appelle « incomplet » tout ce qui n'est pas `prêt`,
     dashboard distinguera les deux raisons via FR-012 et FR-012a).
   - sinon → `prêt`.

4. **`profilEstComplet(profil) → boolean`** — calcul pur du
   « tous les champs obligatoires sont remplis ». TDD sur :
   - Titre vide, biographie vide, biographie < 100 chars, spécialités vide,
     langues vide, photo absente → faux.
   - Tous remplis → vrai.

5. **`formaterNomAffiche({prenom, nom, afficherNomComplet}) → string`**
   — formatage FR-CA. TDD sur :
   - `afficherNomComplet === false` + `Marie Dupont` → `Marie D.`.
   - `Marie-Claire Dupont` → `Marie-Claire D.`.
   - `Marie Le Goff` → `Marie L.` (initiale du premier mot du nom).
   - `Marie de la Tour` → `Marie d.` (préserve la particule en minuscule
     dans l'initiale ? À décider en TDD avec test rouge initial — voir
     research.md R5).
   - `afficherNomComplet === true` → `Marie Dupont` complet.

6. **`fenetreValiditeSuggested(timestampConsultation, now) → boolean`** —
   pure, vrai si `now - timestampConsultation < 24 h`. TDD sur bordures
   (23h59min, 24h, 24h01min, drift d'horloge).

**Pas de scoring de matching** dans cette feature (Principe VI parle de
scoring + validation brief — non concernés). Mais les 6 fonctions
ci-dessus sont des règles métier déterministes au sens du Principe VI,
donc TDD obligatoire (commits séparés visibles).

Couverture cible **≥ 95 %** sur `packages/profil-domain/`.

### VII. Observabilité de la boucle économique — ✅ Reporté à 021 (cohérent avec 002)

**Métriques touchant la boucle économique identifiées mais déférées à 021** :

- `cv_profile_published_total` — compteur de profils passés `incomplet → prêt`.
  Alimente le SC-005 (adoption 80 % en 30j).
- `cv_profile_published_lag_seconds` — histogramme du délai entre `verified`
  et `prêt`. Donne le distributif d'adoption pour ajuster les relances.
- `cv_public_page_404_total{reason}` — pour mesurer le bruit
  anti-énumération.
- `cv_admin_moderation_total{action}` — fréquence des actions admin de
  modération.

**Source de vérité** : événements d'audit immuables dans `auth_audit_events`
(table existante 002). 021 dérivera les compteurs Prometheus par sourcing
d'événements (pattern déjà appliqué à 002a/002 pour `cv_active_admins_total`).
Pas de double instrumentation côté 005.

**SC-005 mesure post-déploiement** : un script de scan hebdomadaire dans
`apps/api/src/cli/scan-profile-adoption.ts` calculera le ratio des profils
prêts dans la cohorte des 30 derniers jours et l'écrira dans le tableau
de bord Grafana (préfigurera ce que 021 industrialisera).

### VIII. Clean Architecture et SOLID — ✅ Adressé

**4 couches** strictement respectées :

```
interface/         → Server Actions Next.js + contrôleurs NestJS (mince)
   ↓
application/       → use cases (1 classe = 1 méthode execute = 1 action métier)
   ↓
domaine/           → ConseillerProfile, Slug VO, StatutProfil enum,
                     fonctions pures de calcul + slugify + format nom
   ↑
infrastructure/    → Prisma* repositories, S3PhotoStorage, BullMQRelanceScheduler
```

**Vérification automatique** par `tools/check-module-boundaries.ts` (existant
006). Imports interdits :

- `domaine/` ne peut PAS importer NestJS, Prisma, Next.js, Auth.js, S3 SDK.
- `application/` ne peut PAS importer Prisma ni S3 SDK direct, seulement les
  ports.
- `infrastructure/` ne peut PAS importer `interface/`.

**SOLID** appliqué :

- **S** — chaque use case fait UNE chose. `EditerProfilUseCase` ne valide pas
  la photo (`UploaderPhotoUseCase` séparé). `MasquerProfilUseCase` ≠
  `RetablirProfilUseCase`.
- **O** — ajout d'un futur statut profil (par ex. `verifie_en_revue` pour
  modération deuxième niveau) se fait par extension d'enum + nouveau use
  case, sans toucher `calculerStatutProfil` (Open/Closed via pattern
  matching exhaustif TypeScript).
- **L** — `S3PhotoStorage` substitue `InMemoryPhotoStorage` (test) sans
  comportement surprenant (même signature de port, même contrat
  d'erreurs).
- **I** — ports granulaires : `PhotoStorage.upload(key, buffer) → url`,
  `PhotoStorage.delete(key) → void`, pas un fourre-tout `PhotoStorageManager`.
  De même `ProfilConseillerRepository.findBySlug` ≠ `findById` ≠ `update`
  signatures distinctes.
- **D** — l'application dépend d'abstractions. `EditerProfilUseCase`
  reçoit un `ProfilConseillerRepository` interface, pas une instance
  Prisma. Injection via le conteneur NestJS.

**Aucune violation** à documenter dans *Complexity Tracking* (section vide
pour cette feature).

### IX. Sécurité applicative (NON-NÉGOCIABLE) — ✅ Adressé

**RBAC** appliqué en couche application :

- `EditerProfilUseCase`, `UploaderPhotoUseCase` : `@RequireRole('conseiller')` +
  vérification que `authUserId` correspond au profil édité (pas
  d'édition d'un autre profil).
- `RetirerPhotoUseCase`, `MasquerProfilUseCase`, `RetablirProfilUseCase` :
  `@RequireRole('admin')` + audit log obligatoire.
- `AnonymiserProfilUseCase` : ne peut être appelé que par feature 023
  (orchestrateur Loi 25, future) — guard `@InternalOnly` ou via port côté
  application.
- `LirePageProfilPubliqueUseCase` : pas d'auth (route publique), mais
  filtrage strict via `EstProfilPublicUseCase`.

**AuthN** : MFA conseiller obligatoire avant édition (déjà imposé par 002a
sur les routes `/(conseiller)/**`). Pas de step-up MFA particulier pour
l'édition de profil (décision MVP — la session MFA-validée suffit).

**Validation Zod côté serveur** :

- `EditerProfilDto` (titre, biographie, spécialités, zones, langues,
  années, `afficherNomComplet`) — validation cardinale + longueurs +
  enum pour les énumérations.
- `UploadPhotoDto` (file, mime type) — validation MIME réelle via `sharp`
  (pas seulement le header HTTP).
- `MasquerProfilDto` (raison ≥ 10 chars).
- `SuggestedCookieEntry` ({conseillerId UUID, timestamp ISO 8601}) —
  validé au décodage du cookie pour rejeter les manipulations.

**En-têtes HTTP** : déjà gérés par `@fastify/helmet` (002a). Pas de
changement.

**Aucun secret en clair** :

- Bucket S3 + KMS key ID : `AWS_S3_PROFILES_BUCKET`, `AWS_KMS_PROFILES_KEY_ID`
  dans AWS Secrets Manager (prod) / 1Password (dev).
- Cookies `suggested` : signés HMAC avec `CV_SUGGESTED_COOKIE_SECRET`
  (rotation possible sans invalider les sessions de session — clé séparée).

**Aucun SQL brut** : tout passe par Prisma. Aucune exception ici.

#### Audit OWASP Top 10 explicite

| # | Risque | Mitigation |
|---|---|---|
| A01 Broken Access Control | RBAC `RoleGuard` (002a) + ownership check sur `EditerProfilUseCase` (un conseiller ne peut éditer que son propre profil) + admin uniquement sur modération + anonymisation route interne (orchestrée par 023) |
| A02 Cryptographic Failures | Cookies `suggested` signés HMAC (`CV_SUGGESTED_COOKIE_SECRET` AWS Secrets Manager, rotation séparée) + S3 SSE-KMS sur les photos (ADR-0001) + cookies session Auth.js avec `__Host-` + `Secure` + `SameSite` (existant 002a) |
| A03 Injection | Prisma typed queries, zéro SQL brut + Zod validation entrée HTTP côté serveur (toutes les Server Actions + API routes) + slugify déterministe (pas d'injection via le nom légal) |
| A04 Insecure Design | Anti-énumération page publique 404 unifiée (FR-007 + SC-003) + boost soft `suggested` sans override Principe III + slug réservé Loi 25 (FR-015) + asymétrie slug ↔ nom affiché communiquée à l'UI (transparence) |
| A05 Security Misconfiguration | Helmet (existant) + `Content-Security-Policy` (existant) + `noindex` explicite sur routes `/(conseiller)/**` et `/(admin)/**` (Next.js metadata export) + bucket S3 privé avec URLs signées (jamais public-read) |
| A06 Vulnerable Components | pnpm audit bloquant CRITICAL en CI (existant) + Renovate actif. Nouveau pkg `sharp@^0.33` : vérifié CVE-free au 2026-05-27. |
| A07 Identification/AuthN Failures | MFA héritée 002a obligatoire avant accès `/(conseiller)/**` + session 30j glissants (006) + sessions admin distinctes (002) |
| A08 Software Integrity Failures | npm lockfile committé + pnpm audit en CI + `sharp` post-install autorisé (audité, signé) |
| A09 Security Logging | Audit `auth_audit_events` append-only pour toute édition de profil (FR-018), upload photo, action admin de modération. Les triggers Postgres rejettent UPDATE/DELETE/TRUNCATE (pattern 002a + 002). |
| A10 SSRF | Pas d'URL externe consommée. Upload photo = stream client → S3 direct, pas de re-fetch côté serveur. |

### X. Fiabilité et résilience — ✅ Adressé

**SLO endpoints concernés** (Principe X, p95 < 800 ms hors LLM) :

- `GET /conseiller/[slug]` (SSG ISR) — < 100 ms p95 cache hit, < 400 ms p95
  cache miss.
- `POST /api/profil` (Server Action `editerProfil`) — < 600 ms p95.
- `POST /api/profil/photo` (upload + S3 PUT) — < 1500 ms p95 (acceptable
  car opération file, hors SLO synchrone strict).
- `GET /api/profil/me` (lecture pour édition) — < 200 ms p95.
- `POST /admin/profils/:id/retirer-photo` — < 800 ms p95.
- `POST /admin/profils/:id/masquer` — < 600 ms p95.
- `POST /admin/profils/:id/retablir` — < 400 ms p95.

**Idempotence** sur les écritures :

| Endpoint | Idempotent ? | Mécanisme |
|---|---|---|
| `POST /api/profil` (édition) | ✅ Naturellement (UPDATE par clé primaire, même payload = même état). |
| `POST /api/profil/photo` | ⚠ Pas strictement (chaque upload = nouvelle version FIFO). Mais re-upload du même contenu produit un row avec un nouveau timestamp ; pas d'effet de bord néfaste. `Idempotency-Key` accepté optionnellement (interceptor existant 001). |
| `POST /admin/profils/:id/masquer` | ✅ Re-soumission identique = même résultat (UPDATE idempotent + audit déduplique sur `actor + cible + raison + timestamp_seconde`). |
| `POST /admin/profils/:id/retablir` | ✅ Idem. |
| Anonymisation Loi 25 (interne, orchestré 023) | ✅ Idempotent (le statut `anonymisé` est terminal, re-appel = no-op). |
| Job BullMQ `onboarding_reminder` | ✅ Idempotent — vérifie `statut === incomplet` à l'exécution, sinon no-op. |

**Modes dégradés documentés** :

| Dépendance | Mode dégradé |
|---|---|
| **S3 HS** (upload photo) | L'édition de profil reste possible (titre, biographie, etc.) mais l'upload retourne erreur 503 explicite avec retry suggéré. La photo en cours (déjà uploadée) reste affichable au public via les URLs signées CloudFront. |
| **Conformité HS** (lecture `verified` / `nomLegal`) | Pages publiques renvoient 404 (fail-secure) pendant l'indisponibilité — anti-marketplace doit l'emporter sur la disponibilité. Dashboard conseiller affiche un bandeau « Statut de conformité temporairement indisponible » mais reste utilisable pour éditer le profil (les écritures n'attendent pas la conformité). |
| **DB primaire HS** | Pages publiques continuent à servir le HTML SSG mis en cache CDN (~60s TTL). Édition impossible (503 explicite via Auth.js guard, existant 002a). |
| **BullMQ HS** (scheduler) | Relances onboarding retardées (rattrapées au redémarrage). Pas de blocage du flux principal. |

**Health checks** : déjà exposés par `apps/api` et `apps/web` (existant 001).
Pas de changement.

**Circuit breakers** : pas nécessaires (aucun appel HTTP sortant côté
backend ; S3 SDK gère ses propres retries).

### XI. Accessibilité WCAG 2.1 AA (NON-NÉGOCIABLE) — ✅ Adressé

**Page publique `/conseiller/[slug]`** :

- Hiérarchie de titres : `h1` (nom affiché + spécialité principale), `h2`
  (sections : Biographie, Spécialités, Langues, Zones, Certifications,
  Pourquoi pas de contact direct).
- Image de profil : `<img>` avec `alt` descriptif obligatoire (« Photo de
  profil de Marie D. »), `width` et `height` extraits par `sharp` au upload
  (CLS = 0).
- Section pédagogique « Pourquoi je ne peux pas contacter ce conseiller
  directement ? » est un `<details>` ou un `<section>` ouvrable au clavier.
- CTA principal : `<a href="/intake?suggested=...">` accessible clavier,
  focus visible, contraste AA.
- Pas d'animation > 5 s, respect `prefers-reduced-motion`.

**Édition profil `/(conseiller)/conseiller/profil`** :

- `react-hook-form` + shadcn `Form` (déjà conformes WCAG via shadcn/ui par
  construction).
- Toggle `afficherNomComplet` : `<Switch>` Radix UI avec `aria-label`
  explicite + texte d'aide visible « Le nom dans l'URL de votre page
  publique reste basé sur votre nom légal. ».
- Multi-select spécialités/langues/zones : combobox accessible (`role="listbox"`,
  `aria-multiselectable`), navigation flèches + Enter.
- Compteur biographie 100-2000 avec `aria-live="polite"`.
- Upload photo : `<input type="file">` avec label visible, drag-and-drop
  optionnel ne remplace pas le picker natif.
- Messages d'erreur via `aria-describedby`, contraste 4.5:1.

**Dashboard `/(conseiller)/conseiller`** : landmarks ARIA (`<main>`,
`<nav>`), widgets en `<section>` avec `aria-labelledby`, warnings
(FR-012, FR-012a) en `<div role="alert">` au chargement.

**Console admin `/(admin)/admin/profils`** : modale de confirmation avec
focus trap correct (`@radix-ui/react-dialog`), champ raison `<Textarea>`
avec label associé, bouton « Retirer photo » destructeur en
`<Button variant="destructive">` avec `aria-describedby` rappel.

**axe-core CI bloquant** sur 5 routes :
`/conseiller/<slug-seed>`, `/(conseiller)/conseiller`,
`/(conseiller)/conseiller/profil`, `/(conseiller)/conseiller/profil/apercu`,
`/(admin)/admin/profils`. Toute violation `serious` ou `critical` = échec CI.

**Test au zoom 200 %** lors de la PR de revue (manuel) — pas de perte de
fonctionnalité.

**Audit lecteur d'écran** (NVDA) sur la page publique pour la release
majeure — compte-rendu dans `docs/a11y/release-005.md`.

### XII. Optimisation SEO (NON-NÉGOCIABLE) — ✅ Adressé

**Page publique `/conseiller/[slug]`** est l'objet SEO de cette feature
(préfigure 016) :

- **SSG avec ISR on-demand** (Next.js `generateStaticParams` + `revalidateTag`
  appelé sur transition conformité). LCP < 1,2 s p75 cible.
- **Métadonnées complètes** : `<title>` unique (nom affiché + spécialité
  principale), `meta description` < 160 caractères (extrait biographie),
  `<link rel="canonical">` vers `/conseiller/<slug>`, Open Graph
  (`og:title`, `og:description`, `og:image` = photo de profil S3 via
  CloudFront, `og:url`, `og:locale = fr_CA`), `twitter:card`.
- **Schema.org `Person` minimal** (FR-020, sans `contactPoint` ni
  `telephone` ni `email`) : `{"@type": "Person", "name": ..., "image": ...,
  "knowsLanguage": [...], "knowsAbout": [...spécialités], "memberOf": {
  "@type": "ProfessionalService", "name": "Conseiller Voyage", "url":
  "https://conseiller-voyage.ca" }}` — l'action structurée pointe
  exclusivement vers `/intake` (`PotentialAction → SearchAction` ou
  `ContactAction → Action.target = /intake?suggested=<id>`).
- **URL canonique propre** `/conseiller/<slug>` sans paramètres.
- **`hreflang`** différé à la feature 024 (i18n) — `<meta charset>` +
  `<html lang="fr-CA">` suffisent pour le MVP.
- **Robots / sitemap** : sitemap.xml dynamique listant les profils en
  statut `prêt` (route `/sitemap.xml` Next.js) sera ajouté ici. Pages
  `/(conseiller)/**` et `/(admin)/**` taggées `noindex` (existant 006).

**Cibles CWV (P75 réel via CrUX)** :

- LCP < 1,2 s (cible interne, sous le budget 2,5 s) — l'image de profil
  est l'élément candidate LCP, pré-chargée via `<link rel="preload">` +
  `priority` sur `next/image`.
- INP < 100 ms (pas d'interactivité lourde).
- CLS < 0,05 (dimensions image figées).
- Budget JS initial < 100 kB compressé (page publique pratiquement RSC
  pure).

**Lighthouse CI bloquant** : Performance ≥ 90, SEO ≥ 95, A11y ≥ 95.
Régression > 10 % = échec CI.

**Optimisation images** : photos servies en **WebP** par CloudFront avec
fallback JPEG via négociation `Accept`. Lazy-loading `loading="lazy"`
sauf pour la photo de profil (hero, `priority`). Resize automatique
**hors scope MVP** (cf. Assumptions spec — relève de 016 ou 025).

**Crawling** : `robots.txt` autorise `/conseiller/*`. Sitemap soumis à
GSC (manuellement post-déploiement initial). Vérification post-déploiement
qu'aucun bloqueur CloudFlare/CDN ne tag noindex involontairement.

**Mesure post-déploiement** : tableau de bord Search Console intégré à
Grafana (clics, impressions, position moyenne) — instrumentation déférée
à 021 mais le hook GSC est mis en place ici.

### Definition of Done

La DoD intégrale de la constitution sera cochée avant merge :

- [ ] Tous les FR de la spec couverts par tests unitaires + intégration
      verts (Vitest, Testcontainers, Playwright).
- [ ] Tous les SC mesurables vérifiables (avec scripts dédiés pour SC-002
      anti-marketplace, SC-003 anti-énumération, SC-007 slug Loi 25).
- [ ] `pnpm --filter @cv/profil-domain test` ≥ 95 % de couverture.
- [ ] `pnpm --filter @cv/api test:integration` 100 % vert.
- [ ] axe-core CI vert sur les 5 routes (Principe XI).
- [ ] Lighthouse CI vert sur `/conseiller/<slug-seed>` (Principe XII).
- [ ] `pnpm lint` (Biome) sans warning, `pnpm typecheck` propre.
- [ ] Migration Prisma `profil.prisma` testée en staging avec rollback
      applicatif vérifié.
- [ ] Documentation FR-CA : README `apps/api`, README `apps/web` (sections
      profil ajoutées), runbook `docs/runbooks/profil-moderation.md` (≤ 1
      page) pour les admins, runbook `docs/runbooks/profil-anonymisation-loi25.md`
      (≤ 1 page) pour l'orchestration 023.
- [ ] **ADR-0015 livré** : `docs/adr/0015-slug-reserve-loi25.md` — analyse
      Loi 25 explicite de la conservation du slug post-effacement (cf.
      Constitution Check Principe II du plan).
- [ ] Templates email FR-CA dans `packages/email-templates/profil/` :
      `onboarding-reminder-3j.tsx`, `onboarding-reminder-7j.tsx`,
      `onboarding-reminder-14j.tsx`, `profil-masque-admin.tsx`.
- [ ] `packages/profil-domain/README.md` documenté.
- [ ] Test d'invariant `tools/check-no-contact-fields-profile.ts` ajouté
      à la CI (Principe I).
- [ ] Test d'invariant `tools/check-anti-enum-profile.ts` ajouté à la CI
      (vérifie que les 5 cas 404 produisent un corps HTTP identique).

---

## Structure de projet

### Documentation (cette feature)

```text
specs/007-profil-conseiller/
├── plan.md                                # Ce fichier
├── research.md                            # Phase 0 — décisions techniques (R1-R8)
├── data-model.md                          # Phase 1 — entités + transitions + migrations
├── quickstart.md                          # Phase 1 — flow démo pour reviewer
├── contracts/
│   ├── profil-public.port.md              # Lecture page publique
│   ├── profil-edition.port.md             # Édition conseiller
│   ├── profil-moderation.port.md          # Actions admin (retirer photo, masquer, rétablir)
│   ├── est-profil-public.port.md          # Port public consommé par 011 + 016
│   ├── conformite-nom-legal.port.md       # Port à ajouter au module conformité
│   ├── http-endpoints.md                  # Routes HTTP + Server Actions
│   └── intake-suggested-middleware.md     # Contrat cookie `suggested` (consommé par 011)
├── checklists/
│   └── requirements.md                    # Déjà créé par /speckit.specify
└── tasks.md                               # Phase 2 (créé par /speckit.tasks plus tard)
```

### Code source (extension de la structure existante)

```text
packages/
├── profil-domain/                          # NOUVEAU package
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── result.ts                       # Result<T,E> + ok/err helpers (cf. profil-edition.port.md)
│   │   ├── slug.ts                         # slugify + genererSlugUnique (pure) + SLUGS_RESERVES_FRAMEWORK
│   │   ├── magic-number.ts                 # detecterFormatImage (12 octets, cf. R3)
│   │   ├── statut-profil.ts                # calculerStatutProfil + profilEstComplet
│   │   ├── nom-affiche.ts                  # formaterNomAffiche
│   │   ├── suggested-window.ts             # fenetreValiditeSuggested
│   │   ├── suggested-cookie.ts             # encodage/décodage HMAC du cookie cv_suggested
│   │   └── dtos/                           # schémas Zod partagés api+web
│   │       ├── editer-profil.dto.ts
│   │       ├── upload-photo.dto.ts
│   │       ├── masquer-profil.dto.ts
│   │       └── suggested-cookie-entry.dto.ts
│   └── tests/
│       ├── slug.test.ts                    # TDD slugify FR-CA + collision + framework reserved
│       ├── magic-number.test.ts            # TDD détection JPEG/PNG/WebP + faux positifs RIFF
│       ├── statut-profil.test.ts           # TDD matrice 16 combinaisons
│       ├── nom-affiche.test.ts             # TDD formatage FR-CA (noms composés, particules)
│       ├── suggested-window.test.ts        # TDD bordures 24h
│       └── suggested-cookie.test.ts        # TDD HMAC + tamper detection
│
├── db/prisma/schema/
│   ├── profil.prisma                       # NOUVEAU — ConseillerProfile + PhotoHistory + SlugReservation + OnboardingReminder
│   └── (autres .prisma existants inchangés)
│
└── email-templates/profil/                 # NOUVEAU sous-répertoire
    ├── onboarding-reminder-3j.tsx
    ├── onboarding-reminder-7j.tsx
    ├── onboarding-reminder-14j.tsx
    └── profil-masque-admin.tsx

apps/api/src/
├── modules/identite/                       # EXTENSION du module 002+002a+006
│   ├── application/
│   │   ├── ports/
│   │   │   ├── profil-conseiller-repository.port.ts        # NOUVEAU
│   │   │   ├── photo-historique-repository.port.ts         # NOUVEAU
│   │   │   ├── slug-reservation-repository.port.ts         # NOUVEAU
│   │   │   ├── photo-storage.port.ts                       # NOUVEAU (S3)
│   │   │   ├── onboarding-relance-scheduler.port.ts        # NOUVEAU (BullMQ)
│   │   │   ├── conformite-nom-legal-reader.port.ts         # NOUVEAU (vers 001)
│   │   │   ├── conformite-query.port.ts                    # déjà existant (001)
│   │   │   └── profil-moderation-audit-writer.port.ts      # NOUVEAU (réutilise journal auth_audit_events)
│   │   └── use-cases/
│   │       ├── editer-profil.use-case.ts                   # NOUVEAU
│   │       ├── uploader-photo.use-case.ts                  # NOUVEAU
│   │       ├── lire-profil-prive.use-case.ts               # NOUVEAU (édition)
│   │       ├── lire-page-profil-publique.use-case.ts       # NOUVEAU
│   │       ├── previsualiser-profil.use-case.ts            # NOUVEAU (aperçu)
│   │       ├── planifier-relances-onboarding.use-case.ts   # NOUVEAU
│   │       ├── envoyer-relance-onboarding.use-case.ts      # NOUVEAU (worker)
│   │       ├── retirer-photo-admin.use-case.ts             # NOUVEAU
│   │       ├── masquer-profil-admin.use-case.ts            # NOUVEAU
│   │       ├── retablir-profil-admin.use-case.ts           # NOUVEAU
│   │       ├── anonymiser-profil-loi25.use-case.ts         # NOUVEAU (consommé par 023)
│   │       ├── reserver-slug-loi25.use-case.ts             # NOUVEAU
│   │       └── est-profil-public.use-case.ts               # NOUVEAU (port public 011+016)
│   ├── infrastructure/
│   │   ├── prisma-profil-conseiller-repository.ts          # NOUVEAU
│   │   ├── prisma-photo-historique-repository.ts           # NOUVEAU
│   │   ├── prisma-slug-reservation-repository.ts           # NOUVEAU
│   │   ├── s3-photo-storage.ts                             # NOUVEAU (réutilise client S3 001)
│   │   ├── cloudfront-cache-invalidator.ts                 # NOUVEAU (cf. R4 CDN invalidation)
│   │   ├── bullmq-onboarding-relance-scheduler.ts          # NOUVEAU
│   │   ├── prisma-profil-moderation-audit-writer.ts        # NOUVEAU
│   │   ├── prisma-profil-public-reader.ts                  # NOUVEAU (impl ProfilPublicReader)
│   │   └── (existants 002/002a/006 intacts)
│   └── interface/
│       ├── profil-conseiller.controller.ts                 # NOUVEAU — Server Actions Next.js consomment via /api/profil
│       ├── profil-admin.controller.ts                      # NOUVEAU — actions modération
│       └── (existants intacts)
│
├── modules/conformite/                                     # EXTENSION
│   └── infrastructure/
│       └── prisma-nom-legal-reader.ts                      # NOUVEAU — implémente conformite-nom-legal-reader.port côté 001
│
├── workers/
│   ├── onboarding-reminders.worker.ts                      # NOUVEAU — consomme jobs BullMQ onboarding_reminder
│   └── cleanup-orphan-photos.worker.ts                     # NOUVEAU — quotidien, compensation S3 (cf. C4)
│
└── cli/
    └── scan-profile-adoption.ts                            # NOUVEAU — script de mesure SC-005 (hebdomadaire)

apps/web/src/
├── app/
│   ├── conseiller/                                         # NOUVEAU groupe (page publique, hors layout auth)
│   │   └── [slug]/
│   │       ├── page.tsx                                    # SSG ISR
│   │       ├── opengraph-image.tsx                         # OG image dynamique
│   │       └── loading.tsx
│   ├── (conseiller)/                                       # EXTENSION (existant 006)
│   │   └── conseiller/
│   │       ├── page.tsx                                    # NOUVEAU — dashboard
│   │       ├── profil/
│   │       │   ├── page.tsx                                # NOUVEAU — édition
│   │       │   └── apercu/
│   │       │       └── page.tsx                            # NOUVEAU — aperçu public
│   │       └── (autres existants)
│   ├── (admin)/                                            # EXTENSION (existant 001)
│   │   └── admin/
│   │       └── profils/
│   │           ├── page.tsx                                # NOUVEAU — liste modération
│   │           └── [id]/
│   │               └── page.tsx                            # NOUVEAU — détail + actions
│   ├── intake/                                             # déjà existant (008 futur) — middleware ajouté
│   ├── sitemap.xml/                                        # NOUVEAU — sitemap dynamique profils
│   └── not-found.tsx                                       # ÉTENDU — page 404 anti-énumération unifiée
└── middleware.ts                                           # ÉTENDU — chaîne avec auth + CGU + suggested

tools/
├── check-no-contact-fields-profile.ts                      # NOUVEAU — invariant Principe I
└── check-anti-enum-profile.ts                              # NOUVEAU — invariant FR-007 + SC-003
```

**Décision de structure** : extension du module `identite` existant
(pas de nouveau module). Justifié par le 1-1 entre `ConseillerProfile`
et `AuthUser`, la réutilisation maximale (journal d'audit, RBAC, ports
conformité), et le respect du Principe V (modules de premier niveau
fermés). Un nouveau **package** `@cv/profil-domain` isolé permet le
TDD pur sur la logique métier (slug, statut, formatage).

---

## Complexity Tracking

> *Aucune violation à justifier — toutes les portes de la constitution
> sont respectées sans dérogation. Section laissée vide.*

| Violation | Pourquoi nécessaire | Alternative plus simple rejetée parce que |
|-----------|---------------------|-------------------------------------------|
| — | — | — |

---

## Pointeurs Phase 0 / Phase 1

- **Phase 0** : [`research.md`](research.md) — résout les questions ouvertes
  techniques (slugify FR-CA, bucket S3 photos vs réutilisation, validation
  MIME via `sharp`, mécanisme ISR Next.js, middleware suggested, anti-énumération
  constant-time, BullMQ scheduler delayed jobs, asymétrie slug-nom-affiché
  pour les noms composés FR).
- **Phase 1** :
  - [`data-model.md`](data-model.md) — entités Prisma + transitions de
    statut + migrations.
  - [`contracts/`](contracts/) — ports applicatifs + endpoints HTTP +
    contrat middleware suggested.
  - [`quickstart.md`](quickstart.md) — flow démo end-to-end pour
    reviewer.

---

**Version du plan** : 1.0 (initial — 2026-05-27)
