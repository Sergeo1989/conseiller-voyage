# Phase 1 — Data Model : Profil conseiller (feature 005)

**Branche** : `007-profil-conseiller` | **Date** : 2026-05-27

Modélisation Prisma + transitions d'état + migrations. Source : entités
identifiées dans `spec.md` section *Key Entities*, raffinées par
`research.md`.

---

## Vue d'ensemble — schéma Prisma

Nouveau fichier `packages/db/prisma/schema/profil.prisma` :

```prisma
// schema/profil.prisma — extension multi-file du schéma principal

enum StatutProfil {
  incomplet
  pret
  masque_admin
  anonymise
}

enum OnboardingRelanceEtape {
  j3
  j7
  j14
}

enum OnboardingRelanceEtat {
  planifie
  envoye
  annule
  echoue
}

enum ProfilModerationAction {
  retrait_photo
  masquage
  retablissement
}

model ConseillerProfile {
  id                 String        @id @default(uuid())
  authUserId         String        @unique // FK vers AuthUser (module identité 002+002a+006)
  authUser           AuthUser      @relation(fields: [authUserId], references: [id], onDelete: NoAction)

  // Champs éditables (FR-001)
  titre              String?       @db.VarChar(80)
  biographie         String?       @db.Text
  specialites        ProfileSpeciality[] @relation("ProfileSpecialities")
  zonesGeographiques ProfileGeoZone[]    @relation("ProfileGeoZones")
  langues            ProfileLanguage[]   @relation("ProfileLanguages")
  anneesExperience   Int?

  // Photo (cf. R3 — dimensions persistées pour CWV)
  photoS3Key         String?       @db.VarChar(255)
  photoWidth         Int?
  photoHeight        Int?
  photoContentType   String?       @db.VarChar(50)

  // Affichage du nom (Q4 / FR-006a)
  afficherNomComplet Boolean       @default(false)

  // Slug (Q1 / FR-015) — généré au premier verified, immuable post-publication
  slug               String?       @unique @db.VarChar(60)

  // Statut (FR-003) — calculé sauf override admin/Loi 25
  statut             StatutProfil  @default(incomplet)
  raisonMasquageAdmin String?      @db.Text // NULL sauf si statut = masque_admin

  // Timestamps
  publishedAt        DateTime?     // premier passage en statut = pret
  updatedAt          DateTime      @updatedAt
  anonymizedAt       DateTime?     // FR-016
  createdAt          DateTime      @default(now())

  // Relations
  photoHistorique    ProfilePhotoHistory[]
  relancesOnboarding ProfileOnboardingReminderSchedule[]
  moderationsAudit   ProfilModerationAudit[]

  @@index([statut, publishedAt])  // requête liste publique (sitemap)
  @@index([statut, authUserId])   // dashboard
  @@map("conseiller_profiles")
}

enum PhotoUploadStatut {
  pending_upload   // ligne pré-insérée AVANT le PUT S3 (transitoire, < 1h)
  commit           // PUT S3 réussi, ligne stable
  evicted          // évincée par FIFO (5 versions max), DELETE S3 en cours/fait
}

model ProfilePhotoHistory {
  id               String     @id @default(uuid())
  profileId        String
  profile          ConseillerProfile @relation(fields: [profileId], references: [id], onDelete: NoAction)
  s3Key            String     @db.VarChar(255)
  statut           PhotoUploadStatut @default(pending_upload)
  width            Int?
  height           Int?
  contentType      String?    @db.VarChar(50)
  uploadedAt       DateTime   @default(now())
  committedAt      DateTime?  // set quand statut passe à 'commit'
  evictedAt        DateTime?  // set quand statut passe à 'evicted'

  @@index([profileId, uploadedAt(sort: Desc)])
  @@index([statut, uploadedAt])  // requête du job de nettoyage orphelins
  @@map("profile_photo_history")
}

model SlugReservation {
  slug             String     @id @db.VarChar(60)
  raison           String     @db.VarChar(50) // "loi25" | "revocation_permanente"
  reservedAt       DateTime   @default(now())
  conseillerIdOrigine String?  // NULL après anonymisation Loi 25 (cf. ADR-0015) ; conservé pour révocation permanente non-Loi 25

  @@map("slug_reservations")
}

model ProfileOnboardingReminderSchedule {
  id              String                  @id @default(uuid())
  profileId       String
  profile         ConseillerProfile       @relation(fields: [profileId], references: [id], onDelete: NoAction)
  etape           OnboardingRelanceEtape
  etat            OnboardingRelanceEtat   @default(planifie)
  bullmqJobId     String                  @unique // déterministe : onboarding-reminder-<profileId>-<etape>
  scheduledFor    DateTime
  sentAt          DateTime?
  cancelledAt     DateTime?

  @@unique([profileId, etape])
  @@index([etat, scheduledFor])
  @@map("profile_onboarding_reminder_schedules")
}

model ProfilModerationAudit {
  id              String                   @id @default(uuid())
  profileId       String
  profile         ConseillerProfile        @relation(fields: [profileId], references: [id], onDelete: NoAction)
  adminAuthUserId String  // pas de FK -- conserve l'audit même après anonymisation admin (cf. ADR-0012 + Loi 25)
  adminEmailHash  String  @db.VarChar(64)  // SHA-256 pour corrélation
  action          ProfilModerationAction
  raison          String  @db.Text          // obligatoire (FR-023)
  metadonneesJson Json?
  occurredAt      DateTime @default(now())

  @@index([profileId, occurredAt(sort: Desc)])
  @@map("profil_moderation_audits")
}

// Énumérations versionnées — seedées via migration éditoriale
// (Assumptions spec — pas géré par les conseillers)
model ProfileSpeciality {
  code             String     @id @db.VarChar(40)
  labelFr          String     @db.VarChar(80)
  ordre            Int        @default(0)
  actif            Boolean    @default(true)
  profiles         ConseillerProfile[]  @relation("ProfileSpecialities")

  @@map("profile_specialities")
}

model ProfileGeoZone {
  code             String     @id @db.VarChar(40)
  labelFr          String     @db.VarChar(80)
  ordre            Int        @default(0)
  actif            Boolean    @default(true)
  profiles         ConseillerProfile[]  @relation("ProfileGeoZones")

  @@map("profile_geo_zones")
}

model ProfileLanguage {
  code             String     @id @db.VarChar(8)   // ISO 639-1 ou tag composite (ex: fr-CA)
  labelFr          String     @db.VarChar(80)
  ordre            Int        @default(0)
  actif            Boolean    @default(true)
  profiles         ConseillerProfile[]  @relation("ProfileLanguages")

  @@map("profile_languages")
}
```

### Notes sur le schéma

1. **Pas de FK directe vers `AuthUser` avec `onDelete: Cascade`** —
   cohérent avec le pattern 002 (ADR-0012) : l'audit de modération
   conserve `adminAuthUserId` SANS FK pour permettre l'effacement Loi 25
   de l'admin sans rompre l'audit. La relation `ConseillerProfile → AuthUser`
   est en `NoAction` ; l'anonymisation Loi 25 d'un conseiller est gérée
   applicativement (`AnonymiserProfilUseCase` met `statut = anonymise`
   sans toucher au lien `authUserId`).

2. **Slug nullable** : un `ConseillerProfile` peut exister sans slug
   (avant le premier passage `verified` — `statut = incomplet` côté
   conformité). Le slug est généré exactement au moment de la transition
   `pending → verified`, déclenché par un listener côté identité (event
   du module conformité).

3. **Index sur `slug` UNIQUE** + **index sur `slug` dans `SlugReservation`**
   — la requête de génération de slug (R1) doit checker les deux tables.
   Le port `genererSlugUnique` reçoit les deux sets pré-chargés (ou un
   adaptateur Prisma qui fait deux requêtes par essai).

4. **`ProfileSpeciality`, `ProfileGeoZone`, `ProfileLanguage`** :
   énumérations seedées par migration. Les conseillers sélectionnent
   **par référence** (`code`), jamais par texte libre. Évolution
   éditoriale = nouvelle migration qui ajoute des lignes (ou flag
   `actif = false` pour retirer un code obsolète sans casser les profils
   qui l'utilisent).

5. **`auth_audit_events`** (table existante, module 002) reste la
   source de vérité pour les actions d'édition (Principe IX + FR-018).
   La table `ProfilModerationAudit` ne duplique PAS cet audit : elle
   capture uniquement les **actions admin** spécifiques au profil
   (retrait photo, masquage, rétablissement) avec leur `raison`
   spécialisée. Elle est annexe à `auth_audit_events`.

---

## Transitions d'état du `statut` de profil

Machine d'état persistée dans `ConseillerProfile.statut`. Calcul dérivé
en lecture (cf. `calculerStatutProfil` dans `profil-domain`) sauf si
`masqué_admin` ou `anonymisé` (overrides persistés).

```
                       ┌─────────────────────────────────────────────┐
                       │                                             │
                       ▼                                             │
                  ┌──────────┐  conformité = verified                │
                  │ incomplet│  ET profil complet                    │
                  │ (initial)│ ─────────────────────────────►  ┌──────────┐
                  └──────────┘                                  │  prêt    │
                       ▲                                        └──────────┘
                       │ conformité = expired/revoked              │   │
                       │ OU champ obligatoire effacé               │   │
                       │                                           ▼   ▼
                       └──────────────────────────────────────────────────────┐
                                                                              │
                                                                              │
                       ┌─────────────────────┐  action admin (FR-023)         │
                       │  masqué_admin       │ ◄──────────────────────────────┤
                       └─────────────────────┘                                │
                                │                                             │
                                │ action admin (rétablir)                     │
                                └──────────────────────────────────────► (retour calcul dérivé)
                                                                              │
                       ┌─────────────────────┐  AnonymiserProfilUseCase       │
                       │  anonymisé          │ ◄──────────────────────────────┘
                       │  (terminal)         │  (orchestré par feature 023)
                       └─────────────────────┘
```

### Stratégie de cohérence du `statut`

**Décision** : le champ `statut` est **toujours persisté** (jamais calculé
à la lecture) pour permettre l'indexation et les requêtes batch (sitemap,
batch `EstProfilPublicPort.filtrerPublics`). Il est **recalculé et écrit
à chaque transition** par les use cases :

- `EditerProfilUseCase` : à chaque save, exécute `calculerStatutProfil`
  et UPDATE `statut` si différent.
- `UploaderPhotoUseCase` : idem post-upload.
- `RetirerPhotoAdminUseCase` : recalcule (typiquement `pret → incomplet`).
- Listener event `ConseillerConformiteChangedEvent` : recalcule à chaque
  transition conformité côté 001.
- Use cases admin de modération : écrivent directement `masque_admin` ou
  `anonymise` (overrides).

**Garantie d'atomicité** : la lecture du statut conformité (`verified`)
+ recalcul + UPDATE se fait dans une seule transaction Postgres
(`SELECT ... FOR UPDATE` sur le profil + `SELECT statut FROM dossiers_conformite`
+ UPDATE) — pas de race condition.

**Garantie de cohérence cross-module** : si la conformité passe
`verified → expired` et l'event listener du module identité tombe (RPO
4 h), le statut profil peut rester transitoirement à `pret` pendant que
la conformité est `expired`. Mitigation : le port public
`EstProfilPublicPort.estPublic` **re-vérifie systématiquement** la
conformité à chaque appel (cf. est-profil-public.port.md) — fail-safe.

### Règles de transition

| Transition | Déclencheur | Effet |
|---|---|---|
| `(absent) → incomplet` | Création de `ConseillerProfile` (listener `ConseillerConformiteChangedEvent` à la 1ère vérification) | Insert row avec `statut = incomplet`. |
| `incomplet → prêt` | `EditerProfilUseCase` / `UploaderPhotoUseCase` après save, **si** `verified` côté conformité ET tous les champs obligatoires présents | UPDATE `statut = pret` + `publishedAt = NOW()` (si NULL) + génération `slug` (si NULL). Event `ProfilConseillerPublishedEvent` → revalidatePath + CloudFront invalidation. Annule relances onboarding planifiées. |
| `prêt → incomplet` | Soit (a) conformité → `expired/revoked` (listener), soit (b) champ obligatoire effacé (use case édition) | UPDATE `statut = incomplet`. Event `ProfilConseillerDepublishedEvent` → revalidatePath + CloudFront. Pas de relance ré-émise. |
| `prêt → masqué_admin` ou `incomplet → masqué_admin` | Action admin (`MasquerProfilAdminUseCase` avec raison) | UPDATE `statut = masque_admin`, `raisonMasquageAdmin = ...`. Insert `ProfilModerationAudit`. Event `ProfilMasqueParAdminEvent` → email FR-024 + revalidatePath + CloudFront. |
| `masqué_admin → (incomplet/prêt)` | Action admin (`RetablirProfilAdminUseCase`) | UPDATE `statut` recalculé via `calculerStatutProfil` (typiquement `incomplet` ou `prêt`). Insert `ProfilModerationAudit`. revalidatePath + CloudFront. |
| `* → anonymisé` | `AnonymiserProfilLoi25UseCase` (orchestré par feature 023) | Toutes les opérations FR-016 (effacement champs PII, suppression S3, set vides énums, slug → `SlugReservation`, statut `anonymise`, `anonymizedAt = NOW()`). Terminal. |

### Invariants

1. **Slug immuable post-publication** : `slug` ne peut être écrit
   qu'**au premier passage en `prêt`** (`publishedAt IS NULL`). Aucun
   UPDATE du slug acceptable par la suite. Trigger Postgres
   `prevent_slug_mutation` :

```sql
CREATE OR REPLACE FUNCTION prevent_slug_mutation_after_publish()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.slug IS NOT NULL AND NEW.slug <> OLD.slug THEN
    RAISE EXCEPTION 'Slug immuable post-publication (profil %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_prevent_slug_mutation
BEFORE UPDATE ON conseiller_profiles
FOR EACH ROW
EXECUTE FUNCTION prevent_slug_mutation_after_publish();
```

2. **`anonymisé` est terminal** : trigger Postgres
   `prevent_unanonymize` :

```sql
CREATE OR REPLACE FUNCTION prevent_unanonymize()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.statut = 'anonymise' AND NEW.statut <> 'anonymise' THEN
    RAISE EXCEPTION 'Statut anonymisé est terminal (profil %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_prevent_unanonymize
BEFORE UPDATE ON conseiller_profiles
FOR EACH ROW
EXECUTE FUNCTION prevent_unanonymize();
```

3. **`SlugReservation` append-only** : trigger Postgres rejette UPDATE
   et DELETE sur `slug_reservations` (pattern 001/002 sur
   `auth_audit_events`).

4. **`ProfilModerationAudit` append-only** : idem (trigger rejette
   UPDATE/DELETE/TRUNCATE).

5. **`raisonMasquageAdmin` cohérence** : check constraint —

```sql
ALTER TABLE conseiller_profiles
  ADD CONSTRAINT chk_raison_masquage_coherence
  CHECK (
    (statut = 'masque_admin' AND raison_masquage_admin IS NOT NULL)
    OR
    (statut <> 'masque_admin' AND raison_masquage_admin IS NULL)
  );
```

---

## Migrations Prisma

Plan de migration (forward-only, expand/contract — Principe Migrations) :

### Migration 1 — `20260527_create_profil_tables.sql`

**Expand** :

- Crée les tables `conseiller_profiles`, `profile_photo_history`,
  `slug_reservations`, `profile_onboarding_reminder_schedules`,
  `profil_moderation_audits`, `profile_specialities`,
  `profile_geo_zones`, `profile_languages`.
- Crée les join tables M-N (`_ProfileSpecialities`, `_ProfileGeoZones`,
  `_ProfileLanguages`).
- Crée les enums `StatutProfil`, `OnboardingRelanceEtape`,
  `OnboardingRelanceEtat`, `ProfilModerationAction`.
- Crée les triggers Postgres (slug immuable, anonymise terminal,
  append-only sur SlugReservation et ProfilModerationAudit).
- Crée les check constraints.
- Crée tous les index spécifiés.

### Migration 2 — `20260527_seed_profil_enums.sql`

**Expand (data)** : seed initial des énumérations :

```sql
INSERT INTO profile_specialities (code, label_fr, ordre) VALUES
  ('croisiere', 'Croisière', 10),
  ('famille', 'Famille', 20),
  ('aventure', 'Aventure', 30),
  ('luxe', 'Luxe', 40),
  ('lune-miel', 'Lune de miel', 50),
  ('safari', 'Safari', 60),
  ('ski', 'Ski', 70),
  ('plage-soleil', 'Plage et soleil', 80),
  ('culturel', 'Voyage culturel', 90),
  ('gastronomique', 'Voyage gastronomique', 100),
  ('aventure-solo', 'Voyage solo', 110),
  ('ecotourisme', 'Écotourisme', 120);

INSERT INTO profile_geo_zones (code, label_fr, ordre) VALUES
  ('canada', 'Canada', 10),
  ('etats-unis', 'États-Unis', 20),
  ('caraibes', 'Caraïbes', 30),
  ('mexique', 'Mexique', 40),
  ('amerique-centrale', 'Amérique centrale', 50),
  ('amerique-sud', 'Amérique du Sud', 60),
  ('europe-ouest', 'Europe de l''Ouest', 70),
  ('europe-est', 'Europe de l''Est', 80),
  ('asie-sud-est', 'Asie du Sud-Est', 90),
  ('asie-orient', 'Extrême-Orient', 100),
  ('afrique-nord', 'Afrique du Nord', 110),
  ('afrique-australe', 'Afrique australe', 120);

INSERT INTO profile_languages (code, label_fr, ordre) VALUES
  ('fr', 'Français', 10),
  ('en', 'Anglais', 20),
  ('es', 'Espagnol', 30),
  ('pt', 'Portugais', 40),
  ('it', 'Italien', 50),
  ('de', 'Allemand', 60);
```

**Note** : ces valeurs sont indicatives. Le porteur projet peut affiner
ou compléter avant la première mise en production. L'évolution
ultérieure se fait par PR éditoriale (nouvelle migration).

### Migration 3 — `20260527_extend_dossier_conformite_with_legal_names.sql`

**Expand côté module conformité** (cf. R9 + plan section V) — si les
champs `prenomLegal` et `nomLegal` ne sont pas déjà présents dans
`DossierConformite` (table existante de 001), les ajouter :

```sql
ALTER TABLE dossiers_conformite
  ADD COLUMN IF NOT EXISTS prenom_legal VARCHAR(80),
  ADD COLUMN IF NOT EXISTS nom_legal VARCHAR(80);

-- Backfill éventuel à coordonner avec l'équipe conformité si des dossiers existent déjà.
```

**À vérifier dans `specs/001-conformite-module/data-model.md` AVANT de
livrer cette migration** — possible que les champs existent déjà sous
un autre nom. Si oui, supprimer cette migration et créer juste le port
`ConformiteNomLegalReader` qui lit le bon nom de colonne.

### Migration de rollback applicatif (Principe Migrations)

Pas de méthode `down` (forward-only). Le rollback applicatif consiste
à `git revert` du code qui utilise les nouvelles tables — les tables
elles-mêmes restent en place mais sont inertes (pas de
`ConseillerProfile.create`). Aucune perte de donnée.

Si une vraie migration de retrait des tables est nécessaire un jour
(ex. décision de retirer la feature), elle se fera par migration
explicite séparée, avec backup vérifié dans les 60 minutes précédentes
(constitution).

---

## Volumétrie attendue (cohérent avec spec section Échelle)

| Table | Volume initial | Croissance |
|---|---|---|
| `conseiller_profiles` | 0 | +50 à +500 année 1, +1000 à +5000 année 3 |
| `profile_photo_history` | 0 | ~5 × nb profils, FIFO, ne dépasse jamais 5/profil |
| `slug_reservations` | 0 | très lent (1 par effacement Loi 25 — exceptionnel) |
| `profile_onboarding_reminder_schedules` | 0 | 3 × nb profils créés (TTL effectif 14j puis archivable) |
| `profil_moderation_audits` | 0 | très lent (modération rare) |
| `profile_specialities/geo_zones/languages` | ~30 lignes seed | +5/an éditorial |

Pas de partitioning requis à cette échelle. Index sur `slug` + statut
suffisent.

---

## Considérations Loi 25 (Principe II — récapitulatif)

| Champ PII | Loi 25 retention | Action effacement |
|---|---|---|
| `biographie`, `titre`, `anneesExperience` | Effaçable à la demande conseiller | `NULL` + `statut = anonymise` |
| `photoS3Key` + `photoHistorique` | Effaçable | `DELETE` objet S3 + `NULL` row |
| `slug` | Conservé (non-PII en soi, mais réservé pour anti-réutilisation SC-007) | Migré vers `SlugReservation` |
| `afficherNomComplet` | Préférence utilisateur | Reset à `false` |
| `specialites`, `langues`, `zonesGeographiques` | Non-PII strictement (références) mais agrégat potentiellement identifiant | Sets vidés |
| `ProfilModerationAudit.adminEmailHash`, `adminAuthUserId` | Audit 7 ans (obligation comptable supplante Loi 25, cf. ADR-0012) | Conservé |
| `publishedAt`, `anonymizedAt`, `createdAt` | Métadonnées techniques | Conservées (audit) |

L'effacement complet d'un `ConseillerProfile` n'est jamais effectué —
le row reste avec `statut = anonymise` pour préserver l'invariant
SC-007 et la traçabilité.

---

## Cohérence avec FR / SC de la spec

| Élément | Couverture |
|---|---|
| FR-001 (champs éditables) | Champs Prisma + énums seed (Migration 2) |
| FR-002 (validation Zod serveur) | DTOs `packages/profil-domain/src/dtos/*.dto.ts` |
| FR-003 (enum statut) | Enum Prisma `StatutProfil` + check constraint + triggers |
| FR-004 (5 photos FIFO) | Table `profile_photo_history`, FIFO appliqué par use case |
| FR-005 (anonymisé non-modifiable) | Trigger `prevent_unanonymize` + guard côté use case |
| FR-006/006a (page publique + nom affiché) | Champs `afficherNomComplet` + lecture nom légal via port |
| FR-007 (404 anti-énumération) | Logique applicative + `not-found.tsx` partagé (Phase 1 contracts) |
| FR-008/008a (CTA suggested) | Pas de stockage DB ; cookie HMAC (cf. R6) |
| FR-009/010 (pédagogique + SSR/SSG) | Côté apps/web (cf. plan) |
| FR-011/012/012a (dashboard) | Côté apps/web (cf. plan) |
| FR-013 (aperçu) | Côté apps/web (cf. plan) |
| FR-014 (≤ 10 s retrait) | Listener event + revalidatePath (R4) |
| FR-015 (slug réservé) | `SlugReservation` + trigger immutable + `genererSlugUnique` |
| FR-016 (anonymisation PII) | `AnonymiserProfilUseCase` + matrice ci-dessus |
| FR-017 (RBAC) | `RoleGuard` + ownership check côté use cases (héritage 002) |
| FR-018 (audit immutable) | Réutilise `auth_audit_events` + nouvelle table `profil_moderation_audits` |
| FR-019 (CGU gate) | Middleware 004 (existant) |
| FR-020 (SEO meta minimal) | Côté apps/web (cf. plan) |
| FR-021 (relances J+3/7/14) | Table `profile_onboarding_reminder_schedules` + worker BullMQ |
| FR-022 (port `estPublic`) | `EstProfilPublicUseCase` (cf. contracts/) |
| FR-023/024 (modération admin) | `profil_moderation_audits` + use cases admin |
| SC-001 (publication ≤ 60s) | revalidatePath + ISR fallback 60s |
| SC-002 (anti-marketplace) | Test invariant `check-no-contact-fields-profile.ts` |
| SC-003 (anti-énumération) | `not-found.tsx` partagé + filtrage application |
| SC-004 (CWV) | SSG ISR + `sharp` dimensions (R3) |
| SC-005 (adoption 80% 30j) | Relances FR-021 + script `scan-profile-adoption.ts` |
| SC-006 (retrait ≤ 10s) | Listener event + revalidatePath (R4) |
| SC-007 (slug Loi 25) | `SlugReservation` + trigger immutable + test invariant |

---

Aucune ambiguïté restante. Modèle prêt pour génération des contracts
et de l'implémentation.
