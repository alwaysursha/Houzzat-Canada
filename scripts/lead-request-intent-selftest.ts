/**
 * REQUEST_VIEWING and CONTACT_AGENT.
 * Auth returns the customer to the form. It does not submit the lead.
 * Run: pnpm lead-request:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CAPTURE_INTENT_TTL_MS,
  consumePendingIntent,
  createCaptureIntent,
  saveCaptureIntent,
  type CaptureIntent,
  type CaptureIntentStore,
} from "../src/lib/auth/capture-intent";
import {
  dispatchPendingCaptureIntent,
  registerCaptureIntentHandler,
} from "../src/lib/auth/capture-intent-dispatch";
import {
  leadRequestFormSeed,
  openGuestLeadRequestIntent,
  resumeLeadRequestIntent,
  type LeadRequestRestore,
} from "../src/lib/auth/lead-request-intent";

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

function read(rel: string) {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

const HOST = "acme.houzzatpro.com";
const NOW = 1_700_000_000_000;
const LISTING = "/listing/12-main-st/W1234567";

function openViewing(
  kind: "showing" | "virtual_viewing",
  mode: "sign-in" | "sign-up",
  extra?: { message?: string; focusNotes?: string },
) {
  const store = memoryStore();
  let opened: { mode?: string; callbackUrl: string } | null = null;
  const saved = openGuestLeadRequestIntent({
    type: "REQUEST_VIEWING",
    kind,
    mlsNumber: "w1234567",
    callbackPath: LISTING,
    message: extra?.message,
    focusNotes: extra?.focusNotes,
    host: HOST,
    now: NOW,
    store,
    mode,
    openAuth(options) {
      opened = options;
    },
  });
  return { store, opened, saved };
}

function handoff() {
  let value: LeadRequestRestore | null = null;
  return {
    writeRestore(next: LeadRequestRestore) {
      value = next;
    },
    clearRestore() {
      value = null;
    },
    read(): LeadRequestRestore | null {
      return value;
    },
  };
}

function testAnonymousViewingRequiresAuth() {
  const showing = openViewing("showing", "sign-in", {
    message: "Saturday afternoon",
  });
  assert.equal(showing.saved.ok, true);
  assert.equal(showing.opened?.mode, "sign-in");
  assert.equal(showing.opened?.callbackUrl, LISTING);
  const virtual = openViewing("virtual_viewing", "sign-up", {
    message: "Please show the kitchen",
    focusNotes: "basement light",
  });
  assert.equal(virtual.saved.ok, true);
  assert.equal(virtual.opened?.mode, "sign-up");

  const form = read("src/components/listings/LeadRequestForm.tsx");
  const fetchAt = form.indexOf('fetch("/api/leads"');
  const gateAt = form.indexOf('status !== "authenticated"');
  assert.ok(gateAt !== -1 && fetchAt !== -1 && gateAt < fetchAt);
  assert.ok(form.includes("openGuestLeadRequestIntent"));
  assert.ok(form.includes('kind === "inquiry" ? "CONTACT_AGENT" : "REQUEST_VIEWING"'));
}

function testAnonymousInquiryRequiresAuth() {
  const store = memoryStore();
  let opened = false;
  const saved = openGuestLeadRequestIntent({
    type: "CONTACT_AGENT",
    kind: "inquiry",
    mlsNumber: "W1234567",
    callbackPath: LISTING,
    message: "Is the parking included?",
    host: HOST,
    now: NOW,
    store,
    openAuth() {
      opened = true;
    },
  });
  assert.equal(saved.ok, true);
  assert.equal(opened, true);
  if (!saved.ok) return;
  assert.equal(saved.intent.type, "CONTACT_AGENT");
  if (saved.intent.type !== "CONTACT_AGENT") return;
  assert.equal(saved.intent.message, "Is the parking included?");
  const panel = read("src/components/listings/ViewingRequestPanel.tsx");
  assert.ok(panel.includes('kind="inquiry"'));
  assert.ok(panel.includes("Ask about this home"));
}

function testPayloadAndIdentityStayMinimal() {
  const saved = openViewing("virtual_viewing", "sign-in", {
    message: "Evening works",
    focusNotes: "parking",
  });
  assert.equal(saved.saved.ok, true);
  if (!saved.saved.ok) return;
  const intent = saved.saved.intent;
  assert.equal(intent.type, "REQUEST_VIEWING");
  if (intent.type !== "REQUEST_VIEWING") return;
  assert.equal(intent.mlsNumber, "W1234567");
  assert.equal(intent.kind, "virtual_viewing");
  assert.equal(intent.callbackPath, LISTING);
  assert.equal(intent.message, "Evening works");
  assert.equal(intent.focusNotes, "parking");
  assert.equal("name" in intent, false);
  assert.equal("email" in intent, false);
  assert.equal("phone" in intent, false);
  assert.equal("contactConsent" in intent, false);

  const raw = JSON.parse(saved.store.raw ?? "{}") as {
    intent: Record<string, unknown>;
  };
  raw.intent.name = "Pat";
  raw.intent.email = "pat@example.com";
  raw.intent.phone = "4165550100";
  raw.intent.contactConsent = true;
  saved.store.set(JSON.stringify(raw));
  const rejected = consumePendingIntent(saved.store, { host: HOST, now: NOW });
  assert.deepEqual(rejected, { ok: false, reason: "invalid" });
  assert.equal(saved.store.raw, null);

  const showing = createCaptureIntent(
    {
      type: "REQUEST_VIEWING",
      callbackPath: LISTING,
      mlsNumber: "W1234567",
      kind: "showing",
      message: "Morning",
      focusNotes: "basement",
    },
    { host: HOST, now: NOW },
  );
  assert.deepEqual(showing, { ok: false, reason: "invalid" });
}

function testConsentIsNotRestoredAsChecked() {
  const saved = openViewing("showing", "sign-in", { message: "Anytime" });
  assert.equal(saved.saved.ok, true);
  if (!saved.saved.ok) return;
  const box = handoff();
  const result = resumeLeadRequestIntent(saved.saved.intent, {
    pathname: LISTING,
    now: NOW,
    writeRestore: box.writeRestore,
    clearRestore: box.clearRestore,
  });
  assert.equal(result, "restored");
  const seed = leadRequestFormSeed(box.read()!);
  assert.equal(seed.consentChecked, false);
  assert.equal("contactConsent" in (box.read() ?? {}), false);
  const form = read("src/components/listings/LeadRequestForm.tsx");
  assert.ok(form.includes("useState(false)"));
  assert.ok(!form.includes("setContactConsent(true)"));
}

function testFormReopensAfterEitherAuthAndDoesNotSubmit() {
  let posts = 0;
  for (const mode of ["sign-in", "sign-up"] as const) {
    const saved = openViewing("virtual_viewing", mode, {
      message: "Video the yard",
      focusNotes: "south windows",
    });
    assert.equal(saved.saved.ok, true);
    assert.equal(saved.opened?.mode, mode);
    if (!saved.saved.ok) return;
    const box = handoff();
    const result = resumeLeadRequestIntent(saved.saved.intent, {
      pathname: LISTING,
      now: NOW,
      writeRestore: box.writeRestore,
      clearRestore: box.clearRestore,
    });
    assert.equal(result, "restored");
    const seed = leadRequestFormSeed(box.read()!);
    assert.equal(seed.kind, "virtual_viewing");
    assert.equal(seed.message, "Video the yard");
    assert.equal(seed.focusNotes, "south windows");
    assert.equal(seed.consentChecked, false);
    assert.equal("name" in seed, false);
    assert.equal("email" in seed, false);
    posts += 0;
  }
  assert.equal(posts, 0);
  const resume = read("src/lib/auth/lead-request-intent.ts");
  assert.ok(!resume.includes('fetch("/api/leads"'));
  assert.ok(resume.includes("Does not POST /api/leads"));
}

function testSuccessDoesNotReplay() {
  const saved = openViewing("showing", "sign-in", { message: "After 5" });
  assert.equal(saved.saved.ok, true);
  if (!saved.saved.ok) return;
  saveCaptureIntent(saved.store, saved.saved.intent);
  let runs = 0;
  const stop = registerCaptureIntentHandler("REQUEST_VIEWING", (intent) => {
    runs += 1;
    const box = handoff();
    const result = resumeLeadRequestIntent(intent, {
      pathname: LISTING,
      now: NOW,
      writeRestore: box.writeRestore,
      clearRestore: box.clearRestore,
    });
    assert.equal(result, "restored");
    box.clearRestore();
    assert.equal(box.read(), null);
  });
  const first = dispatchPendingCaptureIntent(saved.store, {
    host: HOST,
    now: NOW,
  });
  assert.equal(first.status, "ready");
  const refresh = dispatchPendingCaptureIntent(saved.store, {
    host: HOST,
    now: NOW,
  });
  assert.deepEqual(refresh, { status: "none" });
  assert.equal(runs, 1);
  stop();
}

function testWrongHostAndExpiredAndMissingListing() {
  const saved = openViewing("showing", "sign-in", { message: "Today" });
  assert.equal(saved.saved.ok, true);
  if (!saved.saved.ok) return;
  saveCaptureIntent(saved.store, saved.saved.intent);
  let ran = false;
  const stop = registerCaptureIntentHandler("REQUEST_VIEWING", () => {
    ran = true;
  });
  const wrongHost = dispatchPendingCaptureIntent(saved.store, {
    host: "other.houzzatpro.com",
    now: NOW,
  });
  assert.equal(wrongHost.status, "rejected");
  if (wrongHost.status === "rejected") {
    assert.equal(wrongHost.reason, "host_mismatch");
  }
  assert.equal(ran, false);
  assert.equal(saved.store.raw, null);
  stop();

  const again = openViewing("showing", "sign-in");
  assert.equal(again.saved.ok, true);
  if (!again.saved.ok) return;
  saveCaptureIntent(again.store, again.saved.intent);
  const expired = consumePendingIntent(again.store, {
    host: HOST,
    now: NOW + CAPTURE_INTENT_TTL_MS + 1,
  });
  assert.deepEqual(expired, { ok: false, reason: "expired" });

  const box = handoff();
  const intent = createCaptureIntent(
    {
      type: "CONTACT_AGENT",
      callbackPath: LISTING,
      mlsNumber: "W1234567",
      message: "Still there?",
    },
    { host: HOST, now: NOW },
  );
  assert.equal(intent.ok, true);
  if (!intent.ok) return;
  const unavailable = resumeLeadRequestIntent(intent.intent, {
    pathname: "/search",
    now: NOW,
    writeRestore: box.writeRestore,
    clearRestore: box.clearRestore,
  });
  assert.equal(unavailable, "unavailable");
  assert.equal(box.read(), null);
}

function testApiRequiresCustomerAndKeepsDownstream() {
  const route = read("src/app/api/leads/route.ts");
  assert.ok(route.includes("requireCustomerUser"));
  assert.ok(route.includes('status: 401'));
  assert.ok(route.includes("upsertCustomer: false"));
  assert.ok(!route.includes("upsertCustomer: !session"));
  assert.ok(!route.includes("findOrCreateCustomerUser"));
  assert.ok(route.includes("applyCanonicalCustomerContact"));
  assert.ok(route.includes("publicResolveOrCreateLead"));
  assert.ok(route.includes("if (resolved.created)"));
  assert.ok(route.includes("if (appointmentType)"));
  assert.ok(route.includes("prisma.appointment.create"));
  assert.ok(route.includes("scheduleViewingRequestedSmsAutomation"));

  function appointmentType(kind: "inquiry" | "showing" | "virtual_viewing") {
    return kind === "virtual_viewing"
      ? "VIRTUAL_VIEWING"
      : kind === "showing"
        ? "SHOWING"
        : null;
  }
  assert.equal(appointmentType("inquiry"), null);
  assert.equal(appointmentType("showing"), "SHOWING");
  assert.equal(appointmentType("virtual_viewing"), "VIRTUAL_VIEWING");

  const resolve = read("src/lib/agent/resolve-workspace-lead.ts");
  assert.ok(resolve.includes("sticky assignedAgentId"));
  assert.ok(resolve.includes("getOrCreateLeadConversation"));
  assert.ok(!route.includes("getOrCreateLeadConversation"));

  const valuation = read("src/app/api/valuation/route.ts");
  assert.ok(valuation.includes("ensureOwnerCustomer"));
  assert.ok(!valuation.includes("Sign in to send this request."));
  const affordability = read("src/app/api/tools/affordability-lead/route.ts");
  assert.ok(!affordability.includes("requireCustomerUser"));
}

function testEntryPointsShareTheForm() {
  const gallery = read("src/components/listings/ListingGallery.tsx");
  const overlay = read("src/components/listings/SearchMapListingOverlay.tsx");
  const mobile = read("src/components/listings/ListingMobileActionBar.tsx");
  const panel = read("src/components/listings/ViewingRequestPanel.tsx");
  assert.ok(gallery.includes("<ViewingBookingModal"));
  assert.ok(gallery.includes("callbackPath={callbackPath}"));
  assert.ok(overlay.includes('claimRestore="always"'));
  assert.ok(panel.includes("useLeadRequestRestore"));
  assert.ok(mobile.includes("setBookingOpen(true)"));
  assert.ok(mobile.includes("peekLeadRequestRestore"));
  assert.ok(!mobile.includes("mode: \"sign-in\""));
}

function testSaveFlowsStayAvailable() {
  const saveListing = read("src/lib/auth/save-listing-intent.ts");
  const saveSearch = read("src/lib/auth/save-search-intent.ts");
  assert.ok(saveListing.includes('fetch("/api/saved-listings"'));
  assert.ok(saveSearch.includes("resumeSavedSearchIntent"));
  const listing = createCaptureIntent(
    {
      type: "SAVE_LISTING",
      callbackPath: LISTING,
      mlsNumber: "W1234567",
    },
    { host: HOST, now: NOW },
  );
  assert.equal(listing.ok, true);
  const search = createCaptureIntent(
    { type: "SAVE_SEARCH", callbackPath: "/search?city=Toronto" },
    { host: HOST, now: NOW },
  );
  assert.equal(search.ok, true);
}

testAnonymousViewingRequiresAuth();
testAnonymousInquiryRequiresAuth();
testPayloadAndIdentityStayMinimal();
testConsentIsNotRestoredAsChecked();
testFormReopensAfterEitherAuthAndDoesNotSubmit();
testSuccessDoesNotReplay();
testWrongHostAndExpiredAndMissingListing();
testApiRequiresCustomerAndKeepsDownstream();
testEntryPointsShareTheForm();
testSaveFlowsStayAvailable();

void (null as CaptureIntent | null);

console.log("lead-request-intent selftest ok");
