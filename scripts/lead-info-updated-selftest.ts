/**
 * Lead Info Updated + Home Valuation prefill / canonical contact patch.
 * Run: pnpm lead-info-updated:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyCanonicalCustomerContact,
  buildCanonicalCustomerPatch,
  composeCustomerDisplayName,
  dedupeLeadInfoChanges,
  diffLeadClassificationChanges,
  formatLeadInfoUpdatedSummary,
  phonesSemanticallyEqual,
  splitCustomerDisplayName,
  type CanonicalCustomerSnapshot,
} from "../src/lib/agent/lead-info-change";
import { deliverLeadInfoUpdatedNotice } from "../src/lib/notifications/staff-events";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const current: CanonicalCustomerSnapshot = {
  id: "user_omer",
  name: "Omer Ali",
  email: "omer@example.com",
  phone: "(416) 555-0100",
  phoneE164: "+14165550100",
  homeAddress: "10 King St W, Toronto",
  homeLat: 43.65,
  homeLng: -79.38,
};

function testPrefillSplitAndCompose() {
  const split = splitCustomerDisplayName("Omer Ali");
  assert.equal(split.firstName, "Omer");
  assert.equal(split.lastName, "Ali");
  assert.equal(composeCustomerDisplayName("Omer", "Ali"), "Omer Ali");
}

function testBlanksDoNotErase() {
  const patch = buildCanonicalCustomerPatch(current, {
    firstName: "",
    lastName: "",
    email: "  ",
    phone: "",
    homeAddress: "   ",
  });
  assert.deepEqual(patch.data, {});
  assert.equal(patch.changes.length, 0);
}

function testE164NoOpIsNotAChange() {
  assert.equal(
    phonesSemanticallyEqual(current, "416-555-0100"),
    true,
  );
  const patch = buildCanonicalCustomerPatch(current, {
    phone: "4165550100",
  });
  assert.equal(patch.changes.length, 0);
}

function testMaterialContactDiffs() {
  const patch = buildCanonicalCustomerPatch(current, {
    firstName: "Omer",
    lastName: "Ali-Syed",
    email: "omer.new@example.com",
    phone: "647-555-0199",
    homeAddress: "20 Queen St W, Toronto",
  });
  assert.deepEqual(
    patch.changes.map((c) => c.kind).sort(),
    ["cellphone", "email", "homeAddress", "name"],
  );
  assert.equal(patch.data.phoneE164, "+16475550199");
}

function testBuyerSellerFlagDiffs() {
  const buyerToBoth = diffLeadClassificationChanges(
    { isBuyer: true, isSeller: false, intent: "BUYER" },
    { isBuyer: true, isSeller: true, intent: "SELLER" },
  );
  assert.deepEqual(
    buyerToBoth.map((c) => c.label),
    ["Seller interest added"],
  );

  const sellerToBoth = diffLeadClassificationChanges(
    { isBuyer: false, isSeller: true, intent: "SELLER" },
    { isBuyer: true, isSeller: true, intent: "SELLER" },
  );
  assert.deepEqual(
    sellerToBoth.map((c) => c.label),
    ["Buyer interest added"],
  );

  const unchanged = diffLeadClassificationChanges(
    { isBuyer: true, isSeller: true },
    { isBuyer: true, isSeller: true },
  );
  assert.equal(unchanged.length, 0);
}

function testSummaryCopy() {
  assert.equal(
    formatLeadInfoUpdatedSummary("Omer Ali", [
      "Seller interest added",
      "Cellphone updated",
    ]),
    "Omer Ali updated their lead information: Seller interest added, Cellphone updated.",
  );
}

async function testApplySkipsEmailTakeover() {
  const users = new Map<string, CanonicalCustomerSnapshot>([
    ["user_omer", { ...current }],
    [
      "user_other",
      {
        id: "user_other",
        name: "Other",
        email: "taken@example.com",
        phone: null,
        phoneE164: null,
        homeAddress: null,
      },
    ],
  ]);
  const db = {
    user: {
      async findUnique(args: {
        where: { id?: string; email?: string };
        select?: Record<string, boolean>;
      }) {
        if (args.where.id) return users.get(args.where.id) ?? null;
        if (args.where.email) {
          return (
            [...users.values()].find((u) => u.email === args.where.email) ?? null
          );
        }
        return null;
      },
      async update() {
        throw new Error("must not write on conflict");
      },
    },
  };
  const result = await applyCanonicalCustomerContact(
    db as Pick<import("@prisma/client").PrismaClient, "user">,
    "user_omer",
    {
      email: "taken@example.com",
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 409);
}

async function testOneLogicalNotificationAndFailureIsolation() {
  const pushes: unknown[] = [];
  const notifies: unknown[] = [];
  let pushShouldThrow = false;

  const resultOk = await deliverLeadInfoUpdatedNotice(
    {
      leadId: "lead_canonical",
      assignedAgentId: "agent_houzzat",
      clientLabel: "Omer Ali",
      labels: ["Seller interest added", "Cellphone updated"],
      actorUserId: "user_omer",
    },
    {
      schedule: (work) => {
        void work;
      },
      authorizeStaffRecipientForLead: async (input) =>
        input.userId === "agent_houzzat" && input.leadId === "lead_canonical",
      loadLead: async () => ({
        id: "lead_canonical",
        workspaceId: "ws_houzzat",
        assignedAgentId: "agent_houzzat",
        customer: { name: "Omer Ali", email: "omer@example.com" },
      }),
      loadAgent: async () => ({
        id: "agent_houzzat",
        email: "agent@houzzat.ca",
        phone: "416-555-0001",
        phoneE164: "+14165550001",
        disabledAt: null,
        role: "AGENT",
        pushNotificationPrefs: {},
      }),
      writeActivity: async () => undefined,
      sendPushToUser: (userId, payload) => {
        if (pushShouldThrow) throw new Error("push down");
        pushes.push({ userId, payload });
      },
      sendNotification: async (payload) => {
        notifies.push(payload);
        return { email: "sent", sms: "sent", whatsapp: "skipped" };
      },
    },
  );
  assert.deepEqual(resultOk.attempted, { push: true, email: true, sms: true });
  assert.equal(pushes.length, 1);
  assert.equal(notifies.length, 1);
  const pushPayload = pushes[0] as {
    userId: string;
    payload: { type: string; body: string };
  };
  assert.equal(pushPayload.userId, "agent_houzzat");
  assert.equal(pushPayload.payload.type, "lead_info_updated");
  assert.ok(!String(pushPayload.payload.body).includes("416"));
  const notifyPayload = notifies[0] as {
    smsClass?: string;
    smsText?: string;
    html?: string;
  };
  assert.equal(notifyPayload.smsClass, "staff");
  assert.ok(notifyPayload.smsText?.includes("Seller interest added"));
  assert.ok(!String(notifyPayload.html).includes("omer.new@example.com"));

  const unchanged = await deliverLeadInfoUpdatedNotice({
    leadId: "lead_canonical",
    labels: [],
  });
  assert.equal(unchanged.skipped, "no_changes");
  assert.equal(pushes.length, 1);

  pushShouldThrow = true;
  const afterPushFail = await deliverLeadInfoUpdatedNotice(
    {
      leadId: "lead_canonical",
      assignedAgentId: "agent_houzzat",
      clientLabel: "Omer Ali",
      labels: ["Email updated"],
    },
    {
      authorizeStaffRecipientForLead: async () => true,
      loadLead: async () => ({
        id: "lead_canonical",
        workspaceId: "ws_houzzat",
        assignedAgentId: "agent_houzzat",
        customer: { name: "Omer Ali", email: "omer@example.com" },
      }),
      loadAgent: async () => ({
        id: "agent_houzzat",
        email: "agent@houzzat.ca",
        phone: "+14165550001",
        phoneE164: "+14165550001",
        disabledAt: null,
        role: "AGENT",
        pushNotificationPrefs: {},
      }),
      writeActivity: async () => undefined,
      sendPushToUser: () => {
        throw new Error("push down");
      },
      sendNotification: async (payload) => {
        notifies.push(payload);
        return { email: "sent", sms: "sent", whatsapp: "skipped" };
      },
    },
  );
  assert.equal(afterPushFail.attempted.push, true);
  assert.equal(afterPushFail.attempted.email, true);
  assert.equal(afterPushFail.attempted.sms, true);
  assert.equal(notifies.length, 2);

  const otherAgent = await deliverLeadInfoUpdatedNotice(
    {
      leadId: "lead_canonical",
      assignedAgentId: "agent_other",
      labels: ["Name updated"],
    },
    {
      authorizeStaffRecipientForLead: async (input) =>
        input.userId === "agent_houzzat",
      loadLead: async () => ({
        id: "lead_canonical",
        workspaceId: "ws_houzzat",
        assignedAgentId: "agent_houzzat",
        customer: { name: "Omer Ali", email: "omer@example.com" },
      }),
    },
  );
  assert.equal(otherAgent.skipped, "unauthorized");

  const otherWorkspace = await deliverLeadInfoUpdatedNotice(
    {
      leadId: "lead_other_ws",
      assignedAgentId: "agent_houzzat",
      labels: ["Name updated"],
    },
    {
      authorizeStaffRecipientForLead: async (input) =>
        input.leadId === "lead_canonical",
      loadLead: async () => ({
        id: "lead_other_ws",
        workspaceId: "ws_other",
        assignedAgentId: "agent_houzzat",
        customer: { name: "Omer Ali", email: "omer@example.com" },
      }),
    },
  );
  assert.equal(otherWorkspace.skipped, "unauthorized");

  assert.equal(
    dedupeLeadInfoChanges([
      { kind: "cellphone", label: "Cellphone updated" },
      { kind: "cellphone", label: "Cellphone updated" },
      { kind: "seller_interest", label: "Seller interest added" },
    ]).length,
    2,
  );
}

function testValuationPrefillWiring() {
  const page = read("src/app/(marketing)/home-valuation/page.tsx");
  const form = read("src/components/valuation/HomeValuationForm.tsx");
  const route = read("src/app/api/valuation/route.ts");
  assert.ok(page.includes("initialContact"));
  assert.ok(page.includes("isConsumerRole"));
  assert.ok(form.includes("initialContact"));
  assert.ok(form.includes("First name"));
  assert.ok(form.includes("Last name"));
  assert.ok(form.includes("Cellphone"));
  assert.ok(route.includes("applyCanonicalCustomerContact"));
  assert.ok(route.includes("contactChanges"));
  assert.ok(route.includes("sessionIsConsumer"));
}

function testEntryPoints() {
  const contact = read("src/app/api/account/contact/route.ts");
  const prefs = read("src/app/api/account/preferences/route.ts");
  const home = read("src/app/api/account/home-location/route.ts");
  const leads = read("src/app/api/leads/route.ts");
  const publicApi = read("src/lib/agent/public-lead-api.ts");
  const intake = read("src/lib/agent/lead-intake.ts");
  assert.ok(contact.includes("scheduleLeadInfoUpdatedForCustomer"));
  assert.ok(prefs.includes("scheduleLeadInfoUpdatedForCustomer"));
  assert.ok(home.includes("scheduleLeadInfoUpdatedForCustomer"));
  assert.ok(leads.includes("contactChanges"));
  assert.ok(publicApi.includes("scheduleLeadInfoUpdatedAfterIntake"));
  assert.ok(intake.includes("scheduleLeadInfoUpdatedAfterIntake"));
  assert.ok(contact.includes("applyCanonicalCustomerContact"));
}

async function main() {
  testPrefillSplitAndCompose();
  testBlanksDoNotErase();
  testE164NoOpIsNotAChange();
  testMaterialContactDiffs();
  testBuyerSellerFlagDiffs();
  testSummaryCopy();
  await testApplySkipsEmailTakeover();
  await testOneLogicalNotificationAndFailureIsolation();
  testValuationPrefillWiring();
  testEntryPoints();
  console.log("lead-info-updated-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
