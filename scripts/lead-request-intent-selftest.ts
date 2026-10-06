/**
 * REQUEST_VIEWING and CONTACT_AGENT.
 * Auth returns the customer to the form. It does not submit the lead.
 * Run: pnpm lead-request:selftest
 */
import assert from "node:assert/strict";
import {
  ga4LeadRequestEvent,
  reportGa4LeadRequest,
} from "../src/lib/ads/ga4-sign-up";
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
  leadRequestPhonePrefillRecord,
  phoneFromLeadRequestPrefill,
} from "../src/lib/auth/lead-request-contact-prefill";
import {
  LEAD_REQUEST_ENTRY_KEY,
  LEAD_REQUEST_RESTORE_KEY,
  leadRequestFormSeed,
  openGuestLeadRequestIntent,
  peekLeadRequestEntry,
  rememberLeadRequestEntry,
  resumeLeadRequestIntent,
  takeLeadRequestRestore,
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
  assert.equal(route.includes("applyCanonicalCustomerContact"), false);
  assert.ok(route.includes("customerId: customer.id"));
  assert.equal(route.includes("email: data.email"), false);
  assert.equal(route.includes("phone: data.phone"), false);
  assert.equal(route.includes("customerId:"), true);
  const form = read("src/components/listings/LeadRequestForm.tsx");
  assert.ok(form.includes("Requesting as"));
  assert.ok(form.includes('status === "authenticated"'));
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
  const detail = read("src/components/listings/ListingDetailView.tsx");
  const search = read("src/components/listings/SearchExperience.tsx");
  const mobile = read("src/components/listings/ListingMobileActionBar.tsx");
  const panel = read("src/components/listings/ViewingRequestPanel.tsx");
  assert.ok(gallery.includes("<ViewingBookingModal"));
  assert.ok(gallery.includes("callbackPath={callbackPath}"));
  assert.ok(detail.includes("<ViewingRequestPanel"));
  assert.ok(detail.includes("callbackPath={canonicalPath}"));
  assert.equal(search.includes("SearchMapListingOverlay"), false);
  assert.ok(panel.includes("useLeadRequestRestore"));
  assert.ok(mobile.includes("setBookingOpen(true)"));
  assert.ok(mobile.includes("peekLeadRequestRestore"));
  assert.ok(!mobile.includes("mode: \"sign-in\""));
}

function testSignupPrefillDoesNotEnterTheDraft() {
  const store = memoryStore();
  let opened: {
    mode?: string;
    callbackUrl?: string;
    signupPrefill?: { name: string; email: string } | null;
  } | null = null;
  const saved = openGuestLeadRequestIntent({
    type: "CONTACT_AGENT",
    kind: "inquiry",
    mlsNumber: "W1234567",
    callbackPath: LISTING,
    message: "Is parking included?",
    host: HOST,
    now: NOW,
    store,
    mode: "sign-up",
    signupPrefill: { name: "Pat Lee", email: "pat@example.com" },
    openAuth(options) {
      opened = options;
    },
  });
  assert.equal(saved.ok, true);
  assert.equal(opened?.mode, "sign-up");
  assert.equal(opened?.callbackUrl, LISTING);
  assert.deepEqual(opened?.signupPrefill, {
    name: "Pat Lee",
    email: "pat@example.com",
  });
  const raw = store.raw ?? "";
  assert.equal(raw.includes("Pat Lee"), false);
  assert.equal(raw.includes("pat@example.com"), false);
  assert.equal(raw.includes("password"), false);
  assert.equal(raw.includes("workspaceId"), false);

  const phone = leadRequestPhonePrefillRecord({
    mlsNumber: "W1234567",
    kind: "showing",
    phone: " 416-555-0100 ",
  });
  assert.deepEqual(phone, {
    mlsNumber: "W1234567",
    kind: "showing",
    phone: "416-555-0100",
  });
  const encoded = JSON.stringify(phone);
  assert.equal(
    phoneFromLeadRequestPrefill(encoded, "w1234567", "showing"),
    "416-555-0100",
  );
  assert.equal(phoneFromLeadRequestPrefill(encoded, "W1234567", "inquiry"), null);
  const polluted = JSON.stringify({
    ...phone,
    email: "pat@example.com",
    password: "secret",
    workspaceId: "ws",
  });
  assert.equal(phoneFromLeadRequestPrefill(polluted, "W1234567", "showing"), null);
  assert.equal(
    leadRequestPhonePrefillRecord({
      mlsNumber: "W1234567",
      kind: "showing",
      phone: "   ",
    }),
    null,
  );

  const form = read("src/components/listings/LeadRequestForm.tsx");
  assert.ok(form.includes('mode: "sign-up"'));
  assert.ok(form.includes("signupPrefill"));
  assert.ok(form.includes("rememberLeadRequestContactPrefill"));
  assert.ok(form.includes("clearLeadRequestContactPrefill"));
  assert.equal(form.includes("password"), false);
  const signup = read("src/components/auth/SignUpForm.tsx");
  assert.ok(signup.includes("initialName"));
  assert.ok(signup.includes("initialEmail"));
  assert.ok(signup.includes('fetch("/api/auth/sign-up"'));
  assert.equal(signup.includes('fetch("/api/leads"'), false);
  // CINC-style signup sends mobile (also initial password) — not a separate password field.
  assert.ok(signup.includes("phone: trimmedPhone") || signup.includes("phone:"));
  assert.equal(signup.includes("PasswordField"), false);
  const contact = read("src/lib/auth/lead-request-contact-prefill.ts");
  assert.equal(contact.includes("password"), false);
  assert.equal(contact.includes("workspaceId"), false);
  assert.equal(contact.includes("localStorage"), false);
  const modal = read("src/components/auth/AuthModalProvider.tsx");
  assert.ok(modal.includes("signupPrefill"));
  assert.ok(modal.includes('intent === "VIEW_LISTING"'));
  const gate = read("src/components/listings/ListingAccessGate.tsx");
  assert.equal(gate.includes("signupPrefill"), false);
}

function testGa4LeadRequestFiresOnlyAfterSuccessfulLead() {
  assert.equal(ga4LeadRequestEvent("showing"), "request_viewing");
  assert.equal(ga4LeadRequestEvent("virtual_viewing"), "request_viewing");
  assert.equal(ga4LeadRequestEvent("inquiry"), "contact_agent");

  const calls: unknown[][] = [];
  reportGa4LeadRequest("showing", (...args) => {
    calls.push(args);
  });
  reportGa4LeadRequest("virtual_viewing", (...args) => {
    calls.push(args);
  });
  reportGa4LeadRequest("inquiry", (...args) => {
    calls.push(args);
  });
  assert.deepEqual(calls, [
    ["event", "request_viewing"],
    ["event", "request_viewing"],
    ["event", "contact_agent"],
  ]);
  for (const call of calls) {
    assert.equal(call.length, 2);
  }
  assert.doesNotThrow(() => {
    reportGa4LeadRequest("inquiry", () => {
      throw new Error("analytics down");
    });
  });
  reportGa4LeadRequest("showing", undefined);

  const form = read("src/components/listings/LeadRequestForm.tsx");
  const authAt = form.indexOf('status !== "authenticated"');
  const consentAt = form.indexOf("if (!contactConsent)");
  const fetchAt = form.indexOf('fetch("/api/leads"');
  const failedAt = form.indexOf("if (!res.ok)");
  const eventAt = form.indexOf("reportGa4LeadRequest(kind)");
  assert.ok(authAt !== -1 && authAt < eventAt);
  assert.ok(consentAt !== -1 && consentAt < eventAt);
  assert.ok(fetchAt !== -1 && fetchAt < eventAt);
  assert.ok(failedAt !== -1 && failedAt < eventAt);
  assert.equal(form.includes("reportGa4SignUp"), false);
  const signup = read("src/lib/ads/ga4-sign-up.ts");
  assert.ok(signup.includes('gtag?.("event", "sign_up", { method: "email" })'));
  assert.ok(
    signup.includes('gtag?.("event", "conversion_event_signup", {})'),
  );
  const signupForm = read("src/components/auth/SignUpForm.tsx");
  assert.equal(signupForm.includes("request_viewing"), false);
  assert.equal(signupForm.includes("contact_agent"), false);
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

/**
 * Restore architecture (current):
 * REQUEST_VIEWING/CONTACT_AGENT → applyBrowserRestore writes LEAD_REQUEST_RESTORE_KEY
 * Visible surface claims via useLeadRequestRestore → seeds LeadRequestForm defaults
 * LeadRequestForm itself does not take restoreEntry / rememberLeadRequestEntry —
 * that older per-surface entry prop was retired when restore moved to the hook.
 */
function testBookingSurfacesDoNotShareOneRestore() {
  const panel = read("src/components/listings/ViewingRequestPanel.tsx");
  const gallery = read("src/components/listings/ListingGallery.tsx");
  const booking = read("src/components/listings/ViewingBookingModal.tsx");
  const mobile = read("src/components/listings/ListingMobileActionBar.tsx");
  const form = read("src/components/listings/LeadRequestForm.tsx");
  const tour = read("src/components/auth/lead-funnel/TourThisHomePrompt.tsx");
  const restoreHook = read("src/components/listings/useLeadRequestRestore.ts");

  assert.ok(restoreHook.includes("takeLeadRequestRestore"));
  assert.ok(restoreHook.includes("retainLeadRequestIntentHandler"));
  assert.ok(panel.includes("useLeadRequestRestore"));
  assert.ok(booking.includes("useLeadRequestRestore"));
  assert.ok(booking.includes("<LeadRequestForm"));
  assert.ok(form.includes('fetch("/api/leads"'));
  assert.ok(form.includes("reportGa4LeadRequest"));
  assert.equal(form.includes("restoreEntry"), false);
  assert.equal(form.includes("rememberLeadRequestEntry"), false);
  assert.ok(gallery.includes("setBookingOpen(true)"));
  assert.equal(gallery.includes("setViewerOpen(true)"), true);
  assert.ok(
    !gallery.includes("setViewerOpen(true);\n      setBookingOpen(true)"),
  );
  assert.ok(mobile.includes("setBookingOpen(true)"));
  assert.ok(mobile.includes("<ViewingBookingModal"));
  assert.ok(tour.includes("<ViewingBookingModal"));
  assert.ok(tour.includes("mlsNumber={mlsNumber}"));
  assert.ok(tour.includes("houzzat:tour-prompt-dismissed"));
  assert.ok(tour.includes("Maybe Later"));

  const memory = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return memory.has(key) ? memory.get(key)! : null;
    },
    setItem(key: string, value: string) {
      memory.set(key, value);
    },
    removeItem(key: string) {
      memory.delete(key);
    },
  };
  const previousWindow = globalThis.window;
  const previousStorage = globalThis.sessionStorage;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { dispatchEvent() {} },
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: storage,
  });
  try {
    // Entry helpers remain available for takeLeadRequestRestore cleanup.
    rememberLeadRequestEntry("gallery");
    assert.equal(peekLeadRequestEntry(), "gallery");
    storage.setItem(
      LEAD_REQUEST_RESTORE_KEY,
      JSON.stringify({
        mlsNumber: "W1234567",
        kind: "showing",
        message: "Saturday afternoon",
        focusNotes: null,
        callbackPath: LISTING,
        restoredAt: NOW,
      }),
    );
    const claimed = takeLeadRequestRestore("W1234567");
    assert.equal(claimed?.message, "Saturday afternoon");
    assert.equal(claimed?.mlsNumber, "W1234567");
    assert.equal(claimed?.kind, "showing");
    assert.equal(storage.getItem(LEAD_REQUEST_RESTORE_KEY), null);
    assert.equal(storage.getItem(LEAD_REQUEST_ENTRY_KEY), null);
    assert.equal(peekLeadRequestEntry(), null);
    rememberLeadRequestEntry("concierge");
    assert.equal(peekLeadRequestEntry(), "concierge");
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: previousStorage,
    });
  }
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
testSignupPrefillDoesNotEnterTheDraft();
testSaveFlowsStayAvailable();
testGa4LeadRequestFiresOnlyAfterSuccessfulLead();
testBookingSurfacesDoNotShareOneRestore();

void (null as CaptureIntent | null);

console.log("lead-request-intent selftest ok");
