-- CreateEnum
CREATE TYPE "ConversationParticipant" AS ENUM ('conseiller', 'voyageur');

-- CreateEnum
CREATE TYPE "ConversationNotifStatus" AS ENUM ('pending', 'sent', 'failed');

-- DropForeignKey
ALTER TABLE "matching_result_entries" DROP CONSTRAINT "fk_matching_result_entries_result";

-- AlterTable
ALTER TABLE "consumed_matching_events" ALTER COLUMN "consumedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "lead_notification_outbox" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "sentAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "lead_transitions" ALTER COLUMN "occurredAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "leads" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "matching_audit_entries" ALTER COLUMN "occurredAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "matching_outbox_entries" ALTER COLUMN "publishedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "matching_result_entries" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "matching_results" ALTER COLUMN "computedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "supersededAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "conseillerId" UUID NOT NULL,
    "briefId" UUID,
    "voyageurRef" VARCHAR(255),
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "author" "ConversationParticipant" NOT NULL,
    "body" TEXT,
    "idempotencyKey" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_attachments" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(127) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "s3Key" VARCHAR(512) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending_upload',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "conversation_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_notification_outbox" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "recipient" "ConversationParticipant" NOT NULL,
    "idempotencyKey" VARCHAR(255) NOT NULL,
    "status" "ConversationNotifStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "conversation_notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumed_conversation_events" (
    "idempotencyKey" VARCHAR(255) NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumed_conversation_events_pkey" PRIMARY KEY ("idempotencyKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_leadId_key" ON "conversations"("leadId");

-- CreateIndex
CREATE INDEX "conversations_conseillerId_idx" ON "conversations"("conseillerId");

-- CreateIndex
CREATE INDEX "conversations_briefId_idx" ON "conversations"("briefId");

-- CreateIndex
CREATE INDEX "conversation_messages_conversationId_createdAt_idx" ON "conversation_messages"("conversationId", "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "conversation_messages_conversationId_idempotencyKey_key" ON "conversation_messages"("conversationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "conversation_attachments_messageId_idx" ON "conversation_attachments"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_notification_outbox_idempotencyKey_key" ON "conversation_notification_outbox"("idempotencyKey");

-- CreateIndex
CREATE INDEX "conversation_notification_outbox_status_createdAt_idx" ON "conversation_notification_outbox"("status", "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "conversation_notification_outbox_messageId_recipient_key" ON "conversation_notification_outbox"("messageId", "recipient");

-- CreateIndex
CREATE INDEX "matching_outbox_entries_createdAt_idx" ON "matching_outbox_entries"("createdAt" ASC);

-- AddForeignKey
ALTER TABLE "matching_result_entries" ADD CONSTRAINT "matching_result_entries_matchingResultId_fkey" FOREIGN KEY ("matchingResultId") REFERENCES "matching_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_attachments" ADD CONSTRAINT "conversation_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "conversation_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_notification_outbox" ADD CONSTRAINT "conversation_notification_outbox_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "conversation_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
