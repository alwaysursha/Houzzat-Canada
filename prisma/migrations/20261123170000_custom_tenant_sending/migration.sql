ALTER TABLE "WorkspaceEmailIdentity" ADD COLUMN "fromEmail" TEXT;
ALTER TABLE "WorkspaceEmailIdentity" ADD COLUMN "returnPathLabel" TEXT;
ALTER TABLE "WorkspaceEmailIdentity" ADD COLUMN "providerDomainId" TEXT;
ALTER TABLE "WorkspaceEmailIdentity" ADD COLUMN "customSendingEnabled" BOOLEAN NOT NULL DEFAULT false;
