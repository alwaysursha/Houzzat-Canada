-- MLS health incidents and the single photo/retry baseline.
-- Written by the health checker. Sync jobs do not read or write these tables.

CREATE TABLE "MlsHealthIncident" (
    "signal" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "recoveredAt" TIMESTAMP(3),
    "lastObservedAt" TIMESTAMP(3) NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "reminded" BOOLEAN NOT NULL DEFAULT false,
    "summary" TEXT NOT NULL,
    "detail" JSONB,

    CONSTRAINT "MlsHealthIncident_pkey" PRIMARY KEY ("signal")
);

CREATE TABLE "MlsHealthSample" (
    "id" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL,
    "activeZeroPhotos" INTEGER NOT NULL,
    "zeroPhotoBaseline" INTEGER NOT NULL,
    "zeroPhotoElevatedStreak" INTEGER NOT NULL DEFAULT 0,
    "reconcileRetryCount" INTEGER NOT NULL DEFAULT 0,
    "reconcileRetryHighSince" TIMESTAMP(3),

    CONSTRAINT "MlsHealthSample_pkey" PRIMARY KEY ("id")
);
