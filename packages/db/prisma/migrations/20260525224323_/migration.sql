-- Migration auto-générée par Prisma : aligne la FK
-- auth_legal_acceptances → auth_legal_documents sur ON DELETE RESTRICT
-- (au lieu de SET NULL initialement posé par 20260525180000_init_legal).
--
-- RESTRICT est une seconde ligne de défense FK-level : les triggers
-- bloquent déjà tout DELETE sur auth_legal_documents (immutables), mais
-- le RESTRICT empêche aussi la suppression au cas où un opérateur
-- contournerait les triggers (SET session_replication_role = 'replica').

-- DropForeignKey
ALTER TABLE "auth_legal_acceptances" DROP CONSTRAINT "auth_legal_acceptances_documentType_documentVersion_fkey";

-- AddForeignKey
ALTER TABLE "auth_legal_acceptances" ADD CONSTRAINT "auth_legal_acceptances_documentType_documentVersion_fkey" FOREIGN KEY ("documentType", "documentVersion") REFERENCES "auth_legal_documents"("type", "version") ON DELETE RESTRICT ON UPDATE CASCADE;
