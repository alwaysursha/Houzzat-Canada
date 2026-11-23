/**
 * Manual tenant onboarding. No database and no Stripe session.
 * Run: pnpm exec tsx scripts/manual-tenant-onboarding-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import {
  deriveManualOnboardingIndicators,
  prepareManualTenantWorkspace,
  PREPARE_TENANT_WORKSPACE_AUTHORIZATION,
} from "../src/lib/platform/onboarding/manual-tenant";
import {
  checkoutCompletionIsDuplicate,
  ownerActivationSuppressedForPreparedPayment,
  placeholderSubscriptionCanBeSuperseded,
  selectProvisionWorkspaceTarget,
  workspaceStatusAfterPaidProvision,
} from "../src/lib/platform/onboarding/prepared-workspace";
import { ProvisioningActionError } from "../src/lib/platform/provisioning/errors";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
const reused = await prepareManualTenantWorkspace({
  prisma: fakePrisma({
    workspace: {
      id: "ws_high_octane",
      slug: "high-octane-real-estate",
      name: "HIGH OCTANE Real Estate",
      status: "ACTIVE",
      currentSubscription: {
        id: "sub_internal",
        source: "INTERNAL",
        stripeSubscriptionId: null,
        stripeCheckoutSessionId: null,
        commercialSnapshotJson: { kind: "COMPLIMENTARY" },
      },
      members: [{ user: { email: "saad@highoctaneniagara.ca" } }],
    },
  }),
  operatorId: "op_admin",
  authorization: PREPARE_TENANT_WORKSPACE_AUTHORIZATION,
  workspaceId: "ws_high_octane",
  createIfMissing: async () => {
    throw new Error("existing workspace must not be created again");
  },
});
assert.equal(reused.outcome, "reused");
assert.equal(reused.workspaceId, "ws_high_octane");
assert.equal(reused.emailSent, false);
assert.equal(reused.paymentInvitationSent, false);
assert.equal(reused.ownerActivationSent, false);

let createdCalls = 0;
const created = await prepareManualTenantWorkspace({
  prisma: fakePrisma({ workspace: null }),
  operatorId: "op_admin",
  authorization: PREPARE_TENANT_WORKSPACE_AUTHORIZATION,
  slug: "new-brokerage",
  displayName: "New Brokerage",
  ownerName: "Owner",
  ownerEmail: "owner@example.com",
  ownerPhone: "2895550100",
  brokerageName: "New Brokerage",
  planCode: "TEAM",
  createIfMissing: async () => {
    createdCalls += 1;
    return {
      outcome: "created",
      workspaceId: "ws_new",
      slug: "new-brokerage",
      hostname: "new-brokerage.houzzatpro.com",
      ownerUserId: "user_new",
      subscriptionId: "sub_new",
      subscriptionSource: "INTERNAL",
      themeId: null,
      emailSent: false,
      passwordCopied: false,
    };
  },
});
assert.equal(createdCalls, 1);
assert.equal(created.outcome, "created");
assert.equal(created.emailSent, false);

await assert.rejects(
  () =>
    prepareManualTenantWorkspace({
      prisma: fakePrisma({
        workspace: {
          id: "ws_other",
          slug: "other",
          name: "Other Brokerage",
          status: "ACTIVE",
          currentSubscription: null,
          members: [{ user: { email: "other@example.com" } }],
        },
      }),
      operatorId: "op_admin",
      authorization: PREPARE_TENANT_WORKSPACE_AUTHORIZATION,
      workspaceId: "ws_other",
      displayName: "HIGH OCTANE Real Estate",
      ownerEmail: "saad@highoctaneniagara.ca",
      createIfMissing: async () => {
        throw new Error("mismatched identity must not create a workspace");
      },
    }),
  (error: unknown) =>
    error instanceof ProvisioningActionError && error.code === "EXISTING_TENANT",
);

assert.deepEqual(
  selectProvisionWorkspaceTarget({
    runWorkspaceId: null,
    subscriptionWorkspaceId: null,
    offerWorkspaceId: "ws_high_octane",
  }),
  { kind: "existing", workspaceId: "ws_high_octane" },
);
assert.deepEqual(
  selectProvisionWorkspaceTarget({
    runWorkspaceId: null,
    subscriptionWorkspaceId: null,
    offerWorkspaceId: null,
  }),
  { kind: "create" },
);
assert.equal(
  selectProvisionWorkspaceTarget({
    runWorkspaceId: null,
    subscriptionWorkspaceId: "ws_other",
    offerWorkspaceId: "ws_high_octane",
  }).kind,
  "conflict",
);
assert.equal(
  placeholderSubscriptionCanBeSuperseded({
    source: "INTERNAL",
    stripeSubscriptionId: null,
    stripeCheckoutSessionId: null,
  }),
  true,
);
assert.equal(
  placeholderSubscriptionCanBeSuperseded({
    source: "STRIPE",
    stripeSubscriptionId: null,
    stripeCheckoutSessionId: null,
  }),
  false,
);
assert.equal(
  workspaceStatusAfterPaidProvision({
    currentStatus: "ACTIVE",
    subscriptionStatus: "TRIALING",
  }),
  "ACTIVE",
);
assert.equal(
  workspaceStatusAfterPaidProvision({
    currentStatus: "TRIAL",
    subscriptionStatus: "TRIALING",
  }),
  "TRIAL",
);
assert.equal(
  ownerActivationSuppressedForPreparedPayment({
    preparedWorkspaceId: "ws_high_octane",
  }),
  true,
);
assert.equal(ownerActivationSuppressedForPreparedPayment({ stage: "6.8B" }), false);
assert.equal(
  checkoutCompletionIsDuplicate({
    status: "ACTIVE",
    stripeSubscriptionId: "sub_123",
    stripeCheckoutSessionId: "cs_123",
    incomingSubscriptionId: "sub_123",
    incomingSessionId: "cs_123",
  }),
  true,
);
assert.equal(
  checkoutCompletionIsDuplicate({
    status: "PENDING_PAYMENT",
    stripeSubscriptionId: "sub_123",
    stripeCheckoutSessionId: "cs_123",
    incomingSubscriptionId: "sub_123",
    incomingSessionId: "cs_123",
  }),
  false,
);

const indicators = await deriveManualOnboardingIndicators({
  prisma: fakePrisma({
    workspace: {
      id: "ws_high_octane",
      slug: "high-octane-real-estate",
      name: "HIGH OCTANE Real Estate",
      status: "ACTIVE",
      currentSubscription: {
        id: "sub_internal",
        source: "INTERNAL",
        status: "ACTIVE",
        stripeSubscriptionId: null,
        stripeCheckoutSessionId: null,
        commercialSnapshotJson: null,
      },
      members: [{ user: { email: "saad@highoctaneniagara.ca" } }],
      domains: [{ kind: "PLATFORM", status: "ACTIVE" }],
      emailIdentity: { domainStatus: "NONE" },
      dataConnections: [],
      ownerActivations: [],
    },
  }),
  workspaceId: "ws_high_octane",
  env: { NODE_ENV: "production", VERCEL_ENV: "production" },
});
assert.deepEqual(
  indicators.map((item) => `${item.label}: ${item.value}`),
  [
    "Workspace: Prepared",
    "Website: Deployed",
    "Demo Listings: Disabled",
    "TRREB: Pending",
    "Custom Domain: Pending",
    "Email Domain: Pending",
    "Payment: Pending",
    "Owner Invitation: Not Sent",
  ],
);

const prepareSource = readFileSync(
  join(root, "src/lib/platform/onboarding/manual-tenant.ts"),
  "utf8",
);
const prepareFn = prepareSource.slice(
  prepareSource.indexOf("export async function prepareManualTenantWorkspace"),
  prepareSource.indexOf("export async function prepareCommercialOfferForWorkspace"),
);
assert.equal(prepareFn.includes("notifyOfferInvitationEmail"), false);
assert.equal(prepareFn.includes("sendCommercialOffer"), false);
assert.equal(prepareFn.includes("sendOwnerActivationEmail"), false);
const offerFn = prepareSource.slice(
  prepareSource.indexOf("export async function prepareCommercialOfferForWorkspace"),
  prepareSource.indexOf("export async function sendPreparedPaymentInvitation"),
);
assert.equal(offerFn.includes("notifyOfferInvitationEmail"), false);
assert.equal(offerFn.includes("sendCommercialOffer"), false);
assert.equal(offerFn.includes("createDraftCommercialOffer"), false);

const checkout = readFileSync(
  join(root, "src/lib/platform/billing/checkout.ts"),
  "utf8",
);
assert.equal(checkout.includes("preparedWorkspaceId: offer.workspaceId"), true);
const steps = readFileSync(
  join(root, "src/lib/platform/provisioning/steps.ts"),
  "utf8",
);
assert.equal(steps.includes("selectProvisionWorkspaceTarget"), true);
assert.ok(
  steps.indexOf("selectProvisionWorkspaceTarget") < steps.indexOf("allocateUniqueWorkspaceSlug"),
);

console.log("manual-tenant-onboarding-selftest: ok");
}

void main();

function fakePrisma(input: {
  workspace: Record<string, unknown> | null;
}): PrismaClient {
  const subscription = input.workspace?.currentSubscription as
    | { id: string; commercialSnapshotJson: unknown }
    | null
    | undefined;
  const db = {
    platformOperator: {
      async findUnique() {
        return { role: "MASTER_ADMIN", status: "ACTIVE" };
      },
    },
    workspace: {
      async findUnique(args: { where: { id?: string; slug?: string } }) {
        const workspace = input.workspace;
        if (!workspace) return null;
        if (args.where.id && workspace.id !== args.where.id) return null;
        if (args.where.slug && workspace.slug !== args.where.slug) return null;
        return workspace;
      },
    },
    subscription: {
      async findUnique() {
        return subscription ?? null;
      },
      async update(args: { data: { commercialSnapshotJson: unknown } }) {
        if (subscription) {
          subscription.commercialSnapshotJson = args.data.commercialSnapshotJson;
        }
        return subscription;
      },
    },
    platformAuditEvent: {
      async create() {
        return { id: "audit_1" };
      },
    },
  };
  return db as unknown as PrismaClient;
}
