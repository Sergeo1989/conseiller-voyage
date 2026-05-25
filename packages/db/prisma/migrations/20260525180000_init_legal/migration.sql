-- Migration 004 — Tables des documents légaux et acceptations.
--
-- Cf. specs/004-mentions-legales/data-model.md.
-- Tables :
--   - auth_legal_documents (versionnement + checksum + contentSnapshot)
--   - auth_legal_acceptances (append-only, traçabilité Loi 25)
--   - auth_legal_acceptance_anonymizations (anonymisation différée, ADR-0008)
--
-- Les triggers d'immutabilité sont posés dans la migration suivante
-- (20260525180001_init_legal_immutability) pour séparer DDL et invariants
-- d'exécution.

-- CreateEnum
CREATE TYPE "LegalDocumentType" AS ENUM ('mentions_legales', 'cgu_b2c', 'cgu_b2b', 'confidentialite', 'comment_ca_marche');

-- CreateEnum
CREATE TYPE "LegalAcceptanceSubjectType" AS ENUM ('user', 'brief');

-- CreateTable
CREATE TABLE "auth_legal_documents" (
    "id" UUID NOT NULL,
    "type" "LegalDocumentType" NOT NULL,
    "version" INTEGER NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "contentSnapshot" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_legal_acceptances" (
    "id" UUID NOT NULL,
    "subjectType" "LegalAcceptanceSubjectType" NOT NULL,
    "subjectId" UUID NOT NULL,
    "documentType" "LegalDocumentType" NOT NULL,
    "documentVersion" INTEGER NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" VARCHAR(45) NOT NULL,
    "userAgent" VARCHAR(512) NOT NULL,

    CONSTRAINT "auth_legal_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_legal_acceptance_anonymizations" (
    "id" UUID NOT NULL,
    "acceptanceId" UUID NOT NULL,
    "subjectIdHash" CHAR(64) NOT NULL,
    "ipAddressMasked" VARCHAR(45) NOT NULL,
    "userAgentFamily" VARCHAR(64) NOT NULL,
    "anonymizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anonymizationSaltVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "auth_legal_acceptance_anonymizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_legal_documents_type_version_key" ON "auth_legal_documents"("type", "version");

-- CreateIndex
CREATE INDEX "auth_legal_documents_type_version_desc_idx" ON "auth_legal_documents"("type", "version" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "auth_legal_acceptances_idempotency_key" ON "auth_legal_acceptances"("subjectId", "documentType", "documentVersion");

-- CreateIndex
CREATE INDEX "auth_legal_acceptances_subject_history_idx" ON "auth_legal_acceptances"("subjectId", "documentType", "acceptedAt" DESC);

-- CreateIndex
CREATE INDEX "auth_legal_acceptances_by_document_idx" ON "auth_legal_acceptances"("documentType", "documentVersion");

-- CreateIndex
CREATE UNIQUE INDEX "auth_legal_acceptance_anonymizations_acceptanceId_key" ON "auth_legal_acceptance_anonymizations"("acceptanceId");

-- CreateIndex
CREATE INDEX "auth_legal_acceptance_anonymizations_anonymized_at_idx" ON "auth_legal_acceptance_anonymizations"("anonymizedAt");

-- AddForeignKey
-- ON DELETE SET NULL initialement — aligné sur RESTRICT par la migration
-- suivante 20260525224400_align_legal_acceptance_fk_restrict pour défense
-- en profondeur (les triggers bloquent déjà DELETE sur auth_legal_documents).
ALTER TABLE "auth_legal_acceptances" ADD CONSTRAINT "auth_legal_acceptances_documentType_documentVersion_fkey" FOREIGN KEY ("documentType", "documentVersion") REFERENCES "auth_legal_documents"("type", "version") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_legal_acceptance_anonymizations" ADD CONSTRAINT "auth_legal_acceptance_anonymizations_acceptanceId_fkey" FOREIGN KEY ("acceptanceId") REFERENCES "auth_legal_acceptances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
