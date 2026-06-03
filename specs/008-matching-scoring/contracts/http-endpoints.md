# Contract — HTTP Endpoints (Admin)

**Module** : `matching`
**Surface** : minimale en 011 — un seul endpoint admin pour re-trigger manuel (FR-016, Q4 clarify).

Les endpoints voyageur de lecture (`GET /api/matching/voyageur/briefs/:briefId`) seront ajoutés en **feature 015** (espace voyageur post-intake). Ils ne sont pas livrés dans 011 pour ne pas pré-empter le scope de 015.

---

## 1. `POST /api/matching/admin/briefs/:briefId/re-match`

**Auth** : `AuthGuard` (Auth.js v5 session DB, ADR-0004) + `RoleGuard` + `@RequireRole('admin')`.
**Pattern hérité** : extension US5 du dashboard admin de feature 008 (`apps/web/src/app/[locale]/(admin)/admin/intake/*`).
**Idempotency-Key** : header obligatoire (UUID v4) — protège contre double-clic admin.

### Request

```
POST /api/matching/admin/briefs/:briefId/re-match HTTP/1.1
Content-Type: application/json
Idempotency-Key: 4f3a2b1c-...
Cookie: __Host-cv.session.token=...

{
  "reason": "Conseiller principal révoqué hier suite à expiration permis TICO, re-matching demandé par support"
}
```

| Champ | Type | Validation Zod |
|---|---|---|
| `briefId` (path param) | UUID v4 | regex strict |
| `reason` (body) | string | min 10, max 500 chars |

### Responses

**200 OK** — re-matching effectué, nouveau MR créé.

```json
{
  "newMatchingResultId": "uuid",
  "previousMatchingResultId": "uuid",
  "status": "ok" | "partial" | "empty",
  "matchedCount": 0 | 1 | 2 | 3,
  "computedAt": "2026-05-31T13:42:00.000Z"
}
```

**202 Accepted** — re-matching enqueued (si calcul async > 1 s, ce qui ne devrait pas arriver mais protégé pour les bursts).

```json
{
  "status": "queued",
  "estimatedCompletionSeconds": 5
}
```

**400 Bad Request** — payload invalide.

```json
{
  "message": "Validation failed",
  "errors": [{ "path": "reason", "message": "Must be at least 10 characters" }]
}
```

**401 Unauthorized** — session admin absente.
**403 Forbidden** — utilisateur authentifié mais rôle non admin.
**404 Not Found** — `briefId` inexistant ou brief anonymisé Loi 25.
**409 Conflict** — un re-matching est déjà en cours pour ce briefId (verrou Redis SETNX actif depuis < 30 s).

```json
{
  "code": "RE_MATCH_IN_PROGRESS",
  "message": "Un re-matching est déjà en cours pour ce brief, réessayez dans quelques secondes."
}
```

**422 Unprocessable Entity** — brief dans un état incompatible avec re-matching (ex. status `pending_verification`, jamais activé).

```json
{
  "code": "BRIEF_NOT_ACTIVE",
  "message": "Le brief n'a pas été activé. Le re-matching n'est possible que sur un brief actif."
}
```

**500 Internal Server Error** — erreur infrastructure (DB injoignable, etc.).

### Side effects

1. **Verrou Redis** SETNX `matching:rematch:${briefId}` TTL 30 s — empêche double-trigger.
2. **Append `matching_audit_entries`** event `matching.recomputed` avec payload `{adminUserId, reason, previousMatchingResultId}`.
3. **Marque l'ancien `MatchingResult.supersededAt = now()`** + `supersededByMatchingResultId = newId` dans la même transaction que la création du nouveau MR.
4. **Émet l'event outbox approprié** selon le nouveau statut (`voyageur.brief.matched`, `partially_matched`, ou `unmatched`).
5. **Réveille feature 012** (notifications conseillers) si nouveau matched_count > 0.

### Constitution Check pour cet endpoint

| Principe | Application |
|---|---|
| I | Filtre verified intact (jamais d'exposition de non-verified au voyageur après le re-match). |
| II | Pas de PII voyageur dans le payload, audit sans PII. |
| III | Plafond 3 respecté (invariant SC-003). |
| IV | Messages d'erreur en FR-CA via i18n namespace `matching.admin.*`. |
| VI | Use case `TriggerRematchUseCase` testé TDD strict, fonction pure de scoring inchangée. |
| IX | RBAC admin enforce niveau cas d'usage, Zod validation, idempotency key, CSRF couvert par middleware global. |
| X | Idempotence stricte via verrou Redis 30 s + idempotency-key header, latence < 800 ms cible. |

---

## 2. (Futur 015) `GET /api/matching/voyageur/briefs/:briefId`

**Hors scope 011**. Documenté ici pour préparer l'interface stable.

**Auth** : `IntakeAuthGuard` (cookie session voyageur, pattern hérité de 008 US2).
**Filtrage** : appelle `MatchingQueryPort.getByBriefIdForVoyageur` (cf. `matching-query.port.md`) — exclut dynamiquement les conseillers non-verified au moment de la lecture.

### Response shape envisagée

```json
{
  "briefId": "uuid",
  "status": "ok" | "partial" | "empty",
  "matchedCount": 0 | 1 | 2 | 3,
  "entries": [
    {
      "position": 1,
      "conseillerId": "uuid",
      "conseiller": {
        "displayName": "...",
        "slug": "...",
        "specialities": [...],
        "destinations": [...]
      }
    }
  ],
  "computedAt": "2026-05-31T..."
}
```

L'enrichissement avec `conseiller.displayName / slug / etc.` (jointure côté Server Component avec feature 007) sera ajouté par feature 015. 011 fournit uniquement le port + le `MatchingResult` brut.
