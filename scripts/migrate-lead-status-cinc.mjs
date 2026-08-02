/**
 * Migrate Lead.status to CINC pipeline enum + add statusChangedAt.
 * Usage: node --env-file=.env.local scripts/migrate-lead-status-cinc.mjs
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const useNeon =
  process.env.USE_NEON_ADAPTER === "1" ||
  url.includes("neon.tech") ||
  url.includes("neon.database");

const adapter = useNeon
  ? new PrismaNeon({ connectionString: url })
  : new PrismaPg({ connectionString: url });

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Migrating LeadStatus → CINC pipeline…");

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "LeadStatus_new" AS ENUM (
        'NEW_LEAD',
        'ATTEMPTED_CONTACT',
        'CONTACTED',
        'APPT_SET',
        'APPT_MET',
        'ACTIVE_CLIENT',
        'PENDING_CLIENT',
        'PAST_CLIENT'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Lead" ALTER COLUMN "status" DROP DEFAULT;
  `);

  // If already migrated, column may already be LeadStatus_new — skip remap.
  const col = await prisma.$queryRawUnsafe(`
    SELECT udt_name::text AS udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Lead'
      AND column_name = 'status'
    LIMIT 1;
  `);
  const udt = col?.[0]?.udt_name;
  console.log("status udt:", udt);

  if (udt === "LeadStatus") {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Lead"
      ALTER COLUMN "status" TYPE "LeadStatus_new"
      USING (
        CASE "status"::text
          WHEN 'NEW' THEN 'NEW_LEAD'
          WHEN 'CONTACTED' THEN 'CONTACTED'
          WHEN 'QUALIFIED' THEN 'ATTEMPTED_CONTACT'
          WHEN 'ACTIVE_BUYER' THEN 'ACTIVE_CLIENT'
          WHEN 'ACTIVE_SELLER' THEN 'ACTIVE_CLIENT'
          WHEN 'CLIENT' THEN 'ACTIVE_CLIENT'
          WHEN 'SHOWING' THEN 'APPT_SET'
          WHEN 'OFFER' THEN 'PENDING_CLIENT'
          WHEN 'NURTURE' THEN 'PENDING_CLIENT'
          WHEN 'LOST' THEN 'PAST_CLIENT'
          WHEN 'NEW_LEAD' THEN 'NEW_LEAD'
          WHEN 'ATTEMPTED_CONTACT' THEN 'ATTEMPTED_CONTACT'
          WHEN 'APPT_SET' THEN 'APPT_SET'
          WHEN 'APPT_MET' THEN 'APPT_MET'
          WHEN 'ACTIVE_CLIENT' THEN 'ACTIVE_CLIENT'
          WHEN 'PENDING_CLIENT' THEN 'PENDING_CLIENT'
          WHEN 'PAST_CLIENT' THEN 'PAST_CLIENT'
          ELSE 'NEW_LEAD'
        END::"LeadStatus_new"
      );
    `);

    await prisma.$executeRawUnsafe(`DROP TYPE "LeadStatus";`);
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "LeadStatus_new" RENAME TO "LeadStatus";`,
    );
  } else if (udt === "LeadStatus_new") {
    await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "LeadStatus";`);
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "LeadStatus_new" RENAME TO "LeadStatus";`,
    );
  }

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Lead"
    ALTER COLUMN "status" SET DEFAULT 'NEW_LEAD'::"LeadStatus";
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Lead"
    ADD COLUMN IF NOT EXISTS "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE "Lead"
    SET "statusChangedAt" = "updatedAt"
    WHERE "statusChangedAt" IS NULL OR "statusChangedAt" = "createdAt";
  `);

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
