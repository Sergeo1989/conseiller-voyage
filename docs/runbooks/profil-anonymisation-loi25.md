# Runbook — Anonymisation Loi 25 du profil conseiller

**Feature** : 007 (US5 — FR-016, SC-007)
**Audience** : équipe orchestrateur Loi 25 (feature 023 future) +
ingénieurs de conformité.

## Quand l'utiliser

L'orchestrateur 023 (effacement Loi 25 cross-module) déclenche
l'anonymisation côté profil après réception d'une demande utilisateur
authentifiée. Ce runbook décrit l'appel manuel pour audit ou
diagnostic.

## Endpoint

```
POST /api/internal/profil/:id/anonymiser-loi25
Headers : X-Internal-Service-Token: <CV_REVALIDATE_SECRET>
Body    : { "orchestrateurReference": "<id>" }
```

Réponse : `200 { status: 'ok' }` (idempotent — re-appel sur profil déjà
anonymisé = no-op silencieux).

## Effets

1. **Suppression S3** (best-effort) :
    - Photo courante (`photoS3Key`)
    - Toutes les photos historique non-évincées (FIFO)
    - `DeleteObject` parallèles, log warning sur échec individuel
2. **Transaction Postgres** :
    - `anonymize()` : NULL biographie/titre/anneesExperience/photo*,
      sets vides spécialités/langues/zones, `afficherNomComplet = false`,
      statut `anonymise` (irréversible — trigger Postgres
      `prevent_profil_unanonymize`), `anonymizedAt = NOW()`.
    - `SlugReservation.reserve(slug, raison='loi25',
      conseillerIdOrigine=null)` — append-only, ADR-0015.
3. **Annulation relances onboarding** (BullMQ remove jobs).
4. **Audit immutable** dans `auth_audit_events`.
5. **Invalidations cache** (Next.js ISR + CloudFront + sitemap.xml).

## Garanties

- **Idempotent** : ré-appel = no-op (check `statut === 'anonymise'`).
- **Slug réservé à vie** : SC-007 — aucun nouveau conseiller homonyme
  ne pourra réutiliser ce slug. Le check passe par
  `genererSlugUnique(prenom, nom, { slugReserve })`.
- **Trigger Postgres** `prevent_profil_unanonymize` bloque toute
  tentative de retour en arrière du statut `anonymise`.
- **`conseillerIdOrigine = NULL`** dans SlugReservation (ADR-0015) —
  aucun chemin technique vers l'`AuthUser` original via le slug.

## Modes dégradés

- **S3 HS** : les DELETE échouent, log warning. Le worker
  `CleanupOrphanPhotos` rattrape les orphelins quotidiennement.
- **CloudFront HS** : les invalidations échouent, filet `s-maxage=300`
  borne la fenêtre dégradée à 5 min.
- **Next.js revalidatePath HS** : idem, filet ISR `revalidate=300`.

## Vérification post-exécution

```sql
-- Le profil est en statut terminal
SELECT statut, anonymizedAt, photoS3Key, biographie
  FROM "profile_conseiller_profiles"
  WHERE id = '<profilId>';
-- Attendu : statut=anonymise, anonymizedAt=<timestamp>, le reste NULL

-- Le slug est réservé
SELECT slug, raison, "conseillerIdOrigine"
  FROM "profile_slug_reservations"
  WHERE slug = '<slug>';
-- Attendu : raison='loi25', conseillerIdOrigine=NULL

-- Audit créé
SELECT eventType, metadata->>'action', metadata->>'orchestrateurReference'
  FROM auth_audit_events
  WHERE targetUserId = '<authUserId>'
    AND metadata->>'action' = 'profil.anonymise.loi25'
  ORDER BY occurredAt DESC LIMIT 1;
```

## Test invariant SC-007 (Phase 11)

Suite Vitest à venir (T127) — vérifie qu'après anonymisation d'un
conseiller `Marie Dupont`, la re-création d'un conseiller homonyme
produit un slug `marie-dupont-2` (jamais le slug réservé).

## Références

- `specs/007-profil-conseiller/spec.md` — FR-016, SC-007
- `specs/007-profil-conseiller/data-model.md` — triggers Postgres
- ADR-0015 — analyse Loi 25 du slug réservé
- ADR-0012 — pattern audit no-FK Loi 25 (référence)
