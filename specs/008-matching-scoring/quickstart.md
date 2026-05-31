# Quickstart — Matching scoring

**Phase** : 1 (Design)
**Branch** : `008-matching-scoring`
**Date** : 2026-05-31

Procédure end-to-end pour valider l'implémentation 011 en local + staging. À exécuter une fois la Phase 8 d'implémentation terminée (avant ouverture de la PR).

## Prérequis

```sh
# Stack locale up
pnpm docker:up          # Postgres + Redis + LocalStack SES
pnpm db:migrate         # applique les 3 nouvelles migrations matching
pnpm db:generate        # régénère Prisma Client

# Tests verts en local
pnpm test:unit          # ≥ 400 tests (360 existants + ~50 nouveaux pour matching)
pnpm typecheck          # 17 packages OK
pnpm lint               # 759 fichiers OK
```

## Scénario 1 — Golden path (US1, P1)

**Objectif** : un brief activé déclenche un MatchingResult avec exactement 3 entries, et un event `voyageur.brief.matched` est publié en outbox.

### 1.1 Seed minimum

```sh
# Crée 10 conseillers vérifiés couvrant Cuba + FR
pnpm db:seed:matching-fixtures
```

Crée :
- 10 `ConseillerProfile` avec statut `pret` + adresses montréalaises (FSA H1A à H9Z).
- 10 `ConformiteCompliance` au statut `verified`.
- Specialities variées : `lune_de_miel`, `aventure`, `culture`.
- Destinations déclarées incluant Cuba, Italie, Japon.

### 1.2 Brief test

```sh
# Soumet un brief Cuba + FR via API (pattern 008 quickstart)
curl -X POST http://localhost:3001/api/intake/briefs \
  -H "Content-Type: application/json" \
  -H "x-requested-by: web" \
  -d '{
    "destinations": [{"country":"CU","region":"La Havane"}],
    "departureDate": "2027-03-15",
    "returnDate": "2027-03-30",
    "datesFlexible": true,
    "datesFlexibilityDays": 5,
    "adultsCount": 2,
    "childrenAges": [],
    "infantsCount": 0,
    "budgetRange": "between_5k_10k",
    "conseillerLanguage": "fr",
    "speciality": "lune_de_miel",
    "familiarity": "experimented_traveler",
    "contact": {
      "email": "marie.dupont@example.com",
      "firstName": "Marie",
      "lastName": "Dupont",
      "postalCode": "H7N 1A1"
    },
    "consentGiven": true
  }'

# Récupère le briefId + token magic link de la mailbox LocalStack SES
# Active le brief en consommant le magic link
curl -X POST http://localhost:3001/api/intake/briefs/verify \
  -H "Content-Type: application/json" \
  -d '{"token":"...le token clear extrait de SES..."}'
```

### 1.3 Observation

Dans les 2 secondes (SLO SC-001) :

```sql
-- 1 MatchingResult créé
SELECT id, status, "matchedCount", "computedAt"
FROM matching_results
WHERE "briefId" = '<le briefId>'
  AND "supersededAt" IS NULL;
-- → status='ok', matchedCount=3

-- 3 entries triées par score décroissant
SELECT position, "conseillerId", "scoreBrut", "scoreFinal", boosted
FROM matching_result_entries
WHERE "matchingResultId" = '<le MR id>'
ORDER BY position;
-- → 3 lignes (position 1, 2, 3), scoreFinal décroissant

-- 1 event outbox prêt à publier
SELECT id, "eventType", "publishedAt"
FROM matching_outbox_entries
WHERE payload->>'briefId' = '<le briefId>';
-- → eventType='voyageur_brief_matched', publishedAt=NULL (puis NOT NULL après que le worker 003 extension passe)

-- Audit
SELECT "eventType", payload
FROM matching_audit_entries
WHERE "briefId" = '<le briefId>'
ORDER BY "occurredAt";
-- → matching.computed avec payload {candidatesCount, verifiedCount, durationMs, ...}
```

### 1.4 Critères de succès

- [x] `status=ok` et `matchedCount=3`
- [x] 3 conseillers tous au statut `verified` (joindre `conformite_compliances`)
- [x] Tous parlent `fr` (filtre dur Q3)
- [x] Tous couvrent Cuba (axe destination > 0)
- [x] Distance FSA H7N → leurs FSAs calculée (axe geo > 0)
- [x] Specialty `lune_de_miel` favorisée
- [x] `algorithmVersion = 'v1.0'`
- [x] Métrique OTel `matching.duration_ms` p95 < 800 ms

---

## Scénario 2 — Boost cookie `cv_suggested` (US2, P2)

**Objectif** : un brief avec cookie `cv_suggested` HMAC valide promeut un conseiller initialement 4e en top 3.

### 2.1 Setup

Reprend le seed de 1.1, MAIS modifie un conseiller B pour qu'il soit classé 4e en brut (ex. il couvre Cuba mais en `aventure` plutôt que `lune_de_miel` → spécialité 0,5 au lieu de 1,0). Sans boost, il finit position 4.

### 2.2 Soumet le brief AVEC le cookie cv_suggested

```sh
# Le cookie cv_suggested doit être posé par 007 — simulation via outil :
node tools/generate-cv-suggested-cookie.ts --conseillerId=<B-id> --secret=$PROFIL_SUGGESTED_COOKIE_SECRET

# Soumettre le brief avec ce cookie dans Cookie header
curl -X POST http://localhost:3001/api/intake/briefs \
  -H "Content-Type: application/json" \
  -H "Cookie: cv_suggested=<HMAC token>" \
  -d '{...même payload qu'en 1.2...}'
```

### 2.3 Observation

```sql
SELECT "suggestedConseillerId", "boostApplied", status, "matchedCount"
FROM matching_results
WHERE "briefId" = '<briefId>';
-- → suggestedConseillerId=<B-id>, boostApplied=true

SELECT position, "conseillerId", "scoreBrut", "scoreFinal", boosted
FROM matching_result_entries
WHERE "matchingResultId" = '<MR id>'
ORDER BY position;
-- → B doit être dans le top 3 (position 1, 2 ou 3)
-- → B doit avoir boosted=true et scoreFinal > scoreBrut
-- → scoreFinal_B <= scoreBrut_B * 1.10 (invariant SC-004)
```

### 2.4 Critères de succès

- [x] `suggestedConseillerId` = B-id en DB
- [x] `boostApplied = true`
- [x] B apparaît dans le top 3 (alors qu'il était 4e en brut)
- [x] `scoreFinal_B = scoreBrut_B × 1.10` à 10⁻⁶ près
- [x] Audit event `matching.computed` payload mentionne `boostApplied: true`

---

## Scénario 3 — Mode dégradé : 0 conseiller éligible (US1 AS4)

**Objectif** : un brief avec destination ultra-niche → 0 conseiller, event `unmatched` émis.

### 3.1 Setup

Brief avec `destinations: [{"country":"BT","region":"Thimphou"}]` (Bhoutan) — aucun conseiller dans le seed ne couvre.

### 3.2 Observation

```sql
SELECT status, "matchedCount" FROM matching_results WHERE "briefId" = '...';
-- → status='empty', matchedCount=0

SELECT "eventType", payload->>'reason' FROM matching_outbox_entries WHERE payload->>'briefId' = '...';
-- → voyageur_brief_unmatched, reason='no_conseiller_covers_destination' (ou multiple_factors)
```

### 3.3 Critères de succès

- [x] MR persisté avec `status=empty`
- [x] 0 entry dans `matching_result_entries`
- [x] Event `voyageur.brief.unmatched` en outbox
- [x] Audit event `matching.empty`
- [x] Pas de crash, pas d'exception remontée à l'event consumer (le brief reste actif côté 008)

---

## Scénario 4 — Idempotence (replay event)

**Objectif** : ré-envoyer le même event `voyageur.brief.activated` 5 fois ne crée pas 5 MR.

### 4.1 Simulation

```sh
# Force le worker à reconsommer l'event (BullMQ retry manuel)
node tools/replay-bullmq-job.ts --queue=matching --jobId=<jobId> --times=5
```

### 4.2 Observation

```sql
SELECT COUNT(*) FROM matching_results
WHERE "briefId" = '<briefId>' AND "supersededAt" IS NULL;
-- → 1 (jamais 5)

SELECT COUNT(*) FROM matching_audit_entries
WHERE "briefId" = '<briefId>' AND "eventType" = 'matching_replay_ignored';
-- → 4 (les 4 replays ignorés tracés)
```

### 4.3 Critères de succès

- [x] Toujours 1 seul MR actif par briefId
- [x] 4 audit entries `matching_replay_ignored` (ou détection idempotency-key)
- [x] Aucune publication outbox dupliquée (contrainte UNIQUE sur idempotency_key)

---

## Scénario 5 — Re-matching admin (US3, P3 + FR-016)

**Objectif** : un admin déclenche un re-matching après révocation manuelle d'un conseiller.

### 5.1 Setup

Reprend MR du scénario 1 (status=ok, 3 entries [A, B, C]). Révoque A, B, C via feature 001 :

```sh
# Pour chaque conseiller
curl -X POST http://localhost:3001/api/conformite/admin/conseillers/<id>/revoke \
  -H "Cookie: __Host-cv.session.token=<admin session>" \
  -d '{"reason":"Test révocation cascade", "effectiveDate":"2026-05-31T13:00:00Z"}'
```

### 5.2 Attendre le scheduler

Le `DetectAllMatchesRevokedScheduler` tourne en daily cron (à override en `*/10 * * * *` en dev pour tester rapidement).

```sql
SELECT "eventType" FROM matching_outbox_entries WHERE payload->>'briefId' = '<briefId>';
-- → voyageur_brief_all_matches_revoked
```

### 5.3 Admin re-trigger

```sh
curl -X POST http://localhost:3001/api/matching/admin/briefs/<briefId>/re-match \
  -H "Content-Type: application/json" \
  -H "Cookie: __Host-cv.session.token=<admin session>" \
  -H "Idempotency-Key: 4f3a2b1c-1234-4abc-9def-000000000001" \
  -d '{"reason":"Test re-matching post-révocation cascade"}'
```

### 5.4 Observation

```sql
-- Ancien MR superseded
SELECT id, "supersededAt", "supersededByMatchingResultId" FROM matching_results
WHERE "briefId" = '<briefId>'
ORDER BY "createdAt";
-- → 2 lignes : 1 superseded (avec supersededByMatchingResultId pointant vers la 2e), 1 active

-- Audit
SELECT "eventType" FROM matching_audit_entries
WHERE "briefId" = '<briefId>'
ORDER BY "occurredAt";
-- → matching.computed (initial), matching.all_matches_revoked_detected, matching.recomputed
```

### 5.5 Critères de succès

- [x] Ancien MR a `supersededAt` non-null + `supersededByMatchingResultId` pointant vers le nouveau
- [x] Nouveau MR créé avec `algorithmVersion` identique (sauf si bump entre-temps)
- [x] Nouveau status selon disponibilité de nouveaux conseillers : `partial`/`empty` si aucun autre conseiller couvre Cuba+FR, `ok` si nouveaux conseillers ont été ajoutés entre-temps
- [x] Endpoint admin retourne 200 OK avec `newMatchingResultId` + `previousMatchingResultId`

---

## Scénario 6 — Anonymisation cascade Loi 25

**Objectif** : effacement Loi 25 du brief (feature 008 FR-022) propage au MR.

### 6.1 Trigger

```sh
# Effacement brief seul via API 008 (cookie session voyageur)
curl -X POST http://localhost:3001/api/intake/briefs/<briefId>/erasure-request \
  -H "Content-Type: application/json" \
  -H "Cookie: __Host-cv.intake.token=<voyageur session>" \
  -d '{"confirmation":"JE_CONFIRME_LA_SUPPRESSION_IRREVERSIBLE"}'
```

### 6.2 Observation

```sql
-- briefId et suggestedConseillerId null-és sur le MR (trigger cascade ADR-0023)
SELECT "briefId", "suggestedConseillerId" FROM matching_results
WHERE id = '<MR id>';
-- → briefId=NULL, suggestedConseillerId=NULL

-- scoreComponents redacted
SELECT "scoreComponents" FROM matching_result_entries
WHERE "matchingResultId" = '<MR id>';
-- → {"redacted":"loi25"} pour chaque entry

-- audit Loi 25 préservé
SELECT * FROM matching_audit_entries
WHERE "matchingResultId" = '<MR id>';
-- → toujours présent (audit append-only 7 ans)
```

### 6.3 Critères de succès

- [x] `briefId` et `suggestedConseillerId` à NULL sur le MR
- [x] `scoreComponents` redacted dans toutes les entries
- [x] `MatchingQueryPort.getByBriefIdForVoyageur(briefId)` retourne `null` (le briefId est introuvable post-anonymisation — c'est attendu, le voyageur n'a plus accès à ses données)
- [x] L'audit historique reste consultable par l'admin (`matching_audit_entries` intact)
- [x] Latence cascade < 60 s (Loi 25 exigence)

---

## Récap matrice scénarios × FR

| Scénario | FR couverts | Tests automatisés |
|---|---|---|
| 1 — Golden path | FR-001, FR-002, FR-003, FR-005, FR-006, FR-008, FR-019 + SC-001 | `perform-matching.integration.test.ts` |
| 2 — Boost cookie | FR-010, FR-011, FR-012, FR-013 + SC-004 | `boost-application.test.ts` (unit) + `boost.integration.test.ts` |
| 3 — Empty | FR-014, US1 AS4 + SC-007 | `unmatched-outbox.integration.test.ts` |
| 4 — Idempotence | FR-004 + SC-006 | `idempotence.integration.test.ts` |
| 5 — Re-matching admin | FR-016, FR-019, FR-020 + Q4 clarify | `trigger-rematch.integration.test.ts` |
| 6 — Anonymisation cascade | FR-020 + Loi 25 assumption | `anonymisation-cascade.integration.test.ts` |

Toute la matrice doit passer **vert en CI** avant ouverture de la PR (DoD).

---

## Smoke check final pré-PR

```sh
pnpm test:unit                              # tous verts (~400+)
pnpm test:integration -- matching           # tous verts (6 fichiers nouveaux)
pnpm lint                                   # zéro erreur
pnpm typecheck                              # 17 packages OK
pnpm --filter @cv/api test:property         # tests de propriété SC-002/003/004/005
```

Et au moins **un smoke manuel** scénario 1 en staging avant ouverture PR.
