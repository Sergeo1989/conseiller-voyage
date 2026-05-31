# ADR-0023 — Anonymisation cascade matching via trigger Postgres

**Date** : 2026-05-31
**Statut** : proposé
**Décideurs** : équipe technique, équipe conformité
**Spec lié** : [008-matching-scoring/spec.md](../../specs/008-matching-scoring/spec.md), FR-020 + Assumptions (Conformité Loi 25)
**Plan lié** : [008-matching-scoring/plan.md](../../specs/008-matching-scoring/plan.md), Constitution Check Principe II
**Research lié** : [008-matching-scoring/research.md](../../specs/008-matching-scoring/research.md), R4

---

## Contexte

Quand un voyageur exerce son droit à l'effacement Loi 25 (feature 008 FR-022 / FR-022a), le brief associé passe à `status = anonymized` et ses PII (email, prénom, téléphone) sont nullifiées par un trigger Postgres (feature 008 `intake_anonymisation_trigger`).

Les `MatchingResult` calculés pour ce brief contiennent des **références PII indirectes** :

- `briefId` (FK vers voyageur_briefs, point d'entrée pour reconstituer la PII voyageur via JOIN historique).
- `suggestedConseillerId` (capture l'intention de visite voyageur — PII comportementale).
- `scoreComponents` JSONB (peut indirectement révéler des préférences voyageur — destination, spécialité — qui sont des données personnelles selon Loi 25).

Le `MatchingResult` lui-même **doit rester en base** :

- Audit Loi 25 (traçabilité 7 ans).
- Trace historique des 3 conseillers historiquement notifiés (utile pour feature 012 si litige).
- `matching_audit_entries` doit rester intact (append-only construction).

Deux stratégies évaluées pour propager l'anonymisation au matching :

| Stratégie | Avantages | Inconvénients |
|---|---|---|
| **Trigger Postgres `AFTER UPDATE` sur `voyageur_briefs`** | Atomicité DB, latence ms, pattern hérité 008 | SQL impératif, moins testable côté unit |
| **Job applicatif BullMQ consume `voyageur.brief.deleted`** | Plus testable, observable | Latence file, risque de PII en rétention si worker HS |
| **CASCADE FK** | Trivial | Supprime la ligne MatchingResult entière — perte audit historique |

## Décision

Implémenter **trigger Postgres `AFTER UPDATE` sur `voyageur_briefs`** quand `OLD.status != 'anonymized' AND NEW.status = 'anonymized'`. Le trigger exécute en cascade :

1. `UPDATE matching_results SET briefId = NULL, suggestedConseillerId = NULL WHERE briefId = OLD.id` — nullifie les pointeurs PII.
2. `UPDATE matching_result_entries SET scoreComponents = '{"redacted":"loi25"}'::jsonb WHERE matchingResultId IN (SELECT id FROM matching_results WHERE briefId IS NULL AND id IN <les IDs précédents>)` — redacte le détail des composantes (qui pourraient révéler des préférences voyageur).

**Important** : le trigger NE TOUCHE PAS à `matching_audit_entries` — l'audit Loi 25 reste intact pour 7 ans (rétention conformité, constitution *Cycle de vie et rétention des données*).

### Migration

`packages/db/prisma/migrations/2026XXXX_matching_anonymisation_cascade/migration.sql` :

```sql
-- ADR-0023 — trigger anonymisation cascade brief → matching
CREATE OR REPLACE FUNCTION matching_anonymise_cascade()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != 'anonymized' AND NEW.status = 'anonymized' THEN
    -- Capture les MR concernés
    WITH affected_mrs AS (
      SELECT id FROM matching_results WHERE "briefId" = OLD.id
    )
    -- 1. Nullifier briefId + suggestedConseillerId
    UPDATE matching_results
      SET "briefId" = NULL,
          "suggestedConseillerId" = NULL
      WHERE "briefId" = OLD.id;

    -- 2. Redacter scoreComponents
    UPDATE matching_result_entries
      SET "scoreComponents" = '{"redacted":"loi25"}'::jsonb
      WHERE "matchingResultId" IN (SELECT id FROM affected_mrs);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_matching_anonymise_cascade
AFTER UPDATE OF status ON voyageur_briefs
FOR EACH ROW
EXECUTE FUNCTION matching_anonymise_cascade();
```

## Conséquences

### Positives

1. **Atomicité DB** — propagation garantie dans la même transaction que l'anonymisation brief. Pas de fenêtre de PII orpheline entre l'anonymisation brief et la propagation matching.
2. **Latence < 50 ms** — mesurée sur pattern 008. Conforme exigence Loi 25 « effacement < 60 s » avec marge confortable.
3. **Indépendant de la disponibilité worker BullMQ** — pas de risque de rétention PII si worker HS pendant maintenance.
4. **Pattern hérité** — testé en CI + staging sur 008 depuis 2026-05-29. Faible risque d'introduire une régression.
5. **Audit préservé** — `matching_audit_entries` n'est pas touchée (FR-020 garanti).

### Négatives / risques

1. **SQL impératif** — moins testable côté unit que TypeScript. Mitigation : test d'intégration dédié (`anonymisation-cascade.integration.test.ts`, T083) couvre le cas.
2. **Coupling DB cross-module** — le trigger sur `voyageur_briefs` (table 008) écrit sur `matching_results` (table 011). Documenté dans ADR-0024 (extensions cross-module). Le rôle DB `app_intake` n'a PAS besoin de privilèges sur `matching_*` — le trigger s'exécute dans le contexte du superuser ou du rôle propriétaire (à configurer en migration).

### Mitigation

- Test d'intégration `anonymisation-cascade.integration.test.ts` (T083) : seed un brief actif avec MR, déclenche effacement, vérifie cascade.
- Test d'invariant : `matching_audit_entries` doit rester intacte après cascade (T084 append-only trigger tests).
- Documentation runbook `docs/runbooks/intake-anonymisation-loi25.md` (déjà 008) étendue mention cascade matching.

## Alternatives considérées

| Alternative | Rejet |
|---|---|
| **Job applicatif BullMQ consume `voyageur.brief.deleted`** | Latence file + risque rétention si worker HS. Loi 25 < 60 s difficile à garantir formellement. |
| **CASCADE FK** | Supprime la ligne MatchingResult — perte audit historique. |
| **Use case applicatif synchrone post-erasure** | Couplage cross-module fort — le code 008 saurait écrire sur 011, violation Principe V. |
| **Pas de cascade — laisser les pointeurs PII en place** | Violation Loi 25 (PII reste retrouvable via JOIN). Inacceptable. |
