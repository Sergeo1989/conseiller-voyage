# Quickstart — Conversation conseiller ↔ voyageur (014)

## Pré-requis

- Stack dev locale : `pnpm install`, `pnpm docker:up` (PostgreSQL + Redis + LocalStack S3/SES).
- Migration Prisma appliquée (modèles `Conversation*`).
- Un lead à l'état `accepté` (012) entre un conseiller vérifié et un brief voyageur.

## Vérifier le flux (mappé aux Success Criteria)

| Vérification | Comment | SC |
|---|---|---|
| Fil ouvert à l'acceptation | Passer un lead à `accepté` → un fil (conseiller × lead) existe | SC-005 |
| Envoi + ordre | POST message côté conseiller puis voyageur → visibles dans l'ordre | SC-001 |
| 1 notif/destinataire | Vérifier l'outbox : 1 entrée par destinataire, pas de doublon | SC-002 |
| Idempotence | Rejouer le POST avec la même clé → pas de doublon | SC-009 |
| Lecture seule | Passer le lead à `perdu` → POST message refusé (403/409) | SC-004 |
| Pas avant acceptation | Tenter un fil sur lead `vu` → refusé | SC-005 |
| Cloisonnement | 2 conseillers acceptent → chacun ne voit que son fil | SC-007 |
| Pièce jointe tel quel | Upload PDF (pré-signé) → finalize → lecture via URL signée, **aucun montant** | SC-003 |
| Anti-transaction | Inspecter modèle + réponses : 0 champ montant/paiement/réservation | SC-003 |
| Loi 25 | Anonymiser une partie → corps PII neutralisés + pièces jointes supprimées, audit présent | SC-006 |
| SLO | p95 POST message < 800 ms (test de charge léger) | SC-008 |

## Tests

```bash
# Domaine pur (TDD : rouge avant vert) — conversation-policy (canWrite/validate*), idempotence
pnpm --filter @cv/api test -- conversation

# Intégration (Testcontainers Postgres + Redis + LocalStack)
pnpm --filter @cv/api test:integration -- conversation

# UI minimale (a11y axe-core)
pnpm --filter @cv/web test:a11y -- --grep @a11y
```

## DoD avant PR

- Vitest pur + intégration verts ; axe-core 0 violation sérieuse ; lint + tsc.
- Invariant anti-transaction vert (0 champ montant/paiement).
- ADR-0027 rédigé (pièces jointes anti-transaction + URL signées + rétention).
- Migration testée en staging ; SLO p95 < 800 ms vérifié.
