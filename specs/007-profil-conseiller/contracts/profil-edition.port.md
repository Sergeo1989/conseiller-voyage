# Contract — `ProfilEdition` (édition côté conseiller authentifié)

**Module** : `identite` (extension)
**Couche** : application (use cases + ports)
**Consommateurs** : Server Actions Next.js `apps/web/src/app/(conseiller)/conseiller/profil/`

## Convention de retour : `Result<T, E>` (discriminated union)

Les use cases métier de cette feature retournent un **`Result<T, E>`**
plutôt que de jeter des exceptions pour les erreurs métier (Clean
Architecture + exhaustivité TypeScript). Les exceptions sont réservées
aux erreurs techniques (DB HS, S3 HS, programmer error).

```typescript
// packages/profil-domain/src/result.ts (ou re-export depuis un package shared existant)

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

Les contrôleurs / Server Actions destructurent le résultat et mappent
vers HTTP/UI (200/201/4xx/5xx). Les erreurs E sont **discriminated
unions** typées (cf. `EditerProfilError`, `UploaderPhotoError`
ci-dessous), donc exhaustives à la compilation.

---

## Use cases

### `EditerProfilUseCase`

```typescript
class EditerProfilUseCase {
  async execute(input: EditerProfilInput): Promise<Result<EditerProfilSuccess, EditerProfilError>>;
}

type EditerProfilInput = {
  // Identité de l'éditeur (vérifiée par RoleGuard upstream)
  conseillerId: string;
  authUserId: string;   // doit correspondre au profil édité

  // Champs édités (tous optionnels — édition partielle supportée)
  titre?: string | null;
  biographie?: string | null;
  specialitesCodes?: string[];
  languesCodes?: string[];
  zonesGeographiquesCodes?: string[];
  anneesExperience?: number | null;
  afficherNomComplet?: boolean;
};

type EditerProfilSuccess = {
  profilId: string;
  statut: 'incomplet' | 'pret';
  champsManquants: string[];   // vide si statut = 'pret'
  publishedAt: string | null;  // ISO 8601, défini si premier passage 'pret'
};

// Erreurs métier (discriminated union)
type EditerProfilError =
  | { kind: 'PROFIL_ANONYMISE' }                        // FR-005
  | { kind: 'CGU_OBSOLETES'; versionAttendue: string }  // FR-019
  | { kind: 'VALIDATION_FAILED'; champ: string; messageFr: string }
  | { kind: 'OWNERSHIP_MISMATCH' }
  | { kind: 'CONFORMITE_INDISPONIBLE' };
```

**Validation Zod** (côté domaine, partagée web ↔ api) :

```typescript
const EditerProfilDto = z.object({
  titre: z.string().max(80).nullable().optional(),
  biographie: z.string().min(100).max(2000).nullable().optional(),
  specialitesCodes: z.array(z.string()).min(1).max(8).optional(),
  languesCodes: z.array(z.string()).min(1).max(6).optional(),
  zonesGeographiquesCodes: z.array(z.string()).min(1).max(12).optional(),
  anneesExperience: z.number().int().min(0).max(60).nullable().optional(),
  afficherNomComplet: z.boolean().optional(),
});
```

**Effets de bord** :

1. UPDATE `conseiller_profiles` avec les champs reçus.
2. Si le statut effectif passe `incomplet → prêt` (premier passage) :
   - `publishedAt = NOW()` persisté.
   - `slug` généré via `genererSlugUnique` si non encore défini.
   - Émission de l'event domain `ProfilConseillerPublishedEvent` (déclenche `revalidatePath`).
   - Annulation des relances onboarding planifiées (UPDATE
     `profile_onboarding_reminder_schedules SET etat = annule WHERE etat = planifie AND profileId = ...`).
3. Si le statut effectif passe `prêt → incomplet` (effacement d'un champ
   obligatoire) :
   - Émission de l'event `ProfilConseillerDepublishedEvent` (déclenche `revalidatePath`).
4. Audit dans `auth_audit_events` : `event = 'profil.edite'`,
   `actorAuthUserId`, `metadata` = champs modifiés (sans les valeurs PII
   complètes, juste les clés).

---

### `UploaderPhotoUseCase`

```typescript
class UploaderPhotoUseCase {
  async execute(input: UploaderPhotoInput): Promise<Result<UploaderPhotoSuccess, UploaderPhotoError>>;
}

type UploaderPhotoInput = {
  conseillerId: string;
  authUserId: string;
  fileBuffer: Buffer;
  declaredContentType: string;  // pour comparaison post-validation sharp
};

type UploaderPhotoSuccess = {
  photoS3Key: string;
  photoUrlPublique: string;     // URL CloudFront stable
  photoWidth: number;
  photoHeight: number;
  versionsHistorique: number;   // 1-5
};

// Erreurs métier (discriminated union)
type UploaderPhotoError =
  | { kind: 'FORMAT_NON_SUPPORTE'; formatDetecte: string | null }
  | { kind: 'TAILLE_DEPASSE'; tailleOctets: number; limiteOctets: 5_242_880 }
  | { kind: 'CONTENU_NON_IMAGE' }
  | { kind: 'DIMENSIONS_DEPASSE'; width: number; height: number }
  | { kind: 'PROFIL_ANONYMISE' }
  | { kind: 'OWNERSHIP_MISMATCH' }
  | { kind: 'RATE_LIMIT_DEPASSE'; retryAfterSec: number }
  | { kind: 'STORAGE_HS' };
```

**Rate limiting** : `UploaderPhotoUseCase` applique un bucket Postgres
existant (pattern 002a — `auth_rate_limit_buckets`) avec :

- **Clé** : `profil.photo.upload:<authUserId>`.
- **Plafond** : 10 uploads par heure glissante par conseiller.
- **Justification** : empêche un conseiller de spam-uploader (5 Mo × 100
  = 500 Mo S3 PUT, FIFO eviction épuise S3 DeleteObject quota). 10/h
  laisse une marge d'erreur normale (changement de photo plusieurs fois
  jusqu'à satisfaction).
- **Réponse HTTP** : 429 Too Many Requests + `Retry-After` header.

**Pipeline transactionnel (saga avec compensation)** :

L'écriture S3 et l'UPDATE DB ne peuvent pas être enveloppés dans une
transaction ACID classique (S3 est externe). On applique le pattern
**saga avec compensation** + un job de nettoyage périodique en filet :

1. Validation taille (< 5 Mo).
2. Validation magic number (12 octets — cf. R3, helper
   `detecterFormatImage`).
3. `sharp(buffer).metadata()` → `{width, height, format}` (cf. R3).
4. Vérification cohérence : `format` doit matcher `declaredContentType`.
   Si mismatch (par ex. déclaré `image/jpeg` mais détecté `webp`) →
   normaliser vers la valeur détectée (anti-spoofing).
5. **PRE-INSERT** d'une ligne `profile_photo_history` en statut
   `pending_upload` (statut transitoire ajouté à l'enum, cf.
   data-model.md). Contient la clé S3 cible.
6. Génération clé S3 : `profiles/<conseillerId>/<uuid>.<ext>`.
7. **PUT S3** (`s3.putObject({Bucket, Key, Body, ContentType,
   ServerSideEncryption: 'aws:kms'})`).
8. **Si PUT échoue** : DELETE la ligne `profile_photo_history` pré-insérée.
   Retourner 503.
9. **Si PUT réussit** : transaction Postgres :
   - UPDATE `profile_photo_history` SET statut = 'commit'.
   - UPDATE `conseiller_profiles.photoS3Key, photoWidth, photoHeight,
     photoContentType` ← nouveaux valeurs.
   - INSERT `auth_audit_events` : `event = 'profil.photo.uploadee'`.
10. **Si UPDATE DB échoue après PUT S3 réussi** : compensation —
    `s3.deleteObject` la photo qu'on vient d'écrire (best-effort). Si
    cette delete échoue, on log un warning ; le job de nettoyage
    quotidien (étape 12) la récupérera.
11. **FIFO eviction** : si `count(history WHERE statut = 'commit') > 5`,
    lire les plus anciennes, marquer `evicted_at`, `s3.deleteObject`,
    DELETE row history. Best-effort sur le delete S3 (idempotent).
12. **Job de nettoyage périodique** `cleanup-orphan-photos.worker.ts`
    (BullMQ delayed, exécuté quotidiennement à 03:00 UTC) :
    - Liste les objets S3 dans `profiles/` créés > 1 h.
    - Pour chacun, check si présent en DB (`photo_s3_key` courant OU
      `profile_photo_history.s3Key WHERE statut = 'commit' OR
      (statut = 'pending_upload' AND created_at > now() - 1h)`).
    - Si absent partout → DELETE S3 (orphelin).
    - Audit le nettoyage.
13. Émettre `ProfilConseillerUpdatedEvent` → `revalidatePath` +
    invalidation CloudFront (cf. R4).

**Garanties** :

- Aucune photo S3 référencée jamais accidentellement supprimée (le job
  de nettoyage exclut les photos en `pending_upload` < 1 h pour les
  uploads en cours).
- Au pire, 1 jour de photos orphelines en S3 (négligeable côté coût).
- L'UPDATE de `ConseillerProfile.photoS3Key` et l'INSERT de
  `profile_photo_history` sont dans la même transaction Postgres (donc
  ACID), ce qui élimine le risque de divergence interne DB.

---

### `LireProfilPriveUseCase`

```typescript
class LireProfilPriveUseCase {
  async execute(input: { authUserId: string }): Promise<ProfilPrivePayload>;
}

type ProfilPrivePayload = {
  // Source de vérité pour l'UI d'édition + dashboard
  profilId: string;
  authUserId: string;

  titre: string | null;
  biographie: string | null;
  specialites: { code: string; label: string }[];
  langues: { code: string; label: string }[];
  zonesGeographiques: { code: string; label: string }[];
  anneesExperience: number | null;

  photoUrlPublique: string | null;  // URL CloudFront stable (OAC), NULL si pas de photo (cf. R2)

  afficherNomComplet: boolean;
  nomAffiche: string;             // déjà formaté selon afficherNomComplet
  nomLegalComplet: string;        // toujours retourné (le conseiller voit son propre nom complet)

  slug: string | null;            // NULL si jamais passé 'prêt'

  statut: 'incomplet' | 'pret' | 'masque_admin';  // 'anonymise' impossible ici (RoleGuard refuse l'accès)
  raisonMasquageAdmin: string | null;

  // Méta
  publishedAt: string | null;
  updatedAt: string;

  // Conformité (lecture publique)
  statutConformite: 'verified' | 'pending' | 'expired' | 'revoked';
  certifications: CertificationPublique[];
  champsManquants: string[];      // pour FR-012a

  // Onboarding relances (pour info dashboard)
  prochaineRelance: { etape: 'j3' | 'j7' | 'j14'; planifieePour: string } | null;
};
```

Pas d'effet de bord, lecture pure.

---

### `PrevisualiserProfilUseCase`

```typescript
class PrevisualiserProfilUseCase {
  async execute(input: { authUserId: string }): Promise<ProfilPreviewPayload>;
}

type ProfilPreviewPayload = {
  // Identique à ProfilPublicPayload + bandeau
  payloadPublic: ProfilPublicPayload;
  bandeauApercu: null | {
    type: 'profil_incomplet' | 'non_verifie' | 'masque_admin';
    elementsManquants: string[];   // pour profil_incomplet
    raisonMasquage: string | null;  // pour masque_admin
  };
};
```

Si le profil n'est pas en état d'être publié, retourne tout de même un
payload (différent du flux public qui renverrait null), avec
`bandeauApercu` non-nul indiquant pourquoi.

---

## Tests d'acceptation (mapping FR/US)

| Test | FR couvert |
|---|---|
| Conseiller édite biographie 100 chars → status `prêt` | FR-001, FR-003 |
| Conseiller efface biographie → status `incomplet` | FR-003 |
| Conseiller upload photo 6 Mo → erreur `TAILLE_DEPASSE` | FR-001 |
| Conseiller upload `.exe` renommé `.jpg` → erreur `CONTENU_NON_IMAGE` | Principe IX |
| Conseiller upload 6e photo → 5e plus ancienne supprimée S3 | FR-004 |
| Conseiller anonymisé tente édition → erreur `PROFIL_ANONYMISE` + audit | FR-005 |
| Conseiller tente édition d'un autre profil → erreur `OWNERSHIP_MISMATCH` | FR-017 |
| Première transition `incomplet → prêt` → slug généré + `publishedAt` set | FR-015, SC-001 |
| Première transition `incomplet → prêt` → relances onboarding annulées | FR-021 |
| Aperçu profil `verified` + `prêt` → pas de bandeau | FR-013 |
| Aperçu profil `verified` + `incomplet` → bandeau jaune avec champs manquants | FR-013 |
