/**
 * One-time (idempotent) role infrastructure migration:
 *   pnpm roles:migrate
 *
 * 1) Rename Role.CUSTOMER → BUYER (if present)
 * 2) Add Role.SELLER (if missing)
 * 3) Add isBuyer / isSeller / activeMode columns
 * 4) Backfill buyer/seller flags from existing data
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  console.info("[roles:migrate] Ensuring Role enum values…");

  // Rename CUSTOMER → BUYER when the old label still exists.
  await prisma.$executeRawUnsafe(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'Role' AND e.enumlabel = 'CUSTOMER'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'Role' AND e.enumlabel = 'BUYER'
  ) THEN
    ALTER TYPE "Role" RENAME VALUE 'CUSTOMER' TO 'BUYER';
  END IF;
END $$;
`);

  await prisma.$executeRawUnsafe(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'Role' AND e.enumlabel = 'SELLER'
  ) THEN
    ALTER TYPE "Role" ADD VALUE 'SELLER';
  END IF;
END $$;
`);

  await prisma.$executeRawUnsafe(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ActiveMode') THEN
    CREATE TYPE "ActiveMode" AS ENUM ('BUYER', 'SELLER');
  END IF;
END $$;
`);

  console.info("[roles:migrate] Ensuring User profile columns…");
  await prisma.$executeRawUnsafe(`
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "isBuyer" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "isSeller" BOOLEAN NOT NULL DEFAULT false;
`);

  await prisma.$executeRawUnsafe(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'activeMode'
  ) THEN
    ALTER TABLE "User"
      ADD COLUMN "activeMode" "ActiveMode" NOT NULL DEFAULT 'BUYER';
  END IF;
END $$;
`);

  // Default role for any leftover nulls (should not happen).
  await prisma.$executeRawUnsafe(`
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'BUYER'::"Role";
`);

  console.info("[roles:migrate] Backfilling staff + consumer flags…");
  await prisma.$executeRawUnsafe(`
UPDATE "User"
SET
  "isBuyer" = false,
  "isSeller" = false,
  "activeMode" = 'BUYER'
WHERE "role" IN ('ADMIN'::"Role", 'AGENT'::"Role");
`);

  await prisma.$executeRawUnsafe(`
UPDATE "User"
SET
  "isBuyer" = true,
  "isSeller" = COALESCE("isSeller", false),
  "activeMode" = COALESCE("activeMode", 'BUYER')
WHERE "role" IN ('BUYER'::"Role", 'SELLER'::"Role");
`);

  // Valuation / seller leads → seller profile (keep buyer too)
  await prisma.$executeRawUnsafe(`
UPDATE "User" u
SET
  "isSeller" = true
WHERE "role" NOT IN ('ADMIN'::"Role", 'AGENT'::"Role")
  AND EXISTS (
  SELECT 1 FROM "Lead" lead
  WHERE lead."customerId" = u.id
    AND lead."source" = 'HOME_VALUATION'::"LeadSource"
);
`);

  // Existing FSBO owners → seller profile
  await prisma.$executeRawUnsafe(`
UPDATE "User" u
SET
  "isSeller" = true,
  "activeMode" = 'SELLER'
WHERE "role" NOT IN ('ADMIN'::"Role", 'AGENT'::"Role")
  AND (
  EXISTS (
  SELECT 1 FROM "Listing" l
  WHERE l."ownerUserId" = u.id
)
OR EXISTS (
  SELECT 1 FROM "OwnerListingOrder" o
  WHERE o."userId" = u.id
)
OR EXISTS (
  SELECT 1 FROM "OwnerListingConsent" c
  WHERE c."userId" = u.id
)
);
`);

  // Staff never carry consumer seller/buyer dashboards.
  await prisma.$executeRawUnsafe(`
UPDATE "User"
SET
  "isBuyer" = false,
  "isSeller" = false,
  "activeMode" = 'BUYER'
WHERE "role" IN ('ADMIN'::"Role", 'AGENT'::"Role");
`);

  const counts = await prisma.$queryRawUnsafe<
    Array<{ role: string; isBuyer: boolean; isSeller: boolean; n: bigint }>
  >(`
SELECT "role"::text AS role, "isBuyer", "isSeller", COUNT(*)::bigint AS n
FROM "User"
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
`);

  console.info("[roles:migrate] User distribution:");
  for (const row of counts) {
    console.info(
      `  role=${row.role} isBuyer=${row.isBuyer} isSeller=${row.isSeller} count=${row.n}`,
    );
  }

  await prisma.$disconnect();
  console.info("[roles:migrate] Done.");
}

main().catch((error) => {
  console.error("[roles:migrate] failed", error);
  process.exitCode = 1;
});
