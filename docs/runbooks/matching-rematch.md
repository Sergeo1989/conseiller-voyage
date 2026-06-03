# Runbook — Re-matching admin manuel

**Feature** : 011 matching scoring (branche `008-matching-scoring`)
**Cf.** [FR-016](../../specs/008-matching-scoring/spec.md), [contracts/http-endpoints.md](../../specs/008-matching-scoring/contracts/http-endpoints.md), [ADR-0023](../adr/0023-matching-anonymisation-cascade.md)
**Tâche** : T089

## Pourquoi

Quand les **3 conseillers** d'un `MatchingResult` actif sont tous révoqués
(permis CCV/TICO suspendu, dossier conformité expiré, effacement Loi 25),
le voyageur se retrouve avec une liste vide de conseillers joignables.

Le scheduler `DetectAllMatchesRevokedScheduler` (cron quotidien 02:00
ca-central-1) détecte ce cas et publie l'événement outbox
`voyageur.brief.all_matches_revoked` + audit
`matching.all_matches_revoked_detected`. L'admin est alerté via la file
exposée dans le dashboard 008-US5 et peut déclencher un **re-matching
manuel** qui recalcule un nouveau top 3 à partir de l'état verified courant.

> Le re-matching ne touche jamais à l'ancien `MatchingResult` (append-only
> Loi 25) : il le marque `superseded` et chaîne via
> `supersededByMatchingResultId`.

## Procédure

### 1. Repérer les briefs concernés

Consulter la file `voyageur.brief.all_matches_revoked` dans le dashboard
admin (008-US5), ou en SQL :

```sql
SELECT briefId, matchingResultId, occurredAt
FROM matching_audit_entries
WHERE eventType = 'matching.all_matches_revoked_detected'
ORDER BY occurredAt DESC
LIMIT 50;
```

### 2. Déclencher le re-matching

`POST /api/matching/admin/briefs/:briefId/re-match`

- **Auth** : session admin valide (`AuthGuard` + `RoleGuard @RequireRole('admin')`).
- **Header obligatoire** : `Idempotency-Key: <uuid>` (Principe X — un rejeu
  avec la même clé ne recalcule pas deux fois).
- **Body** : `{ "reason": "<10 à 500 caractères>" }` (audit `matching.recomputed`).

```bash
curl -X POST https://api.conseiller-voyage.ca/api/matching/admin/briefs/<briefId>/re-match \
  -H "Cookie: <session-admin>" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Re-matching ticket #4567 — 3 conseillers révoqués (permis expiré)"}'
```

### 3. Interpréter la réponse

| Code | Signification | Action |
|---|---|---|
| `200` | Nouveau `MatchingResult` créé (`newMatchingResultId` + `status` + `matchedCount`) | OK — vérifier `matchedCount`. Si `0`, couverture conseillers réellement insuffisante (voir §4). |
| `409 RE_MATCH_IN_PROGRESS` | Verrou Redis déjà détenu (SETNX 30 s) | Réessayer après quelques secondes. |
| `404 BRIEF_NOT_FOUND` | briefId inexistant ou anonymisé Loi 25 | Aucun re-matching possible — le brief n'existe plus. |
| `422 BRIEF_NOT_ACTIVE` | Aucun `MatchingResult` préalable | Le brief n'a jamais été matché ; ce n'est pas un cas de re-matching. |
| `400` | `reason` invalide (Zod 10-500 chars) | Corriger le body. |
| `401` / `403` | Session/rôle invalide | Se reconnecter en admin. |

### 4. Vérifier le résultat

```sql
-- Le nouveau MR est actif, l'ancien superseded + chaîné
SELECT id, status, matchedCount, supersededAt, supersededByMatchingResultId
FROM matching_results
WHERE briefId = '<briefId>'
ORDER BY computedAt DESC;

-- Audit de la recomputation
SELECT eventType, payload, occurredAt
FROM matching_audit_entries
WHERE briefId = '<briefId>' AND eventType = 'matching.recomputed';
```

Si le nouveau `status = empty` (aucun conseiller verified éligible),
le problème n'est pas technique mais une **couverture conseillers
insuffisante** sur la destination/langue du brief → escalader produit
(recrutement conseillers) plutôt que de relancer.

## SLO / métriques à surveiller

| Métrique | Cible | Source |
|---|---|---|
| Latence re-matching (calcul + persistance) | p95 < 800 ms | `matching.duration_ms` (dashboard `matching.json`) |
| Taux `empty` post-re-matching | < 5 % / 24h | alerte `cv-matching-empty-rate` (`matching-alerts.yaml`) |
| Conflits verrou (409) | proche de 0 | logs `RE_MATCH_IN_PROGRESS` |

## Références

- spec.md FR-016 (re-matching admin)
- contracts/http-endpoints.md (codes réponse)
- `apps/api/src/modules/matching/application/use-cases/trigger-rematch.use-case.ts`
- `apps/api/src/modules/matching/infrastructure/jobs/all-matches-revoked.scheduler.ts`
- dashboard `docs/dashboards/matching.json` + `docs/dashboards/matching-alerts.yaml`
