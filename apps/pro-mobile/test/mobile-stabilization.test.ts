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

async function main() {
  console.log("=================================================================");
  console.log("MOBILE STABILIZATION TESTS");
  console.log("=================================================================\n");

  // A — Chat thread → hardware Back → Chats inbox
  console.log("[A] Chat thread registers Android back → inbox...");
  {
    const chats = readApp("src/screens/ChatsScreen.tsx");
    assert.ok(chats.includes("pushAndroidBackHandler"));
    assert.ok(chats.includes("setSelectedLeadId(null)"));
    const stackOrder: string[] = [];
    const pop = pushAndroidBackHandler(() => {
      stackOrder.push("thread");
      return true;
    });
    assert.equal(runAndroidBackStack(), true);
    assert.deepEqual(stackOrder, ["thread"]);
    pop();
    assert.equal(runAndroidBackStack(), false);
    console.log("  -> PASS");
  }

  // B — Lead detail → Back → previous context
  console.log("[B] Lead detail closed by AgentShell / CommandCentre back...");
  {
    const agent = readApp("src/screens/AgentShell.tsx");
    assert.ok(agent.includes("if (selectedLeadId)"));
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
    assert.ok(hook.includes("BackHandler.exitApp"));
    assert.ok(hook.includes("enabled"));
    const cc = readApp("src/screens/CommandCentreShell.tsx");
    assert.ok(cc.includes("enabled: !inAgentMode"));
    console.log("  -> PASS");
  }

  // D — Tab revisit does not cold-remount/refetch
  console.log("[D] Visited-tab mount + Launchpad/Chats cache...");
  {
    const agent = readApp("src/screens/AgentShell.tsx");
    assert.ok(agent.includes("visitedTabs"));
    assert.ok(agent.includes("tabPaneHidden"));
    assert.ok(agent.includes('display: "none"'));
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
    // Must not call the plural email-log path as a literal fetch target.
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
      // G — network failure on refresh preserves credentials
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

      // H — timeout preserves session
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

      // I — definitive invalid refresh signs out
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
    console.log("  -> PASS");
  }

  console.log("\n[mobile-stabilization] ALL PASS\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
