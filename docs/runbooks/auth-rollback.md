# Runbook — Rollback exceptionnel des migrations auth (feature 002)

**Feature** : 002 (auth conseiller + admin)
**Migrations concernées** : `20260527000000_init_auth_credentials`, `20260527000001_auth_audit_immutability`, `20260527000002_auth_credentials_grants`, `20260527000003_login_lockout_nulls_not_distinct`

## Quand utiliser ce runbook

**Cas exceptionnels uniquement** :

- Restauration depuis un backup post-incident catastrophique.
- Migration de schéma majeure qui exige de supprimer puis recréer `auth_audit_events`.
- Test de désinstallation complète de la feature 002 en staging.

**Toute exécution exige une approbation à 4 yeux + un dump d'audit hors-table avant de toucher quoi que ce soit.**

## Pourquoi un runbook ?

La table `auth_audit_events` est protégée par 3 triggers Postgres
(`BEFORE UPDATE/DELETE/TRUNCATE`) qui rejettent toute mutation. C'est le
contrat Principe IX NON-NÉGOCIABLE.

Conséquence : `prisma migrate reset` et autres opérations destructives
**échouent** sur cette table en l'état. Pour faire le rollback, il faut
explicitement DROP les triggers d'abord.

## Procédure (lecture obligatoire avant exécution)

### 1. Approbation et trace hors-table

```bash
# Approbation 4-eyes : Slack #ops-incidents canal, message explicite.
# Dump complet de la table audit AVANT toute action :
pg_dump -t auth_audit_events --data-only --column-inserts \
  cv_prod > /backups/auth_audit_events_before_rollback_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Drop des triggers

```sql
DROP TRIGGER IF EXISTS auth_audit_events_no_update ON auth_audit_events;
DROP TRIGGER IF EXISTS auth_audit_events_no_delete ON auth_audit_events;
DROP TRIGGER IF EXISTS auth_audit_events_no_truncate ON auth_audit_events;
```

### 3. Opération exceptionnelle

Ce qui peut être fait pendant cette fenêtre :

- `DELETE FROM auth_audit_events WHERE …` (purge ciblée)
- `DROP TABLE auth_audit_events` (uninstall complet)
- `prisma migrate reset` (suit la dérivation auto Prisma)

### 4. Recréer les triggers (OBLIGATOIRE post-opération)

Si la table existe encore :

```sql
CREATE OR REPLACE FUNCTION reject_auth_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'auth_audit_events est append-only — TG_OP=% rejeté sur la table %', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auth_audit_events_no_update
  BEFORE UPDATE ON auth_audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_auth_audit_mutation();
CREATE TRIGGER auth_audit_events_no_delete
  BEFORE DELETE ON auth_audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_auth_audit_mutation();
CREATE TRIGGER auth_audit_events_no_truncate
  BEFORE TRUNCATE ON auth_audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_auth_audit_mutation();
```

### 5. Audit post-opération

Tracer l'événement (manuellement, hors `auth_audit_events`) dans un
Google Doc / système d'incident pour la conformité Loi 25.

## Effet de bord

Pendant que les triggers sont DROP, toute INSERT/UPDATE/DELETE sur
`auth_audit_events` est **autorisée** — fenêtre d'attaque potentielle si
un acteur malveillant a accès au runner. **Ne jamais laisser les triggers
DROP sans surveillance active**.

## Lien

- ADR-0012 (`docs/adr/0012-audit-vs-loi-25-no-fk-policy.md`)
- Spec section "Procédures opérationnelles à livrer avant merge"
