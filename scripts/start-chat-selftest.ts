/**
 * Anonymous Chat Capture Intent. Does not send messages.
 * Run: pnpm start-chat:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleCustomerConversationSend } from "../src/lib/conversations/customer-conversation";
import {
  CAPTURE_INTENT_TTL_MS,
  peekPendingIntent,
  type CaptureIntentStore,
} from "../src/lib/auth/capture-intent";
import { dispatchPendingCaptureIntent } from "../src/lib/auth/capture-intent-dispatch";
import {
  START_CHAT_CALLBACK_PATH,
  ensureStartChatIntentHandler,
  openGuestStartChatIntent,
  resumeStartChatIntent,
} from "../src/lib/auth/start-chat-intent";

const HOST = "acme.houzzatpro.com";
const NOW = 1_700_000_000_000;

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

function storedIntent(store: { raw: string | null }): Record<string, unknown> {
  assert.ok(store.raw);
  const record = JSON.parse(store.raw) as { intent?: Record<string, unknown> };
  assert.ok(record.intent);
  return record.intent;
}

function open(store: CaptureIntentStore) {
  const opened: { mode?: string; callbackUrl: string }[] = [];
  const result = openGuestStartChatIntent({
    host: HOST,
    now: NOW,
    store,
    openAuth(options) {
      opened.push(options);
    },
  });
  return { result, opened };
}

function testAnonymousEntriesStoreStartChat() {
  assert.equal(START_CHAT_CALLBACK_PATH, "/account/chat");
  const fab = readFileSync(
    "src/components/customer-chat/CustomerChatFab.tsx",
    "utf8",
  );
  assert.match(
    fab,
    /status === "authenticated"[\s\S]*href=\{CUSTOMER_CHAT_PAGE_HREF\}[\s\S]*openGuestStartChatIntent/,
  );
  assert.equal(fab.includes("fetch("), false);

  const nav = readFileSync("src/components/site/MobileBottomNav.tsx", "utf8");
  const signedNav = nav.slice(
    nav.indexOf("{signedIn ? ("),
    nav.indexOf(") : ("),
  );
  assert.match(signedNav, /href=\{CUSTOMER_CHAT_PAGE_HREF\}/);
  assert.equal(signedNav.includes("openGuestStartChatIntent"), false);
  const guestAt = nav.indexOf("openGuestStartChatIntent({");
  assert.ok(guestAt > nav.indexOf("href={CUSTOMER_CHAT_PAGE_HREF}"));
  const guestNav = nav.slice(guestAt, nav.indexOf("<MoreLink", guestAt));
  assert.match(guestNav, /openGuestStartChatIntent/);
  assert.equal(guestNav.includes("fetch("), false);

  const direct = readFileSync("src/app/(account)/account/layout.tsx", "utf8");
  assert.match(direct, /accountSignInHref/);
  assert.equal(direct.includes("START_CHAT"), false);
}

function testIntentIsCallbackOnlyAndOpensAuth() {
  const store = memoryStore();
  let fetches = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (() => {
    fetches += 1;
    throw new Error("chat must not fetch");
  }) as typeof fetch;
  let opened: { mode?: string; callbackUrl: string }[] = [];
  try {
    const result = open(store);
    opened = result.opened;
    assert.equal(result.result.ok, true);
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(fetches, 0);
  assert.deepEqual(opened, [
    { mode: "sign-in", callbackUrl: "/account/chat", intent: "START_CHAT" },
  ]);
  const body = storedIntent(store);
  assert.equal(body.type, "START_CHAT");
  assert.equal(body.callbackPath, "/account/chat");
  assert.deepEqual(Object.keys(body).sort(), [
    "callbackPath",
    "createdAt",
    "host",
    "type",
  ]);
  assert.equal("mlsNumber" in body, false);
  assert.equal("message" in body, false);
  assert.equal("leadId" in body, false);
  assert.equal("conversationId" in body, false);
}

function testUnexpectedFieldsRejected() {
  const store = memoryStore();
  open(store);
  const intent = storedIntent(store);
  const poisoned = memoryStore();
  poisoned.set(
    JSON.stringify({
      v: 1,
      intent: { ...intent, mlsNumber: "W123", message: "hello", leadId: "l1" },
    }),
  );
  const peeked = peekPendingIntent(poisoned, { host: HOST, now: NOW + 1 });
  assert.equal(peeked.ok, false);
}

function testResumeOpensChatAndDoesNotSend() {
  const store = memoryStore();
  const created = open(store);
  assert.equal(created.result.ok, true);
  if (!created.result.ok) return;
  const visits: string[] = [];
  const fromListing = resumeStartChatIntent(created.result.intent, {
    pathname: "/listing/12-main-st/W1234567",
    navigate(path) {
      visits.push(path);
    },
  });
  assert.equal(fromListing, "opened");
  assert.deepEqual(visits, ["/account/chat"]);

  const already = resumeStartChatIntent(created.result.intent, {
    pathname: "/account/chat",
    navigate() {
      throw new Error("already on chat");
    },
  });
  assert.equal(already, "opened");

  const signIn = readFileSync("src/components/auth/SignInForm.tsx", "utf8");
  const signUp = readFileSync("src/components/auth/SignUpForm.tsx", "utf8");
  assert.match(signIn, /authSuccessReturnPath\(callbackUrl\)/);
  assert.match(signUp, /authSuccessReturnPath\(callbackUrl\)/);

  const moduleSource = readFileSync("src/lib/auth/start-chat-intent.ts", "utf8");
  assert.equal(moduleSource.includes("fetch("), false);
  assert.equal(moduleSource.includes("/api/account/conversation"), false);
  assert.equal(moduleSource.includes("ensureCustomerChatLead"), false);
  assert.equal(moduleSource.includes("mlsNumber"), false);
}

function testWrongHostAndExpiry() {
  const store = memoryStore();
  open(store);
  const mismatch = dispatchPendingCaptureIntent(store, {
    host: "other.houzzatpro.com",
    now: NOW + 1,
  });
  assert.equal(mismatch.status, "rejected");
  if (mismatch.status === "rejected") {
    assert.equal(mismatch.reason, "host_mismatch");
  }
  assert.equal(store.raw, null);

  const expiredStore = memoryStore();
  open(expiredStore);
  const expired = dispatchPendingCaptureIntent(expiredStore, {
    host: HOST,
    now: NOW + CAPTURE_INTENT_TTL_MS + 5_000,
  });
  assert.equal(expired.status, "rejected");
  if (expired.status === "rejected") assert.equal(expired.reason, "expired");
  assert.equal(expiredStore.raw, null);
}

function testHandlerNavigatesOnce() {
  const store = memoryStore();
  open(store);
  ensureStartChatIntentHandler();
  const first = dispatchPendingCaptureIntent(store, { host: HOST, now: NOW + 1 });
  assert.equal(first.status, "ready");
  if (first.status === "ready") {
    assert.equal(first.intent.type, "START_CHAT");
    if (first.intent.type === "START_CHAT") {
      assert.equal(first.intent.callbackPath, "/account/chat");
    }
  }
  const second = dispatchPendingCaptureIntent(store, { host: HOST, now: NOW + 2 });
  assert.equal(second.status, "none");
}

function testConversationRulesUnchanged() {
  const conversation = readFileSync(
    "src/lib/conversations/lead-conversation.ts",
    "utf8",
  );
  assert.match(conversation, /workspaceId_leadId/);
  assert.match(conversation, /P2002/);
  const resolver = readFileSync(
    "src/lib/conversations/customer-chat-lead.ts",
    "utf8",
  );
  assert.match(resolver, /assignedAgentId: null/);
  assert.match(resolver, /Do NOT call `routeExistingLead`/);
  const get = readFileSync(
    "src/lib/conversations/customer-conversation.ts",
    "utf8",
  );
  assert.match(get, /resolveCustomerChatLead/);
  assert.match(get, /ensureCustomerChatLead/);
  assert.match(get, /requireFullCustomerUser/);
}

async function testAnonymousAndUnverifiedCannotSend() {
  const request = () =>
    new Request("https://acme.houzzatpro.com/api/account/conversation/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "hello" }),
    });
  const db = new Proxy(
    {},
    {
      get() {
        throw new Error("send touched persistence");
      },
    },
  );
  const anonymous = await handleCustomerConversationSend(request(), {
    db: db as never,
    requireSendAccess: async () => ({
      ok: false,
      status: 401,
      body: { error: "Sign in required.", requiresAuth: true },
    }),
  });
  assert.equal(anonymous.status, 401);
  const unverified = await handleCustomerConversationSend(request(), {
    db: db as never,
    requireSendAccess: async () => ({
      ok: false,
      status: 403,
      body: {
        error: "Email verification required.",
        requiresEmailVerification: true,
      },
    }),
  });
  assert.equal(unverified.status, 403);
  const route = readFileSync(
    "src/app/api/account/conversation/messages/route.ts",
    "utf8",
  );
  assert.match(route, /handleCustomerConversationSend/);
  assert.equal(route.includes("requireSendAccess"), false);
}

async function main() {
  testAnonymousEntriesStoreStartChat();
  testIntentIsCallbackOnlyAndOpensAuth();
  testUnexpectedFieldsRejected();
  testResumeOpensChatAndDoesNotSend();
  testWrongHostAndExpiry();
  testHandlerNavigatesOnce();
  testConversationRulesUnchanged();
  await testAnonymousAndUnverifiedCannotSend();
  console.log("start-chat selftest ok");
}

void main();
