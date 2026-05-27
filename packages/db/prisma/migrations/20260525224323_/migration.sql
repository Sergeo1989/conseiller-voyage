-- DropForeignKey
ALTER TABLE "auth_legal_acceptances" DROP CONSTRAINT "auth_legal_acceptances_documentType_documentVersion_fkey";

-- AddForeignKey
ALTER TABLE "auth_legal_acceptances" ADD CONSTRAINT "auth_legal_acceptances_documentType_documentVersion_fkey" FOREIGN KEY ("documentType", "documentVersion") REFERENCES "auth_legal_documents"("type", "version") ON DELETE RESTRICT ON UPDATE CASCADE;
