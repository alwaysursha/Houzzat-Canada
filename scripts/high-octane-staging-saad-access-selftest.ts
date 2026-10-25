/**
 * HIGH OCTANE staging staff-access plan. No database connection.
 * Run: pnpm exec tsx scripts/high-octane-staging-saad-access-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HIGH_OCTANE_STAGING_BRANCH_ID,
  HIGH_OCTANE_STAGING_DIRECT_HOST,
  HIGH_OCTANE_STAGING_POOLED_HOST,
} from "../src/lib/tenancy/templates/high-octane-staging-launch";
import {
  HIGH_OCTANE_STAGING_SAAD_ACCESS_CONFIRMATION,
  HIGH_OCTANE_STAGING_SAAD_ACTIVATION_RISK,
  applyHighOctaneStagingSaadAccess,
  assessHighOctaneStagingSaadAccess,
  buildHighOctaneStagingSaadAccessPlan,
  createHighOctaneStagingSaadAccessWriter,
  emptySaadAccessSnapshot,
  snapshotFromInspectionRow,
  type SaadAccessSnapshot,
  type SaadAccessWriteClient,
  type SaadAccessWriter,
} from "../src/lib/tenancy/templates/high-octane-staging-saad-access";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stagingDirect = `postgresql://staging:secret@${HIGH_OCTANE_STAGING_DIRECT_HOST}/neondb`;
const stagingPooled = `postgresql://staging:secret@${HIGH_OCTANE_STAGING_POOLED_HOST}/neondb`;
const productionDirect =
  "postgresql://prod:secret@ep-snowy-river-axfgwomo.c-4.us-east-2.aws.neon.tech/neondb";
const productionPooled =
  "postgresql://prod:secret@ep-snowy-river-axfgwomo-pooler.c-4.us-east-2.aws.neon.tech/neondb";
const password = "correct-horse";

function facts(
  overrides: Partial<Parameters<typeof assessHighOctaneStagingSaadAccess>[0]> = {},
) {
  return {
    directUrl: stagingDirect,
    pooledUrl: stagingPooled,
    applicationDatabaseUrl: productionPooled,
    applicationDirectUrl: productionDirect,
    branchId: HIGH_OCTANE_STAGING_BRANCH_ID,
    transactionReadOnly: true,
    nodeEnv: "development",
    snapshot: currentSnapshot(),
    ...overrides,
  };
}

function currentSnapshot(): SaadAccessSnapshot {
  const plan = buildHighOctaneStagingSaadAccessPlan();
  return {
    workspace: {
      id: "ws-high-octane",
      slug: plan.workspaceSlug,
      status: "ACTIVE",
      hasBillingOwner: false,
      hasCurrentSubscription: false,
      themeId: "royal-collection-one:signature",
      contactEmail: plan.user.email,
      domainHostname: "localhost",
      primaryAgentEmail: plan.placeholderEmail,
      memberCount: 1,
    },
    placeholder: {
      hasPassword: false,
      role: "AGENT",
      membershipRole: "OWNER",
      membershipStatus: "ACTIVE",
    },
    saadCount: 0,
    saad: null,
  };
}

function presentSnapshot(): SaadAccessSnapshot {
  const plan = buildHighOctaneStagingSaadAccessPlan();
  const current = currentSnapshot();
  return {
    ...current,
    workspace: current.workspace
      ? {
          ...current.workspace,
          primaryAgentEmail: plan.user.email,
          memberCount: 2,
        }
      : null,
    saadCount: 1,
    saad: {
      email: plan.user.email,
      name: plan.user.name,
      role: "AGENT",
      hasPassword: true,
      workspaceSlug: plan.workspaceSlug,
      membershipRole: "OWNER",
      membershipStatus: "ACTIVE",
      phoneE164: plan.user.phoneE164,
      firstName: plan.profile.firstName,
      lastName: plan.profile.lastName,
      profilePhone: plan.profile.phone,
      markets: [...plan.profile.markets],
      isPrimaryAgent: true,
    },
  };
}

const plan = buildHighOctaneStagingSaadAccessPlan();
assert.equal(plan.workspaceSlug, "high-octane-real-estate");
assert.equal(plan.user.email, "saad@highoctaneniagara.ca");
assert.equal(plan.user.name, "Saad Qureshi");
assert.equal(plan.user.role, "AGENT");
assert.equal(plan.user.password, "caller_supplied");
assert.equal(plan.user.passwordCredentialKind, "LEGACY");
assert.equal(plan.user.phoneE164, "+12895017755");
assert.equal(plan.user.phone, "(289) 501 - 7755");
assert.equal(plan.profile.firstName, "Saad");
assert.equal(plan.profile.lastName, "Qureshi");
assert.equal(plan.profile.recoLicenseNumber, null);
assert.deepEqual(plan.profile.markets, [
  "Niagara",
  "Niagara Falls",
  "St. Catharines",
  "Niagara-on-the-Lake",
  "Welland",
  "Thorold",
  "Grimsby",
]);
assert.deepEqual(plan.membership, { role: "OWNER", status: "ACTIVE" });
assert.equal(plan.primaryAgent, "saad");
assert.equal(plan.placeholderEmail, "staging-owner@high-octane-staging.invalid");
assert.notEqual(plan.placeholderEmail, plan.user.email);
assert.equal(plan.placeholderKeepsPassword, false);
assert.equal(plan.billingOwnerUserId, null);
assert.equal(plan.subscription, "not_created");
assert.equal(plan.branding, "unchanged");
assert.equal(plan.domain, "unchanged");
assert.equal(plan.theme, "unchanged");
assert.equal(plan.professionalIdentity, "unchanged");
assert.equal(plan.activationEmail, false);
assert.equal(plan.sms, false);
assert.equal(plan.activationRisk, HIGH_OCTANE_STAGING_SAAD_ACTIVATION_RISK);
assert.deepEqual(plan.models, [
  "User",
  "AgentProfile",
  "WorkspaceMember",
  "Workspace.primaryAgentId",
]);

const ready = assessHighOctaneStagingSaadAccess(facts());
assert.equal(ready.outcome, "would_create");
assert.equal(ready.writesExecuted, false);
assert.deepEqual(ready.blockers, []);

assert.equal(
  assessHighOctaneStagingSaadAccess(facts({ snapshot: presentSnapshot() })).outcome,
  "already_present",
);
assert.equal(
  assessHighOctaneStagingSaadAccess(facts({ directUrl: productionDirect })).outcome,
  "blocked",
);
assert.equal(
  assessHighOctaneStagingSaadAccess(facts({ directUrl: productionPooled })).blockers.includes(
    "staging_direct_is_production",
  ),
  true,
);
assert.equal(
  assessHighOctaneStagingSaadAccess(facts({ branchId: "br-falling-credit-axrjacil" })).blockers.includes(
    "staging_branch_unverified",
  ),
  true,
);
assert.equal(
  assessHighOctaneStagingSaadAccess(facts({ nodeEnv: "production" })).blockers.includes(
    "production_node",
  ),
  true,
);
assert.equal(
  assessHighOctaneStagingSaadAccess(facts({ transactionReadOnly: false })).blockers.includes(
    "inspection_not_read_only",
  ),
  true,
);
assert.equal(
  assessHighOctaneStagingSaadAccess(
    facts({ directUrl: stagingDirect, applicationDirectUrl: stagingDirect }),
  ).blockers.includes("staging_direct_matches_application_url"),
  true,
);
assert.equal(
  assessHighOctaneStagingSaadAccess(facts({ snapshot: emptySaadAccessSnapshot() })).blockers.includes(
    "workspace_missing",
  ),
  true,
);

const billed = currentSnapshot();
if (billed.workspace) billed.workspace.hasBillingOwner = true;
assert.equal(
  assessHighOctaneStagingSaadAccess(facts({ snapshot: billed })).blockers.includes(
    "billing_owner_set",
  ),
  true,
);
const subscribed = currentSnapshot();
if (subscribed.workspace) subscribed.workspace.hasCurrentSubscription = true;
assert.equal(
  assessHighOctaneStagingSaadAccess(facts({ snapshot: subscribed })).blockers.includes(
    "subscription_present",
  ),
  true,
);
const passwordedPlaceholder = currentSnapshot();
if (passwordedPlaceholder.placeholder) passwordedPlaceholder.placeholder.hasPassword = true;
assert.equal(
  assessHighOctaneStagingSaadAccess(facts({ snapshot: passwordedPlaceholder })).blockers.includes(
    "placeholder_has_password",
  ),
  true,
);
const otherWorkspace = currentSnapshot();
otherWorkspace.saadCount = 1;
otherWorkspace.saad = {
  email: plan.user.email,
  name: plan.user.name,
  role: "AGENT",
  hasPassword: true,
  workspaceSlug: "houzzat",
  membershipRole: "OWNER",
  membershipStatus: "ACTIVE",
  phoneE164: plan.user.phoneE164,
  firstName: plan.profile.firstName,
  lastName: plan.profile.lastName,
  profilePhone: plan.profile.phone,
  markets: [...plan.profile.markets],
  isPrimaryAgent: false,
};
assert.equal(
  assessHighOctaneStagingSaadAccess(facts({ snapshot: otherWorkspace })).blockers.includes(
    "saad_email_other_workspace",
  ),
  true,
);
const partial = presentSnapshot();
if (partial.saad) partial.saad.hasPassword = false;
assert.equal(
  assessHighOctaneStagingSaadAccess(facts({ snapshot: partial })).blockers.includes(
    "saad_conflict",
  ),
  true,
);

const mapped = snapshotFromInspectionRow({
  report: {
    workspace: currentSnapshot().workspace,
    placeholder: currentSnapshot().placeholder,
    saadCount: 1,
    saad: { ...presentSnapshot().saad, password: "must-not-survive" },
  },
});
assert.equal(mapped.saadCount, 1);
assert.equal(mapped.saad && "password" in mapped.saad, false);

function writerFor(branchId: string, snapshot: SaadAccessSnapshot): {
  writer: SaadAccessWriter;
  calls: string[];
  created: { password?: string; role?: string; markets?: string[] };
} {
  const calls: string[] = [];
  const created: { password?: string; role?: string; markets?: string[] } = {};
  const writer: SaadAccessWriter = {
    async transaction(fn) {
      calls.push("transaction");
      const tx: SaadAccessWriteClient = {
        async readBranchId() {
          return branchId;
        },
        async query() {
          return [{ report: snapshot }];
        },
        async createUser(data) {
          calls.push("User");
          created.password = typeof data.password === "string" ? data.password : undefined;
          created.role = data.role;
          return { id: "saad-user" };
        },
        async createProfile(data) {
          calls.push("AgentProfile");
          created.markets = data.markets ? [...data.markets] : [];
          assert.equal(data.recoLicenseNumber, undefined);
        },
        async createMember(data) {
          calls.push("WorkspaceMember");
          assert.equal(data.role, "OWNER");
          assert.equal(data.status, "ACTIVE");
        },
        async setPrimaryAgent(workspaceId, userId) {
          calls.push("primaryAgent");
          assert.equal(workspaceId, snapshot.workspace?.id);
          assert.equal(userId, "saad-user");
        },
      };
      return fn(tx);
    },
  };
  return { writer, calls, created };
}

async function main(): Promise<void> {
  const hashes: string[] = [];
  const hashPassword = async (value: string) => {
    hashes.push(value);
    return "hash-sentinel";
  };
  const refused = writerFor(HIGH_OCTANE_STAGING_BRANCH_ID, currentSnapshot());
  await assert.rejects(() =>
    applyHighOctaneStagingSaadAccess({
      ...facts(),
      confirmation: "no",
      password,
      writer: refused.writer,
      hashPassword,
    }),
  );
  assert.deepEqual(refused.calls, []);
  assert.deepEqual(hashes, []);

  await assert.rejects(() =>
    applyHighOctaneStagingSaadAccess({
      ...facts(),
      confirmation: HIGH_OCTANE_STAGING_SAAD_ACCESS_CONFIRMATION,
      password: "short",
      writer: refused.writer,
      hashPassword,
    }),
  );
  assert.deepEqual(hashes, []);

  const present = writerFor(HIGH_OCTANE_STAGING_BRANCH_ID, presentSnapshot());
  const skipped = await applyHighOctaneStagingSaadAccess({
    ...facts({ snapshot: presentSnapshot() }),
    confirmation: HIGH_OCTANE_STAGING_SAAD_ACCESS_CONFIRMATION,
    password,
    writer: present.writer,
    hashPassword,
  });
  assert.equal(skipped.applied, false);
  assert.deepEqual(present.calls, []);
  assert.deepEqual(hashes, []);

  const readyWriter = writerFor(HIGH_OCTANE_STAGING_BRANCH_ID, currentSnapshot());
  const applied = await applyHighOctaneStagingSaadAccess({
    ...facts(),
    confirmation: HIGH_OCTANE_STAGING_SAAD_ACCESS_CONFIRMATION,
    password,
    writer: readyWriter.writer,
    hashPassword,
  });
  assert.equal(applied.applied, true);
  assert.deepEqual(readyWriter.calls, [
    "transaction",
    "User",
    "AgentProfile",
    "WorkspaceMember",
    "primaryAgent",
  ]);
  assert.deepEqual(hashes, [password]);
  assert.equal(readyWriter.created.password, "hash-sentinel");
  assert.notEqual(readyWriter.created.password, password);
  assert.equal(readyWriter.created.role, "AGENT");
  assert.deepEqual(readyWriter.created.markets, [...plan.profile.markets]);

  const wrongBranch = writerFor("br-other", currentSnapshot());
  await assert.rejects(() =>
    applyHighOctaneStagingSaadAccess({
      ...facts(),
      confirmation: HIGH_OCTANE_STAGING_SAAD_ACCESS_CONFIRMATION,
      password,
      writer: wrongBranch.writer,
      hashPassword,
    }),
  );
  assert.deepEqual(wrongBranch.calls, ["transaction"]);

  const echo = writerFor(HIGH_OCTANE_STAGING_BRANCH_ID, currentSnapshot());
  await assert.rejects(() =>
    applyHighOctaneStagingSaadAccess({
      ...facts(),
      confirmation: HIGH_OCTANE_STAGING_SAAD_ACCESS_CONFIRMATION,
      password,
      writer: echo.writer,
      hashPassword: async (value) => value,
    }),
  );
  assert.deepEqual(echo.calls, ["transaction"]);

  assert.throws(() => createHighOctaneStagingSaadAccessWriter(productionDirect));
  assert.throws(() => createHighOctaneStagingSaadAccessWriter(productionPooled));

  const source = readFileSync(
    join(root, "src/lib/tenancy/templates/high-octane-staging-saad-access.ts"),
    "utf8",
  );
  const script = readFileSync(join(root, "scripts/provision-high-octane-saad-access.ts"), "utf8");
  assert.equal(source.includes("stripe"), false);
  assert.equal(source.includes("resend"), false);
  assert.equal(source.includes("twilio"), false);
  assert.equal(source.includes("billingOwnerUserId:"), true);
  assert.equal(source.includes("billingOwnerUserId: user"), false);
  assert.equal(source.includes("data: { primaryAgentId: userId }"), true);
  assert.equal(source.includes("bcrypt.hash"), true);
  assert.equal(script.includes("applyHighOctaneStagingSaadAccess"), false);
  assert.equal(script.includes("createHighOctaneStagingSaadAccessWriter"), false);
  assert.equal(script.includes("BEGIN READ ONLY"), true);
  assert.equal(script.includes(password), false);
  assert.equal(source.includes(password), false);
  console.log("high-octane-staging-saad-access-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
