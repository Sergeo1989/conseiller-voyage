# ADR-0017 — Table d'audit `intake_audit_entries` séparée

**Date** : 2026-05-29
**Statut** : accepté
**Décideurs** : équipe technique, équipe conformité
**Spec lié** : [002-voyageur-intake/spec.md](../../specs/002-voyageur-intake/spec.md), FR-023, Principe IX
**Plan lié** : [002-voyageur-intake/plan.md](../../specs/002-voyageur-intake/plan.md), Phase 0 — R2

---

## Contexte

Le module intake produit un journal d'audit append-only de toute action
sur les briefs voyageurs (création, vérification email, demande
d'effacement Loi 25, push admin manuel). Ce journal doit :

- Être **append-only** (UPDATE/DELETE/TRUNCATE bloqués au niveau DB) —
  exigence Principe IX + traçabilité réglementaire 7 ans.
- Permettre un partitionnement indépendant du module conformité (le
  volume intake croît différemment — 1 brief = N events, 100 briefs/mois
  M1 → 2000 briefs/mois M18 selon roadmap).
- Respecter la **frontière modulaire** Principe V — le module intake ne
  doit pas écrire dans une table appartenant au module conformité.

Deux options ont été considérées :

| Option | Avantages | Inconvénients |
|---|---|---|
| **Table partagée `conformite_audit_entries`** | Une seule trigger, un seul rôle DB | Viole frontière modulaire ; partitionnement couplé ; pen-test isolation impossible |
| **Table séparée `intake_audit_entries`** | Frontière modulaire respectée ; partitionnement indépendant ; least privilege par rôle `app_intake` | Duplication du trigger SQL (50 lignes), GRANTS dupliqués |
| **Table générique `audit_entries` avec discriminant `module`** | Une seule trigger | Mélange types d'événements ; impossible de réutiliser les enums Postgres distincts par module |

## Décision

Créer une table `intake_audit_entries` séparée avec **le même schéma et
le même trigger SQL append-only** que `conformite_audit_entries`. Chaque
module gère sa propre table d'audit.

Le rôle DB `app_intake` reçoit `SELECT, INSERT` uniquement sur
`intake_audit_entries` ; `UPDATE, DELETE, TRUNCATE` sont à la fois
révoqués au niveau privilèges (GRANT/REVOKE) et bloqués par le trigger
(défense en profondeur).

## Conséquences

### Positives

1. **Principe V respecté** : le tool `tools/check-module-boundaries.ts`
   peut continuer à rejeter les imports cross-module sur les préfixes
   Prisma (`intake_*` vs `conformite_*`).
2. **Scaling indépendant** : Postgres peut partitionner chaque table par
   date sans synchroniser les modules (cf. issue future de
   partitionnement).
3. **Pen-test isolation (Principe IX)** : si un attaquant compromet le
   rôle `app_intake`, il ne peut PAS accéder à l'audit conformité, et
   inversement. Least privilege strict.
4. **Lisibilité** : les enums Postgres `BriefStatus`, `TravelBudget`,
   etc. ne polluent pas le module conformité.

### Négatives

1. **Duplication SQL** : ~50 lignes (trigger + GRANTS) répétées par
   module. Coût marginal vu le bénéfice de l'isolation.
2. **Outils transverses** (ex: dashboard agrégé tous modules) doivent
   faire un `UNION` au lieu d'un simple `SELECT`. Acceptable.

### Conséquences sur l'observabilité

Les CLIs de scan (T141-T142c) interrogent `intake_audit_entries`
exclusivement. Pas de risque de bruit cross-module.

---

## Mise en œuvre

- Migration `20260528170002_intake_audit_append_only/migration.sql` (T014)
  pose la trigger `intake_audit_block_modifications` et le trigger
  TRUNCATE statement-level (leçon 001).
- Rôle `app_intake` créé conditionnellement (idempotent) avec GRANTS
  strict.
- Lectures cross-module limitées à `auth_users` (FK soft actorId) et
  `conformite_conseiller_compliances` (US5 admin push manuel — lookup
  conseiller vérifié).

## Références

- ADR-0008 — Anonymisation Loi 25 hash salé immutable
- specs/002-voyageur-intake/data-model.md `IntakeAuditEntry`
- specs/002-voyageur-intake/research.md R2
