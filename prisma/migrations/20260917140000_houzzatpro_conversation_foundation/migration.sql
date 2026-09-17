-- HouzzatPRO permanent Agent ↔ Lead conversation foundation (additive only).
-- NOT APPLIED. Do not run prisma migrate deploy until you apply it separately.
-- No Chat UI, APIs, Twilio, notifications, media storage, or backfill in this migration.
-- ONE workspace + ONE lead = ONE conversation. Not owned by an agent.

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'BLOCKED');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('CHAT', 'SMS');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'SYSTEM_CARD');

-- CreateEnum
CREATE TYPE "MessageSenderKind" AS ENUM ('CUSTOMER', 'AGENT', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageSmsSource" AS ENUM ('TWILIO', 'MANUAL');

-- CreateEnum
CREATE TYPE "MessageRevisionAction" AS ENUM ('EDIT', 'DELETE');

-- CreateEnum
CREATE TYPE "MessageAttachmentKind" AS ENUM ('IMAGE', 'VOICE_NOTE');

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "customerLastReadAt" TIMESTAMP(3),
    "agentLastReadAt" TIMESTAMP(3),
    "agentLastReadByUserId" TEXT,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "kind" "MessageKind" NOT NULL DEFAULT 'TEXT',
    "senderKind" "MessageSenderKind" NOT NULL,
    "senderUserId" TEXT,
    "senderName" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "body" TEXT,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "replyToMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "smsSource" "MessageSmsSource",
    "twilioMessageSid" TEXT,
    "providerStatus" TEXT,
    "smsFrom" TEXT,
    "smsTo" TEXT,
    "payload" JSONB,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageRevision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "action" "MessageRevisionAction" NOT NULL,
    "body" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageAttachment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" "MessageAttachmentKind" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageReaction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_lastMessageAt_idx" ON "Conversation"("workspaceId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_leadId_idx" ON "Conversation"("leadId");

-- CreateIndex
CREATE INDEX "Conversation_agentLastReadByUserId_idx" ON "Conversation"("agentLastReadByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_workspaceId_id_key" ON "Conversation"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_workspaceId_leadId_key" ON "Conversation"("workspaceId", "leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_twilioMessageSid_key" ON "Message"("twilioMessageSid");

-- CreateIndex
CREATE INDEX "Message_workspaceId_conversationId_createdAt_idx" ON "Message"("workspaceId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_workspaceId_leadId_createdAt_idx" ON "Message"("workspaceId", "leadId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderUserId_idx" ON "Message"("senderUserId");

-- CreateIndex
CREATE INDEX "Message_createdByUserId_idx" ON "Message"("createdByUserId");

-- CreateIndex
CREATE INDEX "Message_deletedByUserId_idx" ON "Message"("deletedByUserId");

-- CreateIndex
CREATE INDEX "Message_replyToMessageId_idx" ON "Message"("replyToMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_workspaceId_id_key" ON "Message"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "MessageRevision_workspaceId_messageId_createdAt_idx" ON "MessageRevision"("workspaceId", "messageId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageRevision_actorUserId_idx" ON "MessageRevision"("actorUserId");

-- CreateIndex
CREATE INDEX "MessageAttachment_workspaceId_messageId_sortOrder_idx" ON "MessageAttachment"("workspaceId", "messageId", "sortOrder");

-- CreateIndex
CREATE INDEX "MessageReaction_workspaceId_messageId_idx" ON "MessageReaction"("workspaceId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReaction_messageId_userId_key" ON "MessageReaction"("messageId", "userId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_workspaceId_leadId_fkey" FOREIGN KEY ("workspaceId", "leadId") REFERENCES "Lead"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_agentLastReadByUserId_fkey" FOREIGN KEY ("agentLastReadByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_workspaceId_conversationId_fkey" FOREIGN KEY ("workspaceId", "conversationId") REFERENCES "Conversation"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRevision" ADD CONSTRAINT "MessageRevision_workspaceId_messageId_fkey" FOREIGN KEY ("workspaceId", "messageId") REFERENCES "Message"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRevision" ADD CONSTRAINT "MessageRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_workspaceId_messageId_fkey" FOREIGN KEY ("workspaceId", "messageId") REFERENCES "Message"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_workspaceId_messageId_fkey" FOREIGN KEY ("workspaceId", "messageId") REFERENCES "Message"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
