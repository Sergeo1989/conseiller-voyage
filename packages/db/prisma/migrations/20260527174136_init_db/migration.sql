/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `auth_users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "StatutProfil" AS ENUM ('incomplet', 'pret', 'masque_admin', 'anonymise');

-- CreateEnum
CREATE TYPE "OnboardingRelanceEtape" AS ENUM ('j3', 'j7', 'j14');

-- CreateEnum
CREATE TYPE "OnboardingRelanceEtat" AS ENUM ('planifie', 'envoye', 'annule', 'echoue');

-- CreateEnum
CREATE TYPE "ProfilModerationAction" AS ENUM ('retrait_photo', 'masquage', 'retablissement');

-- CreateEnum
CREATE TYPE "PhotoUploadStatut" AS ENUM ('pending_upload', 'commit', 'evicted');

-- AlterTable
ALTER TABLE "auth_users" ADD COLUMN     "firstName" VARCHAR(80),
ADD COLUMN     "lastName" VARCHAR(80);

-- CreateTable
CREATE TABLE "profile_conseiller_profiles" (
    "id" UUID NOT NULL,
    "authUserId" UUID NOT NULL,
    "titre" VARCHAR(80),
    "biographie" TEXT,
    "anneesExperience" INTEGER,
    "afficherNomComplet" BOOLEAN NOT NULL DEFAULT false,
    "photoS3Key" VARCHAR(255),
    "photoWidth" INTEGER,
    "photoHeight" INTEGER,
    "photoContentType" VARCHAR(50),
    "slug" VARCHAR(60),
    "statut" "StatutProfil" NOT NULL DEFAULT 'incomplet',
    "raisonMasquageAdmin" TEXT,
    "publishedAt" TIMESTAMP(3),
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_conseiller_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_photo_history" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "s3Key" VARCHAR(255) NOT NULL,
    "statut" "PhotoUploadStatut" NOT NULL DEFAULT 'pending_upload',
    "width" INTEGER,
    "height" INTEGER,
    "contentType" VARCHAR(50),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),
    "evictedAt" TIMESTAMP(3),

    CONSTRAINT "profile_photo_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_slug_reservations" (
    "slug" VARCHAR(60) NOT NULL,
    "raison" VARCHAR(50) NOT NULL,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conseillerIdOrigine" UUID,

    CONSTRAINT "profile_slug_reservations_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "profile_onboarding_reminder_schedules" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "etape" "OnboardingRelanceEtape" NOT NULL,
    "etat" "OnboardingRelanceEtat" NOT NULL DEFAULT 'planifie',
    "bullmqJobId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "profile_onboarding_reminder_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_moderation_audits" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "adminAuthUserId" UUID NOT NULL,
    "adminEmailHash" VARCHAR(64) NOT NULL,
    "action" "ProfilModerationAction" NOT NULL,
    "raison" TEXT NOT NULL,
    "metadonneesJson" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_moderation_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_specialities" (
    "code" VARCHAR(40) NOT NULL,
    "labelFr" VARCHAR(80) NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "profile_specialities_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "profile_geo_zones" (
    "code" VARCHAR(40) NOT NULL,
    "labelFr" VARCHAR(80) NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "profile_geo_zones_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "profile_languages" (
    "code" VARCHAR(8) NOT NULL,
    "labelFr" VARCHAR(80) NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "profile_languages_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "_ProfileSpecialities" (
    "A" UUID NOT NULL,
    "B" VARCHAR(40) NOT NULL
);

-- CreateTable
CREATE TABLE "_ProfileGeoZones" (
    "A" UUID NOT NULL,
    "B" VARCHAR(40) NOT NULL
);

-- CreateTable
CREATE TABLE "_ProfileLanguages" (
    "A" UUID NOT NULL,
    "B" VARCHAR(8) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "profile_conseiller_profiles_authUserId_key" ON "profile_conseiller_profiles"("authUserId");

-- CreateIndex
CREATE UNIQUE INDEX "profile_conseiller_profiles_slug_key" ON "profile_conseiller_profiles"("slug");

-- CreateIndex
CREATE INDEX "profile_conseiller_profiles_statut_publishedAt_idx" ON "profile_conseiller_profiles"("statut", "publishedAt");

-- CreateIndex
CREATE INDEX "profile_conseiller_profiles_statut_authUserId_idx" ON "profile_conseiller_profiles"("statut", "authUserId");

-- CreateIndex
CREATE INDEX "profile_photo_history_profileId_uploadedAt_idx" ON "profile_photo_history"("profileId", "uploadedAt" DESC);

-- CreateIndex
CREATE INDEX "profile_photo_history_statut_uploadedAt_idx" ON "profile_photo_history"("statut", "uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "profile_onboarding_reminder_schedules_bullmqJobId_key" ON "profile_onboarding_reminder_schedules"("bullmqJobId");

-- CreateIndex
CREATE INDEX "profile_onboarding_reminder_schedules_etat_scheduledFor_idx" ON "profile_onboarding_reminder_schedules"("etat", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "profile_onboarding_reminder_schedules_profileId_etape_key" ON "profile_onboarding_reminder_schedules"("profileId", "etape");

-- CreateIndex
CREATE INDEX "profile_moderation_audits_profileId_occurredAt_idx" ON "profile_moderation_audits"("profileId", "occurredAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "_ProfileSpecialities_AB_unique" ON "_ProfileSpecialities"("A", "B");

-- CreateIndex
CREATE INDEX "_ProfileSpecialities_B_index" ON "_ProfileSpecialities"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ProfileGeoZones_AB_unique" ON "_ProfileGeoZones"("A", "B");

-- CreateIndex
CREATE INDEX "_ProfileGeoZones_B_index" ON "_ProfileGeoZones"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ProfileLanguages_AB_unique" ON "_ProfileLanguages"("A", "B");

-- CreateIndex
CREATE INDEX "_ProfileLanguages_B_index" ON "_ProfileLanguages"("B");

-- CreateIndex
CREATE UNIQUE INDEX "auth_users_email_key" ON "auth_users"("email");

-- AddForeignKey
ALTER TABLE "profile_conseiller_profiles" ADD CONSTRAINT "profile_conseiller_profiles_authUserId_fkey" FOREIGN KEY ("authUserId") REFERENCES "auth_users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_photo_history" ADD CONSTRAINT "profile_photo_history_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile_conseiller_profiles"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_onboarding_reminder_schedules" ADD CONSTRAINT "profile_onboarding_reminder_schedules_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile_conseiller_profiles"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_moderation_audits" ADD CONSTRAINT "profile_moderation_audits_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile_conseiller_profiles"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProfileSpecialities" ADD CONSTRAINT "_ProfileSpecialities_A_fkey" FOREIGN KEY ("A") REFERENCES "profile_conseiller_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProfileSpecialities" ADD CONSTRAINT "_ProfileSpecialities_B_fkey" FOREIGN KEY ("B") REFERENCES "profile_specialities"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProfileGeoZones" ADD CONSTRAINT "_ProfileGeoZones_A_fkey" FOREIGN KEY ("A") REFERENCES "profile_conseiller_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProfileGeoZones" ADD CONSTRAINT "_ProfileGeoZones_B_fkey" FOREIGN KEY ("B") REFERENCES "profile_geo_zones"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProfileLanguages" ADD CONSTRAINT "_ProfileLanguages_A_fkey" FOREIGN KEY ("A") REFERENCES "profile_conseiller_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProfileLanguages" ADD CONSTRAINT "_ProfileLanguages_B_fkey" FOREIGN KEY ("B") REFERENCES "profile_languages"("code") ON DELETE CASCADE ON UPDATE CASCADE;
