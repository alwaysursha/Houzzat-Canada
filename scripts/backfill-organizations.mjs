/**
 * One-shot: create a personal Organization for each AGENT/ADMIN user,
 * attach orphan leads, assign unassigned leads to the oldest org.
 *
 * Usage: node --env-file=.env.local scripts/backfill-organizations.mjs
 * (or rely on DATABASE_URL in the environment)
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

function slugify(input) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "team"
  );
}

async function uniqueSlug(base) {
  let slug = base;
  let n = 0;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

async function main() {
  const agents = await prisma.user.findMany({
    where: { role: { in: ["AGENT", "ADMIN"] } },
    select: { id: true, email: true, name: true, role: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Agents/admins: ${agents.length}`);

  for (const user of agents) {
    const existing = await prisma.organizationMembership.findFirst({
      where: { userId: user.id },
    });
    if (existing) {
      await prisma.lead.updateMany({
        where: { assignedAgentId: user.id, organizationId: null },
        data: { organizationId: existing.organizationId },
      });
      continue;
    }

    const slug = await uniqueSlug(
      slugify(user.name || user.email.split("@")[0] || "agent"),
    );
    const org = await prisma.organization.create({
      data: {
        name: user.name ? `${user.name}'s team` : "My team",
        slug,
        memberships: {
          create: { userId: user.id, role: "OWNER" },
        },
      },
    });
    const attached = await prisma.lead.updateMany({
      where: { assignedAgentId: user.id, organizationId: null },
      data: { organizationId: org.id },
    });
    console.log(`Created org ${org.slug} for ${user.email} (+${attached.count} leads)`);
  }

  const defaultOrg = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (defaultOrg) {
    const orphans = await prisma.lead.updateMany({
      where: { organizationId: null },
      data: { organizationId: defaultOrg.id },
    });
    console.log(
      `Attached ${orphans.count} orphan leads to ${defaultOrg.slug}`,
    );
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
