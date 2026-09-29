/**
 * Signup UTM attribution and Save Listing / Save Search verification resume.
 * Run: pnpm signup-attribution:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { reportGa4SignUp } from "../src/lib/ads/ga4-sign-up";
import { pickUtm } from "../src/lib/ads/utm";
import {
  resetLeadIdentityLocksForTests,
  resolveOrCreateWorkspaceLead,
} from "../src/lib/agent/resolve-workspace-lead";
import {
  createCaptureIntent,
  saveCaptureIntent,
  type CaptureIntentStore,
} from "../src/lib/auth/capture-intent";
import {
  dispatchPendingCaptureIntent,
  registerCaptureIntentHandler,
} from "../src/lib/auth/capture-intent-dispatch";
import {
  resumeSavedListingIntent,
  retainSaveListingIntentHandler,
} from "../src/lib/auth/save-listing-intent";
import {
  resumeSavedSearchIntent,
  retainSaveSearchIntentHandler,
} from "../src/lib/auth/save-search-intent";

const HOST = "acme.houzzatpro.com";
const NOW = 1_700_000_000_000;
const WS = "ws_attr";
const USER_ID = "user_attr";
const AGENT = "agent_original";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function memoryStore(): CaptureIntentStore & { raw: string | null } {
  return {
    raw: null,
    get() {
      return this.raw;
    },
    set(value) {
      this.raw = value;
    },
    remove() {
      this.raw = null;
    },
  };
}

function storeSaveListing(mlsNumber = "W1234567") {
  const store = memoryStore();
  const saved = createCaptureIntent(
    {
      type: "SAVE_LISTING",
      mlsNumber,
      callbackPath: `/listing/12-main/${mlsNumber}`,
    },
    { host: HOST, now: NOW },
  );
  assert.equal(saved.ok, true);
  if (saved.ok) saveCaptureIntent(store, saved.intent);
  return store;
}

function storeSaveSearch(href = "/search?city=Toronto&transactionType=SALE") {
  const store = memoryStore();
  const saved = createCaptureIntent(
    { type: "SAVE_SEARCH", callbackPath: href },
    { host: HOST, now: NOW },
  );
  assert.equal(saved.ok, true);
  if (saved.ok) saveCaptureIntent(store, saved.intent);
  return store;
}

type LeadRow = {
  id: string;
  workspaceId: string;
  customerId: string | null;
  assignedAgentId: string | null;
  source: string;
  intent: string;
  isBuyer: boolean;
  isSeller: boolean;
  score: number;
  updatedAt: Date;
  contactConsentAt: Date | null;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  adCampaignId?: string;
};

type DbState = {
  leads: LeadRow[];
  creates: Array<Record<string, unknown>>;
  updates: Array<Record<string, unknown>>;
  conversationCreates: number[];
  conversations: number;
};

function fakeDb(input: DbState) {
  const user = {
    id: USER_ID,
    email: "buyer@example.com",
    workspaceId: WS,
  };
  const db = {
    user: {
      findUnique: async () => ({ id: user.id, workspaceId: user.workspaceId }),
      findFirst: async () => user,
      findMany: async () => [],
    },
    lead: {
      findMany: async (args: { where?: { customerId?: string; workspaceId?: string } }) => {
        const where = args.where ?? {};
        return input.leads.filter(
          (lead) =>
            lead.workspaceId === where.workspaceId &&
            lead.customerId === where.customerId,
        );
      },
      findUnique: async (args: {
        where?: { workspaceId_id?: { id?: string; workspaceId?: string } };
      }) => {
        const ids = args.where?.workspaceId_id;
        return (
          input.leads.find(
            (lead) => lead.id === ids?.id && lead.workspaceId === ids?.workspaceId,
          ) ?? null
        );
      },
      create: async (args: { data: Record<string, unknown> }) => {
        input.creates.push(args.data);
        const row: LeadRow = {
          id: "lead_new",
          workspaceId: String(args.data.workspaceId),
          customerId: (args.data.customerId as string | null) ?? null,
          assignedAgentId: (args.data.assignedAgentId as string | null) ?? null,
          source: String(args.data.source),
          intent: String(args.data.intent),
          isBuyer: args.data.isBuyer === true,
          isSeller: args.data.isSeller === true,
          score: Number(args.data.score ?? 0),
          updatedAt: new Date(),
          contactConsentAt: (args.data.contactConsentAt as Date | null) ?? null,
          utmSource: args.data.utmSource as string | undefined,
          utmMedium: args.data.utmMedium as string | undefined,
          utmCampaign: args.data.utmCampaign as string | undefined,
          utmContent: args.data.utmContent as string | undefined,
          adCampaignId: args.data.adCampaignId as string | undefined,
        };
        input.leads.push(row);
        return row;
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        input.updates.push(args.data);
        const row = input.leads.find((lead) => lead.id === args.where.id);
        if (!row) throw new Error("missing lead");
        const next = { ...row };
        for (const [key, value] of Object.entries(args.data)) {
          if (
            key === "utmSource" ||
            key === "utmMedium" ||
            key === "utmCampaign" ||
            key === "utmContent" ||
            key === "adCampaignId"
          ) {
            continue;
          }
          (next as Record<string, unknown>)[key] = value;
        }
        Object.assign(row, next);
        return row;
      },
    },
    leadActivity: {
      create: async () => ({ id: "activity" }),
    },
    conversation: {
      findUnique: async () =>
        input.conversations > 0
          ? {
              id: "conv_1",
              workspaceId: WS,
              leadId: input.leads[0]?.id,
              status: "OPEN",
              createdAt: new Date(),
              updatedAt: new Date(),
              lastMessageAt: null,
              customerLastReadAt: null,
              agentLastReadAt: null,
              agentLastReadByUserId: null,
            }
          : null,
      create: async () => {
        input.conversations += 1;
        input.conversationCreates.push(input.conversations);
        return {
          id: "conv_1",
          workspaceId: WS,
          leadId: input.leads[0]?.id,
          status: "OPEN",
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessageAt: null,
          customerLastReadAt: null,
          agentLastReadAt: null,
          agentLastReadByUserId: null,
        };
      },
    },
  };
  return db as unknown as PrismaClient;
}

const UTM = {
  utmSource: "google",
  utmMedium: "cpc",
  utmCampaign: "spring-open",
  utmContent: "hero-a",
};

function emptyState(leads: LeadRow[] = []): DbState {
  return {
    leads,
    creates: [],
    updates: [],
    conversationCreates: [],
    conversations: 0,
  };
}

async function resolveWith(state: DbState, utm?: typeof UTM) {
  let deskCalls = 0;
  resetLeadIdentityLocksForTests();
  const result = await resolveOrCreateWorkspaceLead({
    workspaceId: WS,
    organizationId: "org_a",
    customerId: USER_ID,
    email: "buyer@example.com",
    name: "Buyer",
    isBuyer: true,
    isSeller: false,
    source: "SIGNUP",
    notes: "Signup lead",
    score: 20,
    utm,
    upsertCustomer: false,
    activityOnReuse: false,
    resolveCreateDesk: async () => {
      deskCalls += 1;
      return { assigneeId: "agent_routed", organizationId: "org_a" };
    },
    db: fakeDb(state),
  });
  return { result, deskCalls, state };
}

function existingLead(utmSource = "newsletter"): LeadRow {
  return {
    id: "lead_existing",
    workspaceId: WS,
    customerId: USER_ID,
    assignedAgentId: AGENT,
    source: "SIGNUP",
    intent: "BUYER",
    isBuyer: true,
    isSeller: false,
    score: 20,
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    contactConsentAt: new Date("2026-01-01T00:00:00.000Z"),
    utmSource,
    utmMedium: "email",
    utmCampaign: "welcome",
    utmContent: "footer",
  };
}

async function testNewSignupLeadReceivesStoredUtm() {
  const state = emptyState();
  const { result, deskCalls } = await resolveWith(state, UTM);
  assert.equal(result.created, true);
  assert.equal(state.creates.length, 1);
  assert.equal(state.creates[0]?.utmSource, "google");
  assert.equal(state.creates[0]?.utmMedium, "cpc");
  assert.equal(state.creates[0]?.utmCampaign, "spring-open");
  assert.equal(state.creates[0]?.utmContent, "hero-a");
  assert.equal(state.creates[0]?.adCampaignId, undefined);
  assert.equal(state.creates[0]?.assignedAgentId, "agent_routed");
  assert.equal(deskCalls, 1);
  assert.equal(state.conversationCreates.length, 1);
  assert.equal(result.lead.id, "lead_new");
}

async function testMissingUtmStillCreatesOneLead() {
  const picked = pickUtm(null);
  assert.deepEqual(picked, {});
  const state = emptyState();
  const { result, deskCalls } = await resolveWith(state, picked);
  assert.equal(result.created, true);
  assert.equal(state.creates.length, 1);
  assert.equal(state.creates[0]?.utmSource, undefined);
  assert.equal(state.creates[0]?.utmMedium, undefined);
  assert.equal(state.creates[0]?.utmCampaign, undefined);
  assert.equal(state.creates[0]?.utmContent, undefined);
  assert.equal(deskCalls, 1);
}

function testMalformedAttributionDoesNotInjectLeadFields() {
  const picked = pickUtm({
    utmSource: `  ${"g".repeat(200)}  `,
    utm_medium: "cpc",
    utmCampaign: { nested: true },
    utmContent: "  banner  ",
    utmTerm: "homes",
    notes: "inject notes",
    leadId: "lead_other",
    assignedAgentId: "agent_attacker",
    password: "secret",
    adCampaignId: "camp_inferred",
    visitorKey: "visitor",
    landingUrl: "https://evil.example/land",
    referrer: "https://evil.example",
  });
  assert.equal(picked.utmSource?.length, 120);
  assert.equal(picked.utmMedium, "cpc");
  assert.equal(picked.utmCampaign, undefined);
  assert.equal(picked.utmContent, "banner");
  assert.equal("notes" in picked, false);
  assert.equal("leadId" in picked, false);
  assert.equal("assignedAgentId" in picked, false);
  assert.equal("password" in picked, false);
  assert.equal("adCampaignId" in picked, false);
  assert.equal("visitorKey" in picked, false);
  assert.equal("landingUrl" in picked, false);
  assert.equal("referrer" in picked, false);

  const route = read("src/app/api/auth/sign-up/route.ts");
  const capture = route.slice(route.indexOf("await captureWebsiteLead("));
  const captureCall = capture.slice(0, capture.indexOf("});") + 3);
  assert.ok(captureCall.includes("utm,"));
  assert.equal(captureCall.includes("notes:"), false);
  assert.equal(captureCall.includes("assignedAgentId"), false);
  assert.equal(captureCall.includes("adCampaignId"), false);
  assert.equal(route.includes(".passthrough("), false);
  assert.equal((route.match(/prisma\.user\.create\(/g) ?? []).length, 1);
  assert.equal((route.match(/captureWebsiteLead\(/g) ?? []).length, 1);
  assert.ok(read("src/components/auth/SignUpForm.tsx").includes("...loadPersistedUtm()"));
  const intake = read("src/lib/agent/lead-intake.ts");
  const fn = intake.slice(intake.indexOf("export async function captureWebsiteLead"));
  assert.ok(fn.includes("utm: input.utm"));
}

async function testExistingLeadAttributionIsNotOverwritten() {
  const state = emptyState([existingLead("newsletter")]);
  state.conversations = 1;
  const { result, deskCalls } = await resolveWith(state, UTM);
  assert.equal(result.created, false);
  assert.equal(result.lead.id, "lead_existing");
  assert.equal(result.lead.assignedAgentId, AGENT);
  assert.equal(state.creates.length, 0);
  assert.equal(deskCalls, 0);
  assert.equal(state.conversationCreates.length, 0);
  assert.equal(state.updates.length, 1);
  for (const key of [
    "utmSource",
    "utmMedium",
    "utmCampaign",
    "utmContent",
    "adCampaignId",
    "assignedAgentId",
  ]) {
    assert.equal(key in (state.updates[0] ?? {}), false, key);
  }
  assert.equal(state.leads[0]?.utmSource, "newsletter");
  assert.equal(state.leads[0]?.utmMedium, "email");
  assert.equal(state.leads[0]?.utmCampaign, "welcome");
  assert.equal(state.leads[0]?.utmContent, "footer");
}

async function testAttributionDoesNotDuplicateConversation() {
  const state = emptyState();
  const first = await resolveWith(state, UTM);
  assert.equal(first.state.creates.length, 1);
  assert.equal(first.state.conversationCreates.length, 1);
  const second = await resolveWith(state, UTM);
  assert.equal(second.result.created, false);
  assert.equal(second.state.creates.length, 1);
  assert.equal(second.deskCalls, 0);
  assert.equal(second.state.conversationCreates.length, 1);
  assert.equal(state.leads.length, 1);
  assert.equal(state.leads[0]?.assignedAgentId, "agent_routed");
  assert.equal(state.leads[0]?.utmSource, "google");
}

async function dispatchOnce(store: CaptureIntentStore) {
  const first = dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  const second = dispatchPendingCaptureIntent(store, { host: HOST, now: NOW });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { first, second };
}

async function testSaveListingVerificationIsVisibleAndNotRetried() {
  const store = storeSaveListing();
  let posts = 0;
  let verification = 0;
  let saved = 0;
  const stop = registerCaptureIntentHandler("SAVE_LISTING", async (intent) => {
    const result = await resumeSavedListingIntent(intent, {
      save: async () => {
        posts += 1;
        return { ok: false, verification: true };
      },
    });
    if (result === "verification") verification += 1;
    if (result === "saved") saved += 1;
  });
  try {
    const { first, second } = await dispatchOnce(store);
    assert.equal(first.status, "ready");
    assert.equal(second.status, "none");
    assert.equal(store.raw, null);
    assert.equal(posts, 1);
    assert.equal(verification, 1);
    assert.equal(saved, 0);
    const handler = read("src/lib/auth/save-listing-intent.ts");
    assert.ok(handler.includes('else if (result === "verification") announceVerification?.();'));
    assert.equal(handler.includes("saveCaptureIntent"), false);
    const toggle = read("src/components/account/useSavedListingToggle.ts");
    const retain = toggle.slice(toggle.indexOf("retainSaveListingIntentHandler("));
    assert.ok(retain.includes("openClientToolsVerification({ callbackUrl })"));
    assert.equal(toggle.includes("saveRequiresEmailVerificationToast"), false);
    assert.equal(retainSaveListingIntentHandler.length > 0, true);
  } finally {
    stop();
  }
}

async function testSaveSearchVerificationIsVisibleAndNotRetried() {
  const store = storeSaveSearch();
  let lists = 0;
  let creates = 0;
  let verified = 0;
  let failed = 0;
  const stop = registerCaptureIntentHandler("SAVE_SEARCH", async (intent) => {
    const result = await resumeSavedSearchIntent(intent, {
      list: async () => {
        lists += 1;
        return { ok: false, verification: true };
      },
      create: async () => {
        creates += 1;
        return { ok: true };
      },
    });
    if (result === "verification") verified += 1;
    if (result === "failed") failed += 1;
  });
  try {
    const { first, second } = await dispatchOnce(store);
    assert.equal(first.status, "ready");
    assert.equal(second.status, "none");
    assert.equal(store.raw, null);
    assert.equal(lists, 1);
    assert.equal(creates, 0);
    assert.equal(verified, 1);
    assert.equal(failed, 0);
    const createdRejected = await resumeSavedSearchIntent(
      {
        v: 1,
        type: "SAVE_SEARCH",
        callbackPath: "/search?city=Toronto&transactionType=SALE",
        host: HOST,
        createdAt: NOW,
      },
      {
        list: async () => ({ ok: true, items: [] }),
        create: async () => {
          creates += 1;
          return { ok: false, verification: true };
        },
      },
    );
    assert.equal(createdRejected, "verification");
    assert.equal(creates, 1);
    const button = read("src/components/account/SaveSearchButton.tsx");
    const retain = button.slice(button.indexOf("retainSaveSearchIntentHandler("));
    assert.ok(retain.includes("openClientToolsVerification({ callbackUrl: callbackPath })"));
    assert.ok(retain.includes("SITE_MESSAGES.genericErrorToast"));
    assert.equal(retain.includes("saveCaptureIntent"), false);
    assert.equal(failed, 0);
    const handler = read("src/lib/auth/save-search-intent.ts");
    assert.ok(handler.includes('else if (result === "verification") announceVerification?.();'));
    assert.equal(handler.includes("saveCaptureIntent"), false);
    assert.equal(typeof retainSaveSearchIntentHandler, "function");
  } finally {
    stop();
  }
}

async function testSuccessfulSavesAndConfirmStayUnchanged() {
  const saved = await resumeSavedListingIntent(
    {
      v: 1,
      type: "SAVE_LISTING",
      mlsNumber: "W1234567",
      callbackPath: "/listing/12-main/W1234567",
      host: HOST,
      createdAt: NOW,
    },
    {
      save: async () => ({ ok: true }),
      onSaved() {},
    },
  );
  assert.equal(saved, "saved");

  const failed = await resumeSavedListingIntent(
    {
      v: 1,
      type: "SAVE_LISTING",
      mlsNumber: "W1234567",
      callbackPath: "/listing/12-main/W1234567",
      host: HOST,
      createdAt: NOW,
    },
    {
      save: async () => {
        throw new Error("network");
      },
    },
  );
  assert.equal(failed, "failed");

  const searchSaved = await resumeSavedSearchIntent(
    {
      v: 1,
      type: "SAVE_SEARCH",
      callbackPath: "/search?city=Toronto&transactionType=SALE",
      host: HOST,
      createdAt: NOW,
    },
    {
      list: async () => ({ ok: true, items: [] }),
      create: async () => ({ ok: true }),
      onSaved() {},
    },
  );
  assert.equal(searchSaved, "saved");

  const same = await resumeSavedSearchIntent(
    {
      v: 1,
      type: "SAVE_SEARCH",
      callbackPath: "/search?city=Toronto&transactionType=SALE",
      host: HOST,
      createdAt: NOW,
    },
    {
      list: async () => ({
        ok: true,
        items: [{ isPrimary: true, query: { city: "Toronto", transactionType: "SALE" } }],
      }),
      create: async () => {
        throw new Error("must not create");
      },
      onSaved() {},
    },
  );
  assert.equal(same, "saved");

  let confirms = 0;
  let creates = 0;
  const confirm = await resumeSavedSearchIntent(
    {
      v: 1,
      type: "SAVE_SEARCH",
      callbackPath: "/search?city=Toronto&transactionType=SALE",
      host: HOST,
      createdAt: NOW,
    },
    {
      list: async () => ({
        ok: true,
        items: [{ isPrimary: true, query: { city: "Ottawa" } }],
      }),
      create: async () => {
        creates += 1;
        return { ok: true };
      },
      onNeedsConfirm() {
        confirms += 1;
      },
    },
  );
  assert.equal(confirm, "needs_confirm");
  assert.equal(creates, 0);
  assert.equal(confirms, 1);
}

function testGa4SignUpFiresOnlyAfterCreatedAccount() {
  const calls: unknown[][] = [];
  reportGa4SignUp((...args) => {
    calls.push(args);
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["event", "sign_up", { method: "email" }]);
  assert.deepEqual(Object.keys(calls[0]?.[2] as object), ["method"]);

  reportGa4SignUp(undefined);
  assert.doesNotThrow(() => {
    reportGa4SignUp(() => {
      throw new Error("analytics down");
    });
  });

  const form = read("src/components/auth/SignUpForm.tsx");
  const createdAt = form.indexOf("reportGa4SignUp()");
  const signInAt = form.indexOf('signIn("credentials"');
  const existingAt = form.indexOf("status === 409");
  assert.ok(createdAt !== -1 && signInAt !== -1 && createdAt < signInAt);
  assert.ok(existingAt !== -1 && existingAt < createdAt);
  const signIn = read("src/components/auth/SignInForm.tsx");
  assert.equal(signIn.includes("sign_up"), false);
  assert.equal(signIn.includes("reportGa4SignUp"), false);
  const pixels = read("src/components/ads/AdsTrackingPixels.tsx");
  assert.equal(pixels.includes("GTM-"), false);
  assert.equal((pixels.match(/googletagmanager.com\/gtag\/js/g) ?? []).length, 1);
}

function testWatchVerificationUxUnchanged() {
  const listing = read("src/components/account/useWatchListingToggle.ts");
  const area = read("src/components/account/useWatchAreaToggle.ts");
  const property = read("src/lib/auth/property-watch-intent.ts");
  const areaIntent = read("src/lib/auth/area-watch-intent.ts");
  assert.ok(listing.includes("SITE_MESSAGES.watchRequiresEmailVerificationToast"));
  assert.ok(area.includes("SITE_MESSAGES.watchRequiresEmailVerificationToast"));
  assert.equal(listing.includes("openClientToolsVerification"), false);
  assert.equal(area.includes("openClientToolsVerification"), false);
  assert.ok(property.includes('return "verification"'));
  assert.ok(areaIntent.includes('return "verification"'));
  assert.equal(property.includes("saveCaptureIntent"), false);
  assert.equal(areaIntent.includes("saveCaptureIntent"), false);
}

async function main() {
  await testNewSignupLeadReceivesStoredUtm();
  console.log("[1-4] source, medium, campaign, and content reach a new Lead");
  await testMissingUtmStillCreatesOneLead();
  console.log("[5] missing UTM still creates one Lead");
  testMalformedAttributionDoesNotInjectLeadFields();
  console.log("[6] malformed attribution stays within the four UTM fields");
  await testExistingLeadAttributionIsNotOverwritten();
  console.log("[7-8] existing attribution and assignment stay sticky");
  await testAttributionDoesNotDuplicateConversation();
  console.log("[9] attribution does not create a second Lead or conversation");
  await testSaveListingVerificationIsVisibleAndNotRetried();
  console.log("[10,12,13] Save Listing verification is visible and does not retry");
  await testSaveSearchVerificationIsVisibleAndNotRetried();
  console.log("[11-13] Save Search verification is visible and does not retry");
  await testSuccessfulSavesAndConfirmStayUnchanged();
  console.log("[14-16] successful save and replace confirmation stay unchanged");
  testWatchVerificationUxUnchanged();
  console.log("[17] Property and Area Watch verification UX unchanged");
  testGa4SignUpFiresOnlyAfterCreatedAccount();
  console.log("[18] GA4 sign_up fires only after a created account");
  console.log("signup attribution selftest: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
