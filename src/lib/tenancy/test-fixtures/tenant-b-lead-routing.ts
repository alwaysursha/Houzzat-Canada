/**
 * Stage 3K.5.7 — TEST-ONLY Tenant B lead routing fixture (no production writes).
 */
import type { LeadIntent } from "@prisma/client";
import type { DomainLookupRow } from "@/lib/tenancy/resolve-workspace-host";
import type { WorkspaceLeadDeskFixture } from "@/lib/workspace-lead-desk";
import {
  TENANT_B_TEST_DISPLAY_NAME,
  TENANT_B_TEST_WORKSPACE_ID,
} from "@/lib/tenancy/test-fixtures/tenant-b-brand";

export const HOUZZAT_FIXTURE_WORKSPACE_ID = "ws_houzzat_fixture";
export const HOUZZAT_FIXTURE_ORG_ID = "org_houzzat_fixture";
export const TENANT_B_FIXTURE_ORG_ID = "org_tenant_b_compat_fixture";
export const TENANT_B_FIXTURE_AGENT_ID = "agent_tenant_b_fixture";
export const TENANT_B_FIXTURE_OWNER_ID = "owner_tenant_b_fixture";

export const TENANT_B_LEAD_ROUTING_FIXTURE_ROWS: DomainLookupRow[] = [
  {
    hostname: "houzzat.com",
    kind: "CUSTOM",
    role: "PRIMARY",
    workspaceId: HOUZZAT_FIXTURE_WORKSPACE_ID,
    workspaceSlug: "houzzat",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "tenant-canary.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: TENANT_B_TEST_WORKSPACE_ID,
    workspaceSlug: "tenant-canary",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
];

export function createTenantBLeadRoutingFixture(): WorkspaceLeadDeskFixture {
  const routableByWorkspace = new Map<string, Array<{ id: string }>>([
    [HOUZZAT_FIXTURE_WORKSPACE_ID, [{ id: "agent_houzzat_fixture" }]],
    [
      TENANT_B_TEST_WORKSPACE_ID,
      [{ id: TENANT_B_FIXTURE_AGENT_ID }],
    ],
  ]);
  const assigneeByWorkspaceIntent = new Map<string, string | null>([
    [`${HOUZZAT_FIXTURE_WORKSPACE_ID}:BUYER`, "agent_houzzat_fixture"],
    [`${HOUZZAT_FIXTURE_WORKSPACE_ID}:SELLER`, "agent_houzzat_fixture"],
    [`${TENANT_B_TEST_WORKSPACE_ID}:BUYER`, TENANT_B_FIXTURE_AGENT_ID],
    [`${TENANT_B_TEST_WORKSPACE_ID}:SELLER`, TENANT_B_FIXTURE_AGENT_ID],
  ]);

  return {
    lookupWorkspace: async (workspaceId) => {
      if (workspaceId === HOUZZAT_FIXTURE_WORKSPACE_ID) {
        return { slug: "houzzat", status: "ACTIVE" };
      }
      if (workspaceId === TENANT_B_TEST_WORKSPACE_ID) {
        return { slug: "tenant-canary", status: "ACTIVE" };
      }
      return null;
    },
    lookupCompatOrg: async () => ({
      id: TENANT_B_FIXTURE_ORG_ID,
      slug: "demo-agent",
    }),
    lookupHouzzatBrokerageOrg: async () => ({ id: HOUZZAT_FIXTURE_ORG_ID }),
    listRoutableAgents: async (workspaceId) =>
      routableByWorkspace.get(workspaceId) ?? [],
    resolveWorkspaceAssignee: async (workspaceId, intent: LeadIntent) =>
      assigneeByWorkspaceIntent.get(`${workspaceId}:${intent}`) ?? null,
  };
}

export const TENANT_B_LEAD_ROUTING_FIXTURE_SUMMARY = {
  workspaceId: TENANT_B_TEST_WORKSPACE_ID,
  displayName: TENANT_B_TEST_DISPLAY_NAME,
  organizationId: TENANT_B_FIXTURE_ORG_ID,
  agentId: TENANT_B_FIXTURE_AGENT_ID,
  ownerId: TENANT_B_FIXTURE_OWNER_ID,
  houzzatWorkspaceId: HOUZZAT_FIXTURE_WORKSPACE_ID,
  houzzatOrganizationId: HOUZZAT_FIXTURE_ORG_ID,
} as const;
