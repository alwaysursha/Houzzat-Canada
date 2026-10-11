-- Chat V1 Milestone 4 — ephemeral typing indicators on Conversation.
-- Additive only: nullable columns, no defaults, indexes, or constraints.

ALTER TABLE "Conversation" ADD COLUMN "customerTypingUntil" TIMESTAMP(3);
ALTER TABLE "Conversation" ADD COLUMN "agentTypingUntil" TIMESTAMP(3);
