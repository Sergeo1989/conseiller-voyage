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

## Statut de validation (T039) — 2026-06-08

Couverture des critères de succès par les tests automatisés (197 tests `@cv/api`
verts ; tsc `@cv/api` + `@cv/web` + `@cv/shared` verts ; feature-boundaries 0
violation ; invariant anti-transaction vert) :

| SC | Critère | Couverture |
|---|---|---|
| SC-001 | Message persisté, horodaté, ordonné | `send-message.use-case.test.ts`, `attachments`/list pagination |
| SC-002 | Exactement 1 notification par destinataire | `send-message` (outbox 1/destinataire) + job idempotent T017 |
| SC-003 | 0 champ transactionnel (devis = fichier opaque) | **invariant T038** + use cases pièces jointes |
| SC-004 | Lecture seule sur lead terminal-négatif | `send-message.authz.test.ts` (refusé/perdu) |
| SC-005 | Aucun message sur lead non accepté | `send-message` (`canWrite`) + ouverture T016 |
| SC-006 | Re-filtrage `verified` dynamique | `send-message.authz.test.ts` (conseiller révoqué) |
| SC-007 | Cloisonnement (un conseiller ≠ fil d'un autre) | `send-message`/`attachments` (`forbidden_not_member`) + `ConversationQueryPort` |
| SC-008 | Effacement Loi 25 (corps + pièces, audit préservé) | `anonymize-conversation.use-case.test.ts` |
| SC-009 | Idempotence d'envoi (rejeu sans doublon) | `send-message` (idempotencyKey) |

**Différé au staging** (convention 011/012, infra réelle) : exécution des stubs
d'intégration (`conversation-messaging` / `-attachments` / `-resilience`), envoi
SES réel, upload/lecture S3 LocalStack, **test de charge léger SLO p95 envoi
< 800 ms**, migration appliquée en staging. La logique métier est intégralement
couverte par les tests unitaires + use cases avec fakes.

**DoD** : tests purs + use cases verts ✅ · lint Biome ✅ · tsc ✅ · invariant
anti-transaction ✅ · ADR-0027 ✅ · copie FR-CA + i18n EN ✅ · a11y (markup
sémantique ; axe automatisé activé dès la route montée par 014/015) ⏳ ·
intégration + SLO + migration **staging** ⏳.
