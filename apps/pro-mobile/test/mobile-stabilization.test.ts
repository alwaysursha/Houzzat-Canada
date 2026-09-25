/**
 * HouzzatPRO mobile stabilization — back, cache, lead chat, bootstrap, chats diag.
 * Run: node --import tsx apps/pro-mobile/test/mobile-stabilization.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  chatsDiagnosticLooksSafe,
  classifyChatsFailure,
  formatChatsLoadError,
  inspectAccessTokenClaims,
  type ChatsRequestDiagnostic,
} from "../src/lib/chats-diagnostics";
import {
  clearChatsInboxCache,
  getChatsInboxCache,
  setChatsInboxCache,
} from "../src/lib/chats-inbox-cache";
import {
  pushAndroidBackHandler,
  runAndroidBackStack,
} from "../src/lib/android-back-stack";
import {
  addAndroidHardwareBackListener,
  getLastAndroidHardwareBackEvent,
  __emitHardwareBackPress,
  __getAndroidHardwareBackExitAppCount,
  __getAndroidHardwareBackListenerCount,
  __resetAndroidHardwareBackForTests,
} from "../src/lib/android-hardware-back";
import { MobileAuthController } from "../src/state/auth-controller";
import { SecureStorage, SECURE_STORAGE_KEYS } from "../src/storage/secure-storage";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(APP, "../..");

function readApp(rel: string) {
  return readFileSync(join(APP, rel), "utf8");
}

function readRepo(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function makeFakeJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "none", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${header}.${payload}.sig`;
}

/** Mirrors AgentShell + ChatsScreen registration order for hardwareBackPress. */
function simulateChatsThreadHardwareBackHarness(opts: {
  threadOpen: boolean;
  activeTab: "chats" | "launchpad";
  registerDirectThreadListener: boolean;
  registerStackHandler: boolean;
}) {
  __resetAndroidHardwareBackForTests();

  let selectedLeadId: string | null = opts.threadOpen ? "lead_thread" : null;
  let selectedTitle: string | null = opts.threadOpen ? "Test Lead" : null;
  let chatsThreadOpen = opts.threadOpen;
  let activeTab: "chats" | "launchpad" = opts.activeTab;
  let exitViaShellDoubleBack = 0;
  let lastRootBackAt = 0;
  const EXIT_WINDOW_MS = 2200;

  const closeThread = () => {
    selectedLeadId = null;
    selectedTitle = null;
    chatsThreadOpen = false;
  };

  // Shell mounts first (earlier in LIFO list).
  const shellSub = addAndroidHardwareBackListener(() => {
    if (runAndroidBackStack()) {
      lastRootBackAt = 0;
      return true;
    }
    if (chatsThreadOpen) {
      closeThread();
      lastRootBackAt = 0;
      return true;
    }
    if (activeTab !== "launchpad") {
      activeTab = "launchpad";
      lastRootBackAt = 0;
      return true;
    }
    const now = Date.now();
    if (now - lastRootBackAt < EXIT_WINDOW_MS) {
      lastRootBackAt = 0;
      exitViaShellDoubleBack += 1;
      return true;
    }
    lastRootBackAt = now;
    return true;
  }, "agent-shell");

  let stackPop: (() => void) | null = null;
  if (opts.registerStackHandler && selectedLeadId) {
    stackPop = pushAndroidBackHandler(() => {
      closeThread();
      return true;
    });
  }

  let threadSub: { remove: () => void } | null = null;
  if (opts.registerDirectThreadListener && selectedLeadId) {
    // Registered after shell → LIFO: thread wins on one press.
    threadSub = addAndroidHardwareBackListener(() => {
      closeThread();
      return true;
    }, "chats-thread");
  }

  return {
    get state() {
      return {
        selectedLeadId,
        selectedTitle,
        chatsThreadOpen,
        activeTab,
        exitViaShellDoubleBack,
        exitAppCount: __getAndroidHardwareBackExitAppCount(),
        listenerCount: __getAndroidHardwareBackListenerCount(),
      };
    },
    emit: () => __emitHardwareBackPress(),
    closeThreadAndRemoveListeners: () => {
      closeThread();
      threadSub?.remove();
      threadSub = null;
      stackPop?.();
      stackPop = null;
    },
    dispose: () => {
      threadSub?.remove();
      stackPop?.();
      shellSub.remove();
      __resetAndroidHardwareBackForTests();
    },
  };
}

async function main() {
  console.log("=================================================================");
  console.log("MOBILE STABILIZATION TESTS");
  console.log("=================================================================\n");

  // A — Chat thread → emit hardwareBackPress → Chats inbox (not exit / not launchpad)
  console.log("[A] hardwareBackPress with open chat thread closes thread only...");
  {
    const chats = readApp("src/screens/ChatsScreen.tsx");
    assert.ok(chats.includes("addAndroidHardwareBackListener"));
    assert.ok(chats.includes('"chats-thread"'));
    assert.ok(chats.includes("pushAndroidBackHandler"));
    assert.ok(chats.includes("onThreadOpenChange"));
    assert.ok(chats.includes("threadCloseRef"));
    assert.ok(chats.includes("closeThread"));

    const harness = simulateChatsThreadHardwareBackHarness({
      threadOpen: true,
      activeTab: "chats",
      registerDirectThreadListener: true,
      registerStackHandler: true,
    });
    try {
      assert.equal(harness.state.selectedLeadId, "lead_thread");
      assert.ok(harness.state.listenerCount >= 2);

      const consumed = harness.emit();
      assert.equal(consumed, true);
      assert.equal(harness.state.selectedLeadId, null);
      assert.equal(harness.state.selectedTitle, null);
      assert.equal(harness.state.chatsThreadOpen, false);
      assert.equal(harness.state.activeTab, "chats");
      assert.equal(harness.state.exitAppCount, 0);
      assert.equal(harness.state.exitViaShellDoubleBack, 0);

      const last = getLastAndroidHardwareBackEvent();
      assert.ok(last);
      assert.equal(last?.source, "chats-thread");
      assert.equal(last?.consumed, true);
      assert.equal(last?.trigger, "test-emit");

      harness.closeThreadAndRemoveListeners();
      assert.equal(
        harness.state.listenerCount,
        1,
        "only shell listener remains after thread close",
      );
    } finally {
      harness.dispose();
    }
    console.log("  -> PASS");
  }

  // A2 — Shell fallback: no direct listener, stack empty, chatsThreadOpen → inbox
  console.log("[A2] Shell chatsThreadOpen fallback closes thread (no launchpad)...");
  {
    const agent = readApp("src/screens/AgentShell.tsx");
    assert.ok(agent.includes("chatsThreadOpen"));
    assert.ok(agent.includes("chatsThreadCloseRef"));
    assert.ok(agent.includes("onThreadOpenChange={ctx.setChatsThreadOpen}"));

    const harness = simulateChatsThreadHardwareBackHarness({
      threadOpen: true,
      activeTab: "chats",
      registerDirectThreadListener: false,
      registerStackHandler: false,
    });
    try {
      const consumed = harness.emit();
      assert.equal(consumed, true);
      assert.equal(harness.state.selectedLeadId, null);
      assert.equal(harness.state.activeTab, "chats");
      assert.equal(harness.state.exitAppCount, 0);
      const last = getLastAndroidHardwareBackEvent();
      assert.equal(last?.source, "agent-shell");
    } finally {
      harness.dispose();
    }
    console.log("  -> PASS");
  }

  // A3 — One press must not also switch Launchpad when direct listener wins
  console.log("[A3] Direct chats-thread listener prevents shell tab switch...");
  {
    const harness = simulateChatsThreadHardwareBackHarness({
      threadOpen: true,
      activeTab: "chats",
      registerDirectThreadListener: true,
      registerStackHandler: true,
    });
    try {
      harness.emit();
      assert.equal(harness.state.activeTab, "chats");
      assert.equal(harness.state.selectedLeadId, null);
      harness.closeThreadAndRemoveListeners();
      harness.emit();
      assert.equal(harness.state.activeTab, "launchpad");
      assert.equal(harness.state.exitAppCount, 0);
    } finally {
      harness.dispose();
    }
    console.log("  -> PASS");
  }

  // B — Lead detail → Back → previous context
  console.log("[B] Lead detail closed by AgentShell / CommandCentre back...");
  {
    const agent = readApp("src/screens/AgentShell.tsx");
    assert.ok(agent.includes("popLeadsStackIfPushed()"));
    assert.ok(agent.includes("leadsStackBackAction"));
    assert.ok(agent.includes("navigation.goBack()"));
    assert.ok(agent.includes("setSelectedLeadId(null)"));
    const cc = readApp("src/screens/CommandCentreShell.tsx");
    assert.ok(cc.includes("if (selectedLeadId)"));
    assert.ok(cc.includes("setSelectedLeadId(null)"));
    console.log("  -> PASS");
  }

  // C — Root double-back exit remains intentional
  console.log("[C] Root double-back exit + no dual shell handlers...");
  {
    const hook = readApp("src/hooks/useAndroidHardwareBack.ts");
    assert.ok(hook.includes("Press back again to exit"));
    assert.ok(hook.includes("androidHardwareBackExitApp"));
    assert.ok(hook.includes("addAndroidHardwareBackListener"));
    assert.ok(hook.includes("enabled"));
    const cc = readApp("src/screens/CommandCentreShell.tsx");
    assert.ok(cc.includes("enabled: !inAgentMode"));

    const harness = simulateChatsThreadHardwareBackHarness({
      threadOpen: false,
      activeTab: "launchpad",
      registerDirectThreadListener: false,
      registerStackHandler: false,
    });
    try {
      harness.emit();
      assert.equal(harness.state.exitViaShellDoubleBack, 0);
      harness.emit();
      assert.equal(harness.state.exitViaShellDoubleBack, 1);
      assert.equal(harness.state.activeTab, "launchpad");
    } finally {
      harness.dispose();
    }
    console.log("  -> PASS");
  }

  // C2 — Chats inbox (no thread) → shell navigates to launchpad, no exit
  console.log("[C2] Chats inbox hardwareBackPress → launchpad, no exit...");
  {
    const harness = simulateChatsThreadHardwareBackHarness({
      threadOpen: false,
      activeTab: "chats",
      registerDirectThreadListener: false,
      registerStackHandler: false,
    });
    try {
      const consumed = harness.emit();
      assert.equal(consumed, true);
      assert.equal(harness.state.activeTab, "launchpad");
      assert.equal(harness.state.exitAppCount, 0);
      assert.equal(harness.state.exitViaShellDoubleBack, 0);
    } finally {
      harness.dispose();
    }
    console.log("  -> PASS");
  }

  // D — Tab revisit does not cold-remount/refetch
  console.log("[D] Visited-tab mount + Launchpad/Chats cache...");
  {
    const agent = readApp("src/screens/AgentShell.tsx");
    assert.ok(agent.includes("detachInactiveScreens={false}"));
    assert.ok(agent.includes("lazy: true"));
    assert.ok(agent.includes("freezeOnBlur: true"));
    const launch = readApp("src/screens/LaunchpadScreen.tsx");
    assert.ok(launch.includes("FRESH_MS"));
    assert.ok(launch.includes("Skip immediate refetch"));
    const chats = readApp("src/screens/ChatsScreen.tsx");
    assert.ok(chats.includes("getChatsInboxCache"));
    assert.ok(chats.includes("setChatsInboxCache"));
    clearChatsInboxCache();
    setChatsInboxCache({
      workspaceId: "ws_a",
      rows: [],
      nextCursor: null,
      hasMore: false,
      filter: "all",
      q: "",
    });
    assert.ok(
      getChatsInboxCache({ workspaceId: "ws_a", filter: "all", q: "" }),
    );
    assert.equal(
      getChatsInboxCache({ workspaceId: "ws_b", filter: "all", q: "" }),
      null,
    );
    clearChatsInboxCache();
    console.log("  -> PASS");
  }

  // E — Lead Profile Conversations uses Conversation/Message
  console.log("[E] Lead Profile Conversations → singular conversation API...");
  {
    const detail = readApp("src/screens/LeadDetailScreen.tsx");
    const leadChat = readApp("src/components/LeadConversationTab.tsx");
    assert.ok(detail.includes("LeadConversationTab"));
    const idx = detail.indexOf('{tab === "conversations"');
    assert.ok(idx > 0);
    const end = detail.indexOf('{tab === "emails"', idx);
    const block = detail.slice(idx, end > idx ? end : idx + 300);
    assert.ok(block.includes("LeadConversationTab"));
    assert.equal(block.includes("ConversationsTab"), false);
    assert.ok(leadChat.includes("`/leads/${encodeURIComponent(leadId)}/conversation"));
    assert.ok(leadChat.includes("/conversation/messages"));
    assert.ok(leadChat.includes("/conversation/read"));
    assert.equal(
      /\/leads\/\$\{[^}]+\}\/conversations/.test(leadChat) ||
        leadChat.includes('"/conversations"') ||
        leadChat.includes("'/conversations'"),
      false,
    );
    assert.equal(leadChat.includes("leadEmailLog"), false);
    console.log("  -> PASS");
  }

  // F — Email logs not masquerading as canonical chat
  console.log("[F] Email logs under Emails tab only...");
  {
    const detail = readApp("src/screens/LeadDetailScreen.tsx");
    assert.ok(detail.includes('{ id: \"emails\", label: \"Emails\" }'));
    const emailIdx = detail.indexOf('{tab === "emails"');
    assert.ok(emailIdx > 0);
    const emailEnd = detail.indexOf('{tab === "engagement"', emailIdx);
    const emailBlock = detail.slice(
      emailIdx,
      emailEnd > emailIdx ? emailEnd : emailIdx + 400,
    );
    assert.ok(emailBlock.includes("ConversationsTab"));
    const emailTab = readApp("src/components/ConversationsTab.tsx");
    assert.ok(emailTab.includes("LeadEmailLog") || emailTab.includes("email-only"));
    assert.ok(emailTab.includes("/conversations"));
    console.log("  -> PASS");
  }

  // G/H/I — Bootstrap transient vs definitive auth death
  console.log("[G/H/I] Bootstrap network/timeout preserve; AUTH_REQUIRED signs out...");
  {
    const authSrc = readApp("src/state/auth-controller.ts");
    assert.ok(authSrc.includes('state: "BOOTSTRAP_RETRY"'));
    assert.ok(authSrc.includes("Transient refresh failure"));
    assert.ok(authSrc.includes("Network / timeout / 5xx"));
    assert.ok(authSrc.includes("retryBootstrap"));

    const originalFetch = globalThis.fetch;
    try {
      await SecureStorage.clear();
      await SecureStorage.setItem(
        SECURE_STORAGE_KEYS.AUTH_TOKENS,
        JSON.stringify({
          accessToken: "access_keep",
          refreshToken: "refresh_keep",
          expiresAt: Date.now() + 60_000,
        }),
      );
      await SecureStorage.setItem(
        SECURE_STORAGE_KEYS.USER_PROFILE,
        JSON.stringify({ id: "u1", email: "a@b.c", name: "A" }),
      );
      globalThis.fetch = (async () => {
        throw new TypeError("Network request failed");
      }) as typeof fetch;
      const authG = new MobileAuthController();
      await authG.bootstrap();
      const snapG = authG.getSnapshot();
      assert.equal(snapG.state, "BOOTSTRAP_RETRY");
      assert.ok(snapG.tokens?.refreshToken);
      assert.equal(
        await SecureStorage.getItem(SECURE_STORAGE_KEYS.AUTH_TOKENS) != null,
        true,
      );

      await SecureStorage.setItem(
        SECURE_STORAGE_KEYS.AUTH_TOKENS,
        JSON.stringify({
          accessToken: "access_keep2",
          refreshToken: "refresh_keep2",
          expiresAt: Date.now() + 60_000,
        }),
      );
      await SecureStorage.setItem(
        SECURE_STORAGE_KEYS.USER_PROFILE,
        JSON.stringify({ id: "u1", email: "a@b.c", name: "A" }),
      );
      globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
        const err = new Error("Aborted");
        err.name = "AbortError";
        if (init?.signal) {
          // mimic abort
        }
        throw err;
      }) as typeof fetch;
      const authH = new MobileAuthController();
      await authH.bootstrap();
      assert.equal(authH.getSnapshot().state, "BOOTSTRAP_RETRY");
      assert.ok(authH.getSnapshot().tokens?.refreshToken);

      await SecureStorage.setItem(
        SECURE_STORAGE_KEYS.AUTH_TOKENS,
        JSON.stringify({
          accessToken: "access_dead",
          refreshToken: "refresh_dead",
          expiresAt: Date.now() + 60_000,
        }),
      );
      await SecureStorage.setItem(
        SECURE_STORAGE_KEYS.USER_PROFILE,
        JSON.stringify({ id: "u1", email: "a@b.c", name: "A" }),
      );
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({
            ok: false,
            code: "AUTH_REQUIRED",
            message: "Refresh token revoked",
          }),
          { status: 401, headers: { "content-type": "application/json" } },
        )) as typeof fetch;
      const authI = new MobileAuthController();
      await authI.bootstrap();
      assert.equal(authI.getSnapshot().state, "SIGNED_OUT");
      assert.equal(authI.getSnapshot().tokens, null);
      assert.equal(
        await SecureStorage.getItem(SECURE_STORAGE_KEYS.AUTH_TOKENS),
        null,
      );
    } finally {
      globalThis.fetch = originalFetch;
      await SecureStorage.clear();
    }
    console.log("  -> PASS");
  }

  // J — Workspace membership security remains enforced
  console.log("[J] Workspace membership / Phase3 isolation still enforced...");
  {
    const authSrc = readApp("src/state/auth-controller.ts");
    assert.ok(authSrc.includes("selectWorkspace"));
    assert.ok(authSrc.includes("WORKSPACE_FORBIDDEN") || authSrc.includes("matched"));
    const phase3 = readRepo("scripts/identity-phase3-isolation-selftest.ts");
    assert.ok(phase3.length > 100);
    const tenant = readApp("test/tenant-isolation.test.ts");
    assert.ok(tenant.includes("WORKSPACE_FORBIDDEN"));
    console.log("  -> PASS");
  }

  // K — Chats 200 empty → "No chats yet"
  console.log("[K] Chats empty inbox copy...");
  {
    const chats = readApp("src/screens/ChatsScreen.tsx");
    assert.ok(chats.includes('"No chats yet"'));
    assert.ok(chats.includes("Customer conversations for this workspace appear here."));
    const diag = readApp("src/lib/chats-diagnostics.ts");
    assert.ok(diag.includes("Couldn't load chats"));
    console.log("  -> PASS");
  }

  // L/M/N/O — Chats diagnostics classes
  console.log("[L/M/N/O] Chats failure diagnostics...");
  {
    assert.equal(
      classifyChatsFailure({ httpStatus: 401, code: "AUTH_REQUIRED" }),
      "AUTH_REQUIRED",
    );
    assert.equal(
      classifyChatsFailure({ httpStatus: 403, code: "FORBIDDEN" }),
      "FORBIDDEN",
    );
    assert.equal(
      classifyChatsFailure({ httpStatus: 403, code: "WORKSPACE_FORBIDDEN" }),
      "WORKSPACE_FORBIDDEN",
    );
    assert.equal(
      classifyChatsFailure({ httpStatus: 500, code: "SERVER_ERROR" }),
      "SERVER_ERROR",
    );
    assert.equal(
      classifyChatsFailure({ httpStatus: null, code: "NETWORK_ERROR", network: true }),
      "NETWORK",
    );
    assert.ok(formatChatsLoadError({ diagClass: "AUTH_REQUIRED", serverMessage: null }).includes("[AUTH_REQUIRED]"));
    assert.ok(formatChatsLoadError({ diagClass: "FORBIDDEN", serverMessage: null }).includes("[FORBIDDEN]"));
    assert.ok(formatChatsLoadError({ diagClass: "SERVER_ERROR", serverMessage: null }).includes("[SERVER_ERROR]"));
    assert.ok(formatChatsLoadError({ diagClass: "NETWORK", serverMessage: null }).includes("[NETWORK]"));
    const chats = readApp("src/screens/ChatsScreen.tsx");
    assert.ok(chats.includes("formatChatsLoadError"));
    assert.ok(chats.includes("diagHint"));
    console.log("  -> PASS");
  }

  // P — No raw tokens/secrets in diagnostic output
  console.log("[P] Diagnostics never emit raw tokens/secrets...");
  {
    const jwt = makeFakeJwt({
      type: "mobile_workspace_access",
      wsId: "ws_x",
      role: "AGENT",
      exp: Math.floor(Date.now() / 1000) + 900,
    });
    const claims = inspectAccessTokenClaims(jwt);
    assert.equal(claims.present, true);
    assert.equal(claims.type, "mobile_workspace_access");
    assert.equal(claims.workspaceIdPresent, true);
    assert.equal(claims.role, "AGENT");
    assert.equal(claims.expiryState, "valid");
    const diag: ChatsRequestDiagnostic = {
      requestAttempted: true,
      accessTokenPresent: claims.present,
      tokenType: claims.type,
      workspaceIdPresent: claims.workspaceIdPresent,
      role: claims.role,
      tokenExpiryState: claims.expiryState,
      initialHttpStatus: 401,
      refreshAttempted: true,
      refreshSucceeded: false,
      retryHttpStatus: null,
      serverCode: "AUTH_REQUIRED",
      serverMessage: "Authentication required",
      unwrapSucceeded: null,
      diagClass: "AUTH_REQUIRED",
    };
    assert.equal(chatsDiagnosticLooksSafe(diag), true);
    assert.equal(
      chatsDiagnosticLooksSafe({
        Authorization: `Bearer ${jwt}`,
        accessToken: jwt,
      }),
      false,
    );
    assert.equal(
      chatsDiagnosticLooksSafe({ refreshToken: "rt_secret_value" }),
      false,
    );
    const msg = formatChatsLoadError(diag);
    assert.equal(msg.includes(jwt), false);
    assert.equal(msg.includes("Bearer"), false);

    const backDiag = readApp("src/lib/android-hardware-back.ts");
    assert.ok(backDiag.includes("getLastAndroidHardwareBackEvent"));
    assert.ok(backDiag.includes("[AndroidBack]"));
    assert.equal(backDiag.includes("accessToken"), false);
    assert.equal(backDiag.includes("refreshToken"), false);
    console.log("  -> PASS");
  }

  console.log("\n[mobile-stabilization] ALL PASS\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
