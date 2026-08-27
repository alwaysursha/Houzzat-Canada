/**
 * Stage 3K.5.8G — read-only workspace count proof (temporary).
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import { prisma } from "../src/lib/prisma";

async function main() {
  const [houzzatWs, canaryWs] = await Promise.all([
    prisma.workspace.findUnique({
      where: { slug: "houzzat" },
      select: { id: true },
    }),
    prisma.workspace.findUnique({
      where: { slug: "tenant-canary" },
      select: { id: true },
    }),
  ]);

  const [houzzatLeads, canaryLeads, houzzatTasks, canaryTasks, legacyOrgLeads] =
    await Promise.all([
      houzzatWs
        ? prisma.lead.count({ where: { workspaceId: houzzatWs.id } })
        : 0,
      canaryWs
        ? prisma.lead.count({ where: { workspaceId: canaryWs.id } })
        : 0,
      houzzatWs
        ? prisma.agentTask.count({ where: { workspaceId: houzzatWs.id } })
        : 0,
      canaryWs
        ? prisma.agentTask.count({ where: { workspaceId: canaryWs.id } })
        : 0,
      prisma.organization
        .findUnique({ where: { slug: "demo-agent" }, select: { id: true } })
        .then((org) =>
          org ? prisma.lead.count({ where: { organizationId: org.id } }) : 0,
        ),
    ]);

  console.log(
    JSON.stringify(
      {
        workspaceScopedQueries: {
          houzzat: { leads: houzzatLeads, tasks: houzzatTasks },
          tenantCanary: { leads: canaryLeads, tasks: canaryTasks },
        },
        legacyOrgLeadCount: legacyOrgLeads,
        newPredicateWouldReturn: {
          tenantCanaryHost: { leads: canaryLeads, tasks: canaryTasks },
          houzzatHost: { leads: houzzatLeads, tasks: houzzatTasks },
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
