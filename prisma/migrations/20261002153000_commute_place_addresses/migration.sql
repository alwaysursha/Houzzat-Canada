-- Home, work, and school addresses saved from listing drive time.
ALTER TABLE "User" ADD COLUMN "workAddress" TEXT,
ADD COLUMN "workLat" DOUBLE PRECISION,
ADD COLUMN "workLng" DOUBLE PRECISION,
ADD COLUMN "schoolAddress" TEXT,
ADD COLUMN "schoolLat" DOUBLE PRECISION,
ADD COLUMN "schoolLng" DOUBLE PRECISION;
