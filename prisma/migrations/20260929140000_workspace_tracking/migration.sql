-- Public website tracking tags, one row per workspace.
-- Not WorkspaceBranding. Blank IDs load no tag.
-- Seeds Houzzat's existing GA4 property. Other workspaces stay untagged.

CREATE TABLE "WorkspaceTracking" (
    "workspaceId" TEXT NOT NULL,
    "ga4MeasurementId" TEXT,
    "googleAdsId" TEXT,
    "metaPixelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceTracking_pkey" PRIMARY KEY ("workspaceId")
);

ALTER TABLE "WorkspaceTracking"
  ADD CONSTRAINT "WorkspaceTracking_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "WorkspaceTracking" (
    "workspaceId",
    "ga4MeasurementId",
    "createdAt",
    "updatedAt"
)
SELECT "id", 'G-H6JNE333QF', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Workspace"
WHERE "slug" = 'houzzat'
ON CONFLICT ("workspaceId") DO NOTHING;
