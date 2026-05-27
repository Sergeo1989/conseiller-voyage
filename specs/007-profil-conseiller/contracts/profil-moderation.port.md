# Contract — `ProfilModeration` (actions admin)

**Module** : `identite` (extension)
**Couche** : application
**Consommateurs** : pages admin Next.js `apps/web/src/app/(admin)/admin/profils/`,
intégrées dans la console conformité existante (feature 001).

---

## Use cases

### `RetirerPhotoAdminUseCase`

```typescript
class RetirerPhotoAdminUseCase {
  async execute(input: RetirerPhotoAdminInput): Promise<RetirerPhotoAdminResult>;
}

type RetirerPhotoAdminInput = {
  adminAuthUserId: string;   // vérifié RoleGuard admin
  conseillerProfileId: string;
  raison: string;            // FR-023 : obligatoire, min 10 chars
};

type RetirerPhotoAdminResult = {
  photoSupprimees: number;   // photo courante + historique (1 + N FIFO)
};
```

**Effets** :

1. Lire `conseillerProfileId` ; échouer si introuvable.
2. Si `statut === 'anonymise'` → erreur (rien à modérer).
3. Lire toutes les `profile_photo_history` du profil + `photoS3Key` courante.
4. Pour chaque clé S3, `s3.deleteObject` (synchrone, ne tolère pas
   d'incohérence).
5. UPDATE `conseiller_profiles SET photoS3Key = NULL, photoWidth = NULL,
   photoHeight = NULL, photoContentType = NULL`.
6. DELETE rows `profile_photo_history`.
7. **Recalcul du statut** : sans photo, le profil bascule en `incomplet`
   (photo est un champ obligatoire — FR-001).
8. INSERT `profil_moderation_audits` avec `action = 'retrait_photo'`,
   `raison`, `adminEmailHash`, `metadonneesJson` = nb photos supprimées.
9. INSERT `auth_audit_events` (redondance contrôlée — audit générique +
   audit modération profil).
10. Émettre `ProfilConseillerDepublishedEvent` → `revalidatePath` (le
    profil passe `prêt → incomplet`, la page publique retombe en 404).
11. Émettre `ProfilModereParAdminEvent` → écrit en outbox courriel
    pour notifier le conseiller (FR-024 — courriel "Votre photo a été
    retirée. Raison : …").

---

### `MasquerProfilAdminUseCase`

```typescript
class MasquerProfilAdminUseCase {
  async execute(input: MasquerProfilAdminInput): Promise<MasquerProfilAdminResult>;
}

type MasquerProfilAdminInput = {
  adminAuthUserId: string;
  conseillerProfileId: string;
  raison: string;            // FR-023 : obligatoire
};

type MasquerProfilAdminResult = {
  statutPrecedent: 'incomplet' | 'pret';
  publishedAtConserve: string | null;   // pour rétablissement futur
};
```

**Effets** :

1. Lire profil ; échouer si `anonymise`.
2. UPDATE `conseiller_profiles SET statut = 'masque_admin',
   raisonMasquageAdmin = <raison>`.
3. INSERT `profil_moderation_audits` avec `action = 'masquage'` + raison.
4. INSERT `auth_audit_events`.
5. Émettre `ProfilMasqueParAdminEvent` → `revalidatePath` (page publique
   passe 404) + outbox courriel FR-024.

**Note** : le statut précédent (`incomplet` ou `prêt`) n'est PAS
persisté. Le retour à un statut calculé se fait à `rétablir`.

---

### `RetablirProfilAdminUseCase`

```typescript
class RetablirProfilAdminUseCase {
  async execute(input: RetablirProfilAdminInput): Promise<RetablirProfilAdminResult>;
}

type RetablirProfilAdminInput = {
  adminAuthUserId: string;
  conseillerProfileId: string;
  raison: string;            // optionnelle pour rétablissement mais recommandée
};

type RetablirProfilAdminResult = {
  nouveauStatutEffectif: 'incomplet' | 'pret';
};
```

**Effets** :

1. Lire profil ; échouer si pas en `masque_admin`.
2. UPDATE `conseiller_profiles SET statut = 'incomplet',
   raisonMasquageAdmin = NULL`.
   (Le calcul dérivé déterminera si on remonte automatiquement à `prêt`
   selon `profilEstComplet` + conformité.)
3. INSERT `profil_moderation_audits` avec `action = 'retablissement'` +
   raison (facultative).
4. INSERT `auth_audit_events`.
5. Émettre `ProfilConseillerUpdatedEvent` → `revalidatePath`.
6. **Pas de courriel automatique au rétablissement** (cf. spec FR-024 qui
   ne mentionne que la notification de masquage). Le conseiller peut le
   voir dans son dashboard via le widget profil.

---

### `AnonymiserProfilLoi25UseCase`

```typescript
class AnonymiserProfilLoi25UseCase {
  // Consommé exclusivement par l'orchestrateur Loi 25 (feature 023 future)
  async execute(input: AnonymiserInput): Promise<void>;
}

type AnonymiserInput = {
  conseillerProfileId: string;
  orchestrateurReference: string;  // ID de la demande d'effacement (audit cross-module)
};
```

**Effets** (FR-016) :

1. Lire profil ; idempotent si déjà `anonymise`.
2. Supprimer S3 : `photoS3Key` courante + toutes les
   `profile_photo_history.s3Key`.
3. DELETE `profile_photo_history` rows.
4. UPDATE `conseiller_profiles` :
   - `titre = NULL`
   - `biographie = NULL`
   - `anneesExperience = NULL`
   - `photoS3Key, photoWidth, photoHeight, photoContentType = NULL`
   - `afficherNomComplet = false`
   - `statut = 'anonymise'`
   - `anonymizedAt = NOW()`
5. DELETE des associations M-N (`_ProfileSpecialities`, `_ProfileLanguages`,
   `_ProfileGeoZones`).
6. INSERT `slug_reservations` avec le slug actuel (FR-015) — append-only.
   `conseillerIdOrigine = NULL` (analyse Loi 25 — cf. ADR-0015 plan).
7. UPDATE `profile_onboarding_reminder_schedules SET etat = 'annule' WHERE etat = 'planifie'`.
8. INSERT `auth_audit_events` : `event = 'profil.anonymise.loi25'`,
   `metadata = { orchestrateurReference }`.
9. Émettre `ProfilAnonymiseLoi25Event` → `revalidatePath` (page 404
   définitive) + `revalidatePath('/sitemap.xml')`.

**Garanties** :

- Idempotent (re-appel = no-op après le premier).
- Trigger Postgres `prevent_unanonymize` empêche tout retour en arrière.
- Audit conservé (rétention 7 ans).

---

## Tests d'acceptation (mapping US6)

| Test | US6 scenario / FR |
|---|---|
| Admin retire photo → S3 vidé + statut `incomplet` + 404 page publique + audit + courriel | US6.1, FR-023, FR-024 |
| Admin masque profil → statut `masque_admin` + 404 + audit + courriel | US6.2, FR-023, FR-024 |
| Admin rétablit profil masqué → statut `incomplet` ou `prêt` selon calcul | US6.3, FR-023 |
| Admin tente action sans raison → erreur `VALIDATION_FAILED` | US6.4 |
| Admin tente action sur profil anonymisé → erreur `PROFIL_ANONYMISE` | FR-005 + FR-016 |
| Anonymisation Loi 25 → effacement complet PII + slug réservé + statut terminal | FR-016, SC-007 |
