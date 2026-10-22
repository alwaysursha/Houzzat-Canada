/**
 * HIGH OCTANE staging provision plan. No database connection.
 * Run: pnpm exec tsx scripts/high-octane-staging-provision-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HIGH_OCTANE_STAGING_PROVISION_CONFIRMATION,
  applyHighOctaneStagingProvision,
  assessHighOctaneStagingProvision,
  createHighOctaneStagingProvisionWriter,
  emptyProvisionSnapshot,
  type ProvisionSnapshot,
  type ProvisionWriteClient,
  type ProvisionWriter,
} from "../src/lib/tenancy/templates/high-octane-staging-provision";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stagingDirect = "postgresql://staging:secret@ep-red-credit-axp65p8a.c-4.us-east-2.aws.neon.tech/neondb";
const stagingPooled = "postgresql://staging:secret@ep-red-credit-axp65p8a-pooler.c-4.us-east-2.aws.neon.tech/neondb";
const productionDirect = "postgresql://prod:secret@ep-snowy-river-axfgwomo.c-4.us-east-2.aws.neon.tech/neondb";
const productionPooled = "postgresql://prod:secret@ep-snowy-river-axfgwomo-pooler.c-4.us-east-2.aws.neon.tech/neondb";

function facts(overrides: Partial<Parameters<typeof assessHighOctaneStagingProvision>[0]> = {}) {
  return {
    directUrl: stagingDirect,
    pooledUrl: stagingPooled,
    applicationDatabaseUrl: productionPooled,
    applicationDirectUrl: productionDirect,
    branchId: "br-dark-surf-axbepvr1",
    transactionReadOnly: true,
    nodeEnv: "development",
    snapshot: emptyProvisionSnapshot(),
    ...overrides,
  };
}

const ready = assessHighOctaneStagingProvision(facts());
assert.equal(ready.outcome, "would_create");
assert.equal(ready.writesExecuted, false);
assert.equal(ready.plan.atomic, true);
assert.equal(ready.plan.workspaceSlug, "high-octane-real-estate");
assert.equal(ready.plan.workspaceName, "HIGH OCTANE Real Estate");
assert.deepEqual(ready.plan.domain, {
  hostname: "localhost",
  kind: "CUSTOM",
  role: "PRIMARY",
  status: "ACTIVE",
});
assert.equal(ready.plan.templateId, "royal-collection-one");
assert.equal(ready.plan.themeId, "royal-collection-one:signature");
assert.equal(ready.plan.catalogSelectable, false);
assert.equal(ready.plan.catalogPresentationReady, false);
assert.equal(ready.plan.publicTemplateWithoutStagingGate, "default-signature");
assert.equal(ready.plan.stagingGateTemplateId, "royal-collection-one");
assert.equal(ready.plan.productionNodeTemplateId, null);
assert.equal(ready.plan.ordinaryTenantTemplateId, null);
assert.equal(ready.plan.owner.password, null);
assert.equal(ready.plan.owner.email, "staging-owner@high-octane-staging.invalid");
assert.notEqual(ready.plan.owner.email, ready.plan.branding.contactEmail);
assert.equal(ready.plan.branding.contactEmail, "saad@highoctaneniagara.ca");
assert.equal(ready.plan.identity.agentRegisteredName, "Saad Qureshi");
assert.equal(ready.plan.identity.brokerageRegisteredName, "Right at Home Realty Brokerage");
assert.equal(ready.plan.listingConnection, false);
assert.equal(ready.plan.billingOwner, null);
assert.deepEqual(ready.plan.models, [
  "Workspace",
  "User",
  "WorkspaceMember",
  "WorkspaceBranding",
  "WorkspaceProfessionalIdentity",
  "WorkspaceDomain",
]);
assert.equal(ready.plan.models.includes("WorkspaceDataConnection"), false);

assert.equal(
  assessHighOctaneStagingProvision(facts({ directUrl: productionDirect })).outcome,
  "blocked",
);
assert.equal(
  assessHighOctaneStagingProvision(facts({ branchId: "br-other" })).outcome,
  "blocked",
);
assert.equal(
  assessHighOctaneStagingProvision(facts({ directUrl: productionPooled, applicationDatabaseUrl: productionPooled })).outcome,
  "blocked",
);
assert.equal(
  assessHighOctaneStagingProvision(facts({ nodeEnv: "production" })).outcome,
  "blocked",
);
assert.ok(
  assessHighOctaneStagingProvision(
    facts({ snapshot: { ...emptyProvisionSnapshot(), leadCount: 1 } }),
  ).blockers.includes("application_data_present"),
);
assert.equal(
  assessHighOctaneStagingProvision(
    facts({
      snapshot: {
        ...emptyProvisionSnapshot(),
        workspaceCount: 1,
        otherWorkspaceSlugs: ["houzzat"],
      },
    }),
  ).outcome,
  "blocked",
);

const present: ProvisionSnapshot = {
  workspaceCount: 1,
  userCount: 1,
  leadCount: 0,
  listingCount: 0,
  dataConnectionCount: 0,
  otherWorkspaceSlugs: [],
  publicContactUserCount: 0,
  workspace: {
    slug: "high-octane-real-estate",
    name: "HIGH OCTANE Real Estate",
    status: "ACTIVE",
    hasBillingOwner: false,
  },
  domain: {
    hostname: "localhost",
    kind: "CUSTOM",
    role: "PRIMARY",
    status: "ACTIVE",
    workspaceSlug: "high-octane-real-estate",
  },
  owner: {
    email: "staging-owner@high-octane-staging.invalid",
    hasPassword: false,
    role: "AGENT",
    workspaceSlug: "high-octane-real-estate",
  },
  branding: {
    displayName: "HIGH OCTANE Real Estate",
    themeId: "royal-collection-one:signature",
    contactEmail: "saad@highoctaneniagara.ca",
    contactPhone: "289-501-7755",
  },
  identity: {
    agentRegisteredName: "Saad Qureshi",
    agentCellPhone: "289-501-7755",
    brokerageRegisteredName: "Right at Home Realty Brokerage",
  },
  member: { role: "OWNER", status: "ACTIVE" },
};
assert.equal(assessHighOctaneStagingProvision(facts({ snapshot: present })).outcome, "already_present");

let transactions = 0;
const createdModels: string[] = [];
const writer: ProvisionWriter = {
  async transaction(fn) {
    transactions += 1;
    const tx: ProvisionWriteClient = {
      async readBranchId() {
        return "br-dark-surf-axbepvr1";
      },
      async query(sql) {
        if (sql.includes("COUNT(*)")) {
          return [
            {
              workspaceCount: 0,
              userCount: 0,
              leadCount: 0,
              listingCount: 0,
              dataConnectionCount: 0,
              count: 0,
            },
          ];
        }
        return [];
      },
      async createWorkspace() {
        createdModels.push("Workspace");
        return { id: "ws" };
      },
      async createUser(data) {
        assert.equal(data.password, null);
        assert.equal(data.email, "staging-owner@high-octane-staging.invalid");
        createdModels.push("User");
        return { id: "user" };
      },
      async setPrimaryAgent() {
        createdModels.push("Workspace.primaryAgent");
      },
      async createMember(data) {
        assert.equal(data.role, "OWNER");
        createdModels.push("WorkspaceMember");
      },
      async createBranding() {
        createdModels.push("WorkspaceBranding");
      },
      async createIdentity() {
        createdModels.push("WorkspaceProfessionalIdentity");
      },
      async createDomain(data) {
        assert.equal(data.hostname, "localhost");
        assert.equal(data.kind, "CUSTOM");
        createdModels.push("WorkspaceDomain");
      },
    };
    return fn(tx);
  },
};

async function main(): Promise<void> {
  await assert.rejects(() =>
    applyHighOctaneStagingProvision({
      ...facts(),
      confirmation: "no",
      writer,
    }),
  );
  assert.equal(transactions, 0);

  const applied = await applyHighOctaneStagingProvision({
    ...facts(),
    confirmation: HIGH_OCTANE_STAGING_PROVISION_CONFIRMATION,
    writer,
  });
  assert.equal(applied.applied, true);
  assert.equal(transactions, 1);
  assert.deepEqual(createdModels, [
    "Workspace",
    "User",
    "Workspace.primaryAgent",
    "WorkspaceMember",
    "WorkspaceBranding",
    "WorkspaceProfessionalIdentity",
    "WorkspaceDomain",
  ]);
  assert.throws(() => createHighOctaneStagingProvisionWriter(productionDirect));

  const script = readFileSync(join(root, "scripts/provision-high-octane-staging.ts"), "utf8");
  const provisionSource = readFileSync(
    join(root, "src/lib/tenancy/templates/high-octane-staging-provision.ts"),
    "utf8",
  );
  assert.equal(script.includes("applyHighOctaneStagingProvision"), false);
  assert.equal(script.includes("createHighOctaneStagingProvisionWriter"), false);
  assert.equal(script.includes("BEGIN READ ONLY"), true);
  assert.equal(provisionSource.includes("provisionPaidSubscription"), false);
  assert.equal(provisionSource.includes("WorkspaceDataConnection"), true);
  assert.equal(provisionSource.includes("workspaceDataConnection.create"), false);
  assert.equal(provisionSource.includes("stripe"), false);
  assert.equal(script.includes("migrate"), false);
  console.log("high-octane-staging-provision-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
