-- T030b — Defense en profondeur : bloque TRUNCATE sur conformite_audit_entries.
--
-- Le trigger initial trg_conformite_audit_block_updates utilise FOR EACH ROW
-- BEFORE UPDATE OR DELETE — il ne se déclenche PAS sur TRUNCATE qui est un
-- statement-level command DDL en PostgreSQL. Sans ce second trigger, un
-- attaquant qui obtient les credentials d'app_conformite peut TRUNCATE la
-- table en une commande et effacer toute l'historique d'audit conformité
-- (jusqu'à 7 ans de données réglementaires OPC/TICO).
--
-- Ce trigger ajoute une couche supplémentaire : même si quelqu'un parvient
-- à exécuter TRUNCATE (via injection SQL, leak de creds, ou bug),
-- la transaction est annulée avec le même message "append-only".
--
-- Note : REVOKE TRUNCATE n'est pas applicable car le privilège TRUNCATE
-- en PostgreSQL est lié à l'OWNER de la table, pas à un GRANT séparé.
-- Le trigger est donc la défense ultime.

CREATE TRIGGER trg_conformite_audit_block_truncate
  BEFORE TRUNCATE ON conformite_audit_entries
  FOR EACH STATEMENT
  EXECUTE FUNCTION conformite_audit_block_modifications();

COMMENT ON TRIGGER trg_conformite_audit_block_truncate ON conformite_audit_entries
  IS 'Defense en profondeur Loi 25 / OPC : empêche TRUNCATE de la table audit. Complète trg_conformite_audit_block_updates qui ne couvre que UPDATE/DELETE row-level.';
