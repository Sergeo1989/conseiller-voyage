-- ============================================================================
-- DANGER : MIGRATION DESTRUCTIVE NON-REVERSIBLE — PRÉ-PROD UNIQUEMENT
-- ============================================================================
--
-- Cette migration DROP les colonnes id et userId sur auth_users,
-- auth_accounts, auth_sessions pour les recréer en type UUID. TOUTE
-- DATA EXISTANTE EST PERDUE. Aucun cast cuid→uuid possible.
--
-- Si déployée par erreur en production avec users existants :
--   1. Toutes les sessions sont invalidées
--   2. Tous les comptes OAuth sont perdus
--   3. Restauration : depuis snapshot RDS pre-migration uniquement
--
-- Garde-fou : refuse l'application si auth_users contient des lignes.
-- ----------------------------------------------------------------------------

DO $migration_safety$
BEGIN
  IF EXISTS (SELECT 1 FROM auth_users LIMIT 1) THEN
    RAISE EXCEPTION 'Refus : auth_users contient des données. Cette migration est destructive et ne doit jamais tourner sur une DB de production. Si dev/staging avec données de test, TRUNCATE auth_users CASCADE manuellement avant.';
  END IF;
END
$migration_safety$;

/*
  Warnings (auto-générés Prisma) :

  - The primary key for the `auth_accounts` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `auth_sessions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `auth_users` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Changed the type of `id` on the `auth_accounts` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `userId` on the `auth_accounts` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `auth_sessions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `userId` on the `auth_sessions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `auth_users` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "auth_accounts" DROP CONSTRAINT "auth_accounts_userId_fkey";

-- DropForeignKey
ALTER TABLE "auth_sessions" DROP CONSTRAINT "auth_sessions_userId_fkey";

-- AlterTable
ALTER TABLE "auth_accounts" DROP CONSTRAINT "auth_accounts_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "userId",
ADD COLUMN     "userId" UUID NOT NULL,
ADD CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "auth_sessions" DROP CONSTRAINT "auth_sessions_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "userId",
ADD COLUMN     "userId" UUID NOT NULL,
ADD CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "auth_users" DROP CONSTRAINT "auth_users_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "auth_users_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "auth_accounts_userId_idx" ON "auth_accounts"("userId");

-- CreateIndex
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");

-- AddForeignKey
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
