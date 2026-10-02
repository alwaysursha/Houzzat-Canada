-- Cached drive legs and the monthly Routes free-cap counter.
CREATE TABLE "GoogleRouteUsage" (
    "month" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "GoogleRouteUsage_pkey" PRIMARY KEY ("month")
);

CREATE TABLE "DriveRouteCache" (
    "id" TEXT NOT NULL,
    "originKey" TEXT NOT NULL,
    "destKey" TEXT NOT NULL,
    "distanceMeters" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "encodedPolyline" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriveRouteCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DriveRouteCache_originKey_destKey_key" ON "DriveRouteCache"("originKey", "destKey");
