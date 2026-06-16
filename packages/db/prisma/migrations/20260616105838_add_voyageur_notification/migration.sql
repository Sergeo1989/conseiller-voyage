-- CreateEnum
CREATE TYPE "VoyageurNotificationType" AS ENUM ('accuse_activation', 'conseillers_prets', 'recherche_en_cours');

-- CreateEnum
CREATE TYPE "VoyageurNotificationStatus" AS ENUM ('en_attente', 'envoyee', 'echouee', 'annulee');

-- CreateEnum
CREATE TYPE "VoyageurMatchOutcome" AS ENUM ('matched', 'partially_matched', 'unmatched');

-- CreateTable
CREATE TABLE "intake_voyageur_notifications" (
    "id" UUID NOT NULL,
    "briefId" UUID NOT NULL,
    "type" "VoyageurNotificationType" NOT NULL,
    "status" "VoyageurNotificationStatus" NOT NULL DEFAULT 'en_attente',
    "idempotencyKey" TEXT NOT NULL,
    "outcome" "VoyageurMatchOutcome",
    "conseillerIds" JSONB NOT NULL DEFAULT '[]',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "intake_voyageur_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "intake_voyageur_notifications_idempotencyKey_key" ON "intake_voyageur_notifications"("idempotencyKey");

-- CreateIndex
CREATE INDEX "intake_voyageur_notifications_status_idx" ON "intake_voyageur_notifications"("status");

-- CreateIndex
CREATE INDEX "intake_voyageur_notifications_briefId_idx" ON "intake_voyageur_notifications"("briefId");

-- AddForeignKey
ALTER TABLE "intake_voyageur_notifications" ADD CONSTRAINT "intake_voyageur_notifications_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "intake_voyageur_briefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
