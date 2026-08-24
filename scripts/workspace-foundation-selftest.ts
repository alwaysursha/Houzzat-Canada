/**
 * Stage 1 — Workspace foundation (structural, no runtime wiring).
 * Run: pnpm workspace-foundation:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const schema = read("prisma/schema.prisma");
const agent = read("src/lib/agent.ts");
const brokerage = read("src/lib/agent/brokerage.ts");
const leadIntake = read("src/lib/agent/lead-intake.ts");
const staffEvents = read("src/lib/notifications/staff-events.ts");
const auth = read("src/lib/auth.ts");
const middleware = read("src/middleware.ts");

function testWorkspaceSchemaExists() {
  assert.ok(schema.includes("model Workspace"));
  assert.ok(schema.includes("model WorkspaceMember"));
  assert.ok(schema.includes("enum WorkspaceStatus"));
  assert.ok(schema.includes("enum WorkspaceMemberRole"));
  assert.ok(schema.includes("enum WorkspaceMemberStatus"));
  assert.ok(schema.includes("primaryAgentId"));
  assert.ok(schema.includes("billingOwnerUserId"));
  assert.ok(schema.includes("brokerageAffiliation"));
}

function testWorkspaceMemberUniqueness() {
  assert.ok(schema.includes("@@unique([workspaceId, userId])"));
  assert.ok(schema.includes("@@index([userId])"));
  assert.ok(schema.includes("@@index([workspaceId, status])"));
}

function testWorkspaceSlugUnique() {
  assert.ok(schema.includes("slug                 String          @unique"));
}

function testWorkspaceIdScopeMatchesStage3B() {
  for (const model of [
    "model Lead",
    "model AgentTask",
    "model LeadNote",
    "model LeadEmailLog",
  ]) {
    const start = schema.indexOf(model);
    assert.ok(start > 0, model);
    const next = schema.indexOf("\nmodel ", start + 1);
    const block = schema.slice(start, next > 0 ? next : start + 2500);
    assert.match(
      block,
      /workspaceId\s+String\?/,
      `${model} must have nullable workspaceId after Stage 3B`,
    );
  }

  for (const model of [
    "model LeadActivity",
    "model Appointment",
    "model LandingPage",
    "model AdCampaign",
  ]) {
    const start = schema.indexOf(model);
    assert.ok(start > 0, model);
    const next = schema.indexOf("\nmodel ", start + 1);
    const block = schema.slice(start, next > 0 ? next : start + 2000);
    assert.ok(
      !block.includes("workspaceId"),
      `${model} must remain without workspaceId in Stage 3B`,
    );
  }
}

function testOrganizationUntouched() {
  assert.ok(schema.includes("model Organization"));
  assert.ok(schema.includes("model OrganizationMembership"));
  assert.ok(schema.includes("model OrganizationInvite"));
  assert.ok(schema.includes("organizationId  String?"), "Lead.organizationId preserved");
}

function testRuntimeWorkspaceReadFoundation() {
  const workspaceCtx = read("src/lib/workspace-context.ts");
  const readScope = read("src/lib/crm-read-scope.ts");

  assert.ok(workspaceCtx.includes("resolveWorkspaceStaffContext"));
  assert.ok(workspaceCtx.includes("workspaceMember.findMany"));
  assert.ok(readScope.includes("parseCrmReadScope"));
  assert.ok(readScope.includes("WORKSPACE_READ_SCOPE"));

  // Brokerage desk routing stays org-scoped in Stage 3F.
  assert.ok(!brokerage.includes("workspaceId"));
}

function testBrokerageAndRoutingUntouched() {
  assert.ok(brokerage.includes("syncBrokerageSeats"));
  assert.ok(brokerage.includes("ensureBrokerageOrganization"));
  assert.ok(leadIntake.includes('CRM_ROUTING_SETTINGS_ID = "default"'));
  assert.ok(leadIntake.includes("listRoutableAgents"));
  assert.ok(leadIntake.includes("resolveRoutedAssignee"));
}

function testNotificationsUntouched() {
  assert.ok(staffEvents.includes("notifyNewLeadCapturedToStaff"));
  assert.ok(staffEvents.includes("scheduleNewLeadStaffEmail"));
}

function testFkDeleteBehaviorDocumentedInSchema() {
  assert.ok(schema.includes('@relation("WorkspaceBillingOwner"'));
  assert.ok(schema.includes("onDelete: SetNull"));
  assert.ok(schema.includes("onDelete: Cascade"));
}

function testWorkspaceInviteDeferred() {
  assert.ok(
    !schema.includes("model WorkspaceInvite"),
    "WorkspaceInvite deferred — OrganizationInvite remains for current Houzzat",
  );
}

testWorkspaceSchemaExists();
testWorkspaceMemberUniqueness();
testWorkspaceSlugUnique();
testWorkspaceIdScopeMatchesStage3B();
testOrganizationUntouched();
testRuntimeWorkspaceReadFoundation();
testBrokerageAndRoutingUntouched();
testNotificationsUntouched();
testFkDeleteBehaviorDocumentedInSchema();
testWorkspaceInviteDeferred();

console.log("workspace-foundation-selftest: ok");
