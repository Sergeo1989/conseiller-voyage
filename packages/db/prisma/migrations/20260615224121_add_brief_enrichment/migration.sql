-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('enrichi', 'partiel', 'non_enrichi', 'indisponible');

-- CreateEnum
CREATE TYPE "EnrichmentFailureReason" AS ENUM ('timeout', 'unavailable', 'schema_invalid', 'low_confidence', 'empty_input');

-- CreateTable
CREATE TABLE "intake_brief_enrichments" (
    "briefId" UUID NOT NULL,
    "status" "EnrichmentStatus" NOT NULL,
    "enrichedSpeciality" "TravelSpeciality",
    "enrichedDestinations" JSONB NOT NULL DEFAULT '[]',
    "confidence" DECIMAL(3,2) NOT NULL,
    "failureReason" "EnrichmentFailureReason",
    "providerVersion" VARCHAR(100),
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redactedAt" TIMESTAMP(3),

    CONSTRAINT "intake_brief_enrichments_pkey" PRIMARY KEY ("briefId")
);

-- AddForeignKey
ALTER TABLE "intake_brief_enrichments" ADD CONSTRAINT "intake_brief_enrichments_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "intake_voyageur_briefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
