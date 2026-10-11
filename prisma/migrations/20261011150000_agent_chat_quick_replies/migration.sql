-- Chat V1 Milestone 4M — agent-owned native CHAT quick replies.
-- Additive only: new table + FKs + indexes.
-- Does not alter SmsQuickText, Conversation, AgentProfile, Message, or routing.
-- Does not modify unapplied typing / presence migrations.

CREATE TABLE "AgentChatQuickReply" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentChatQuickReply_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentChatQuickReply_workspaceId_userId_sortOrder_idx"
  ON "AgentChatQuickReply"("workspaceId", "userId", "sortOrder");

CREATE INDEX "AgentChatQuickReply_userId_idx"
  ON "AgentChatQuickReply"("userId");

ALTER TABLE "AgentChatQuickReply"
  ADD CONSTRAINT "AgentChatQuickReply_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentChatQuickReply"
  ADD CONSTRAINT "AgentChatQuickReply_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
