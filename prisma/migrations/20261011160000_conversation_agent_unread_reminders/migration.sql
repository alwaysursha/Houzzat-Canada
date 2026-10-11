-- Chat V1 Milestone 4Q — durable agent unread-reminder dedupe on Conversation.
-- Additive only: nullable columns, no defaults, indexes, or constraints.
-- Does not modify unapplied typing / presence / quick-reply migrations.

ALTER TABLE "Conversation" ADD COLUMN "agentUnreadReminderMessageId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "agentUnreadReminderAgentId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "agentUnreadRemindedAt" TIMESTAMP(3);
