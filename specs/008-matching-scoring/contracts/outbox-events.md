# Contract — Outbox Events

**Module producer** : `matching`
**Table source** : `matching_outbox_entries` (cf. data-model.md §4)
**Worker publisher** : `OutboxPublisherJob` (extension de feature 003 à programmer en Phase 8 polish)
**Transport** : interne (BullMQ topic-based) puis externe (SES pour les notifications conseillers via 012)

4 événements distincts (cf. Q5 clarify). Chaque événement persiste en outbox avant publication (Outbox Pattern → atomicité DB+queue, Principe X idempotence).

---

## 1. `voyageur.brief.matched`

**Trigger** : `MatchingResult` créé avec `status=ok` (3 entries, tous verified au moment du calcul).
**Consommateurs** :
- Feature 012 — `BriefMatchedConsumer` : crée 3 leads `envoyé` (machine d'état), envoie 3 courriels conseillers (SES via 003), instrumente compteurs métriques 2.

### Payload schema (Zod)

```typescript
export const OutboxMatchedPayloadSchema = z.object({
  matchingResultId: BrandedMatchingResultIdSchema,
  briefId: BrandedVoyageurBriefIdSchema,
  matchedCount: z.literal(3),
  algorithmVersion: z.string().regex(/^v\d+\.\d+$/),
  computedAt: z.string().datetime(),
  entries: z.array(z.object({
    position: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    conseillerId: BrandedConseillerIdSchema,
    scoreFinal: z.number().min(0).max(1.1),
    boosted: z.boolean(),
  })).length(3),
  boostApplied: z.boolean(),
  // PAS de scoreComponents ni scoreBrut — signal interne, pas pour les consommateurs aval
});

export type OutboxMatchedPayload = z.infer<typeof OutboxMatchedPayloadSchema>;
```

### Idempotency key

```
matching:${briefId}:voyageur.brief.matched:${algorithmVersion}
```

Garantit une seule publication par (brief, version d'algorithme). Un re-matching admin avec une nouvelle version d'algorithme produit un nouvel event distinct.

---

## 2. `voyageur.brief.partially_matched`

**Trigger** : `MatchingResult` créé avec `status=partial` (1 ou 2 entries, verified mais moins de 3 conseillers éligibles).
**Consommateurs** :
- Feature 012 — `BriefPartiallyMatchedConsumer` : crée 1 ou 2 leads, envoie 1-2 courriels conseillers + courriel voyageur explicatif (« nous n'avons trouvé que 2 conseillers correspondant à votre demande »).
- Extension US5 dashboard admin de 008 — incrémente le compteur "briefs partial" pour alerte WARN si > 15 % sur 7 j (cf. plan Principe VII).

### Payload schema

```typescript
export const OutboxPartialPayloadSchema = z.object({
  matchingResultId: BrandedMatchingResultIdSchema,
  briefId: BrandedVoyageurBriefIdSchema,
  matchedCount: z.union([z.literal(1), z.literal(2)]),
  algorithmVersion: z.string().regex(/^v\d+\.\d+$/),
  computedAt: z.string().datetime(),
  entries: z.array(z.object({
    position: z.union([z.literal(1), z.literal(2)]),
    conseillerId: BrandedConseillerIdSchema,
    scoreFinal: z.number().min(0).max(1.1),
    boosted: z.boolean(),
  })).min(1).max(2),
  boostApplied: z.boolean(),
  // Pourquoi partial ? Aide les admins à diagnostiquer
  reason: z.enum([
    'insufficient_verified_conseillers',
    'language_filter_excluded_too_many',
    'destination_no_specialist',
    'multiple_factors',
  ]),
});

export type OutboxPartialPayload = z.infer<typeof OutboxPartialPayloadSchema>;
```

### Idempotency key

```
matching:${briefId}:voyageur.brief.partially_matched:${algorithmVersion}
```

---

## 3. `voyageur.brief.unmatched`

**Trigger** : `MatchingResult` créé avec `status=empty` (0 entry, aucun conseiller éligible).
**Consommateurs** :
- Feature 012 — `BriefUnmatchedConsumer` : envoie au voyageur un courriel d'attente (« nous cherchons un conseiller pour vous, vous serez contacté sous 48 h ») et bascule le brief en file admin urgent.
- Extension US5 dashboard admin de 008 — affiche le brief avec priorité HAUTE (cf. memo intake US5).
- Métriques (Principe VII) : alimente l'alerte WARN si taux `empty` > 5 % sur 24 h.

### Payload schema

```typescript
export const OutboxUnmatchedPayloadSchema = z.object({
  matchingResultId: BrandedMatchingResultIdSchema,
  briefId: BrandedVoyageurBriefIdSchema,
  matchedCount: z.literal(0),
  algorithmVersion: z.string().regex(/^v\d+\.\d+$/),
  computedAt: z.string().datetime(),
  reason: z.enum([
    'no_verified_conseillers_at_all',     // jour 1 plateforme, ne devrait pas arriver après 6 mois
    'no_conseiller_speaks_requested_language',
    'no_conseiller_covers_destination',
    'multiple_factors',
  ]),
  candidatesEvaluatedCount: z.number().int().min(0),  // pour debug admin
});
```

### Idempotency key

```
matching:${briefId}:voyageur.brief.unmatched:${algorithmVersion}
```

---

## 4. `voyageur.brief.all_matches_revoked`

**Trigger** : détection scheduler quotidien (`DetectAllMatchesRevokedScheduler`) — pour chaque MR `status=ok` non-superseded, vérifie le statut verified courant des 3 conseillers. Si **tous les 3** sont non-verified : émet cet event.
**Consommateurs** :
- Extension US5 dashboard admin de 008 — affiche dans une vue "Re-matching requis" (admin clique pour déclencher endpoint `POST /admin/briefs/:id/re-match`, contrats §1).
- Pas de notification voyageur automatique en MVP (Q4 : trigger manuel admin, pas auto).

### Payload schema

```typescript
export const OutboxAllRevokedPayloadSchema = z.object({
  matchingResultId: BrandedMatchingResultIdSchema,
  briefId: BrandedVoyageurBriefIdSchema,
  algorithmVersion: z.string().regex(/^v\d+\.\d+$/),
  originalComputedAt: z.string().datetime(),
  revokedAt: z.string().datetime(),  // timestamp de la dernière révocation
  revokedConseillerIds: z.array(BrandedConseillerIdSchema).length(3),
});
```

### Idempotency key

```
matching:${briefId}:voyageur.brief.all_matches_revoked:${originalMatchingResultId}
```

Empêche le scheduler de re-émettre l'event pour le même MR (un seul signal par MR révoqué — l'admin doit re-matcher pour générer un nouveau MR + reset du suivi).

---

## Flux global (séquence)

```
[brief activé par voyageur (feature 008)]
        │
        ▼
[outbox `intake_outbox_entries.voyageur.brief.activated`]
        │
        ▼ (consommé par BullMQ → matching)
[PerformMatchingUseCase calcule]
        │
        ▼ (insert atomique matching_results + entries + matching_outbox_entries)
[OutboxPublisherJob (003 extension) publie selon eventType]
        │
        ├───── voyageur.brief.matched          ───► 012 BriefMatchedConsumer
        ├───── voyageur.brief.partially_matched ──► 012 BriefPartiallyMatchedConsumer + admin file
        ├───── voyageur.brief.unmatched        ───► 012 BriefUnmatchedConsumer + admin file URGENT
        │
        ▼ (plus tard, scheduler quotidien)
[DetectAllMatchesRevokedScheduler scan matching_results actifs]
        │
        ▼ (si tous 3 révoqués)
[matching_outbox_entries.voyageur.brief.all_matches_revoked]
        │
        ▼
[OutboxPublisher publie] ──► admin file "re-matching requis"
        │
        ▼ (admin clique sur dashboard)
[POST /api/matching/admin/briefs/:id/re-match]
        │
        ▼ (TriggerRematchUseCase exécute)
[nouveau matching_results, ancien superseded] + un nouveau event outbox approprié
```

---

## Versioning des payloads

Tous les schemas sont exportés depuis `@cv/shared/matching/schemas.ts`. Un changement breaking de payload :

1. Bump majeur de la version package shared.
2. Mise à jour cohérente de tous les consommateurs (012, US5 admin extension).
3. ADR documentant le changement breaking.

Un changement additif (nouveau champ optionnel) ne requiert pas de versioning — les consommateurs ignorent les champs inconnus (forward compatibility).

## Tests d'invariant requis

- Un seul des 4 events est émis par calcul (jamais 2 events simultanés pour le même MR).
- L'idempotency key empêche le double-publish (test : insérer 2 lignes outbox avec même idempotencyKey → contrainte UNIQUE rejette la 2ème).
- Le payload Zod valide à 100 % au runtime (tests de propriété sur 10 000 MR simulés).
- L'event `all_matches_revoked` n'est jamais émis si le MR a été superseded (test invariant : `supersededAt IS NOT NULL ⇒ no all_matches_revoked event for this MR`).
