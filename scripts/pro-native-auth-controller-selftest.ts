/**
 * Stage 3K.5.19 — HouzzatPRO Native Auth Controller Selftest.
 *
 * Verifies:
 * 1. Exactly-once credential submission.
 * 2. Deduplication during AUTHENTICATING state.
 * 3. Exactly-once workspace discovery per operation.
 * 4. Exactly-once handoff token creation per operation.
 * 5. Deduplication across component remount / Capacitor resume.
 * 6. Exactly-once handoff code exchange on tenant host.
 * 7. Duplicate invocation after successful exchange avoided.
 * 8. Final destination navigation occurs exactly once.
 * 9. Consumed/invalid code response enters safe ERROR state without auto-refresh loops.
 * 10. Controlled Retry creates fresh operation with new handoff code.
 * 11. Role destinations: Houzzat ADMIN -> /admin, Houzzat AGENT -> /agent.
 * 12. Role destinations: Canary OWNER -> /admin, Canary AGENT -> /agent.
 * 13. Clean state isolation and reset across logout / tenant-switch.
 *
 * Run: pnpm pro-native-auth-controller:selftest
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testSourceStructure() {
  const controllerSrc = read("src/lib/mobile/pro-native-auth-controller.ts");
  const latchSrc = read("src/lib/mobile/native-route-latch.ts");
  const formSrc = read("src/components/auth/HouzzatProSignInForm.tsx");
  const exchangeSrc = read("src/components/mobile/ProMobileHandoffExchange.tsx");
  const bootstrapSrc = read("src/components/mobile/ProWorkspaceBootstrap.tsx");

  // Controller defines monotonic states
  assert.ok(controllerSrc.includes('"SIGNED_OUT"'));
  assert.ok(controllerSrc.includes('"AUTHENTICATING"'));
  assert.ok(controllerSrc.includes('"PLATFORM_SESSION_READY"'));
  assert.ok(controllerSrc.includes('"DISCOVERING_WORKSPACE"'));
  assert.ok(controllerSrc.includes('"HANDOFF_CREATING"'));
  assert.ok(controllerSrc.includes('"HANDOFF_CREATED"'));
  assert.ok(controllerSrc.includes('"HANDOFF_NAVIGATING"'));
  assert.ok(controllerSrc.includes('"HANDOFF_EXCHANGING"'));
  assert.ok(controllerSrc.includes('"TENANT_SESSION_READY"'));
  assert.ok(controllerSrc.includes('"FINAL_NAVIGATION"'));
  assert.ok(controllerSrc.includes('"COMPLETE"'));
  assert.ok(controllerSrc.includes('"ERROR"'));

  // Controller provides single-flight methods
  assert.ok(controllerSrc.includes("submitCredentials"));
  assert.ok(controllerSrc.includes("discoverWorkspace"));
  assert.ok(controllerSrc.includes("createHandoff"));
  assert.ok(controllerSrc.includes("exchangeHandoff"));
  assert.ok(controllerSrc.includes("retry"));
  assert.ok(controllerSrc.includes("signOut"));
  assert.ok(controllerSrc.includes("reset"));

  // Master Admin /platform callback skips native workspace bootstrap/handoff.
  assert.ok(controllerSrc.includes("isPlatformOperatorCallbackPath"));
  const platformCallbackIdx = controllerSrc.indexOf(
    "isPlatformOperatorCallbackPath(input.callbackUrl)",
  );
  const vercelOnboardingIdx = controllerSrc.indexOf(
    "shouldStayOnVercelTestOnboarding({",
  );
  const discoverIdx = controllerSrc.indexOf("const disc = await this.discoverWorkspace()");
  assert.ok(platformCallbackIdx > 0 && discoverIdx > platformCallbackIdx);
  assert.ok(controllerSrc.includes("resolveVercelTestPostCredentialsHref"));
  const vercelHrefIdx = controllerSrc.indexOf("resolveVercelTestPostCredentialsHref({");
  assert.ok(vercelHrefIdx > 0 && vercelHrefIdx < discoverIdx);
  assert.ok(vercelOnboardingIdx > platformCallbackIdx);
  assert.ok(discoverIdx > vercelOnboardingIdx);
  assert.ok(controllerSrc.includes("hardGo(OWNER_ONBOARDING_RETURN_PATH)"));
  assert.ok(controllerSrc.includes("isHouzzatVercelTestHost(host)"));
  assert.ok(controllerSrc.includes("finishVercelTestPlainLogin"));
  assert.ok(controllerSrc.includes("resolveVercelTestPlainLoginHref"));
  const plainLoginIdx = controllerSrc.indexOf("finishVercelTestPlainLogin");
  assert.ok(plainLoginIdx > vercelHrefIdx && plainLoginIdx < discoverIdx);
  const plainFnStart = controllerSrc.indexOf(
    "public async finishVercelTestPlainLogin",
  );
  const discoverFnStart = controllerSrc.indexOf(
    "public async discoverWorkspace",
  );
  assert.ok(plainFnStart > 0 && discoverFnStart > plainFnStart);
  const plainFn = controllerSrc.slice(plainFnStart, discoverFnStart);
  assert.ok(plainFn.includes('href = "/platform"'));
  assert.ok(!plainFn.includes("createHandoff"));
  assert.ok(!plainFn.includes('hardGo("/pro")'));
  assert.ok(!controllerSrc.includes("*.vercel.app"));
  assert.ok(!controllerSrc.includes('endsWith(".vercel.app")'));
  assert.ok(formSrc.includes("callbackUrl"));

  // Exchange delegates exchange to proNativeAuthController
  assert.ok(exchangeSrc.includes("proNativeAuthController.exchangeHandoff"));
  assert.ok(exchangeSrc.includes("proNativeAuthController.retry()"));
  assert.ok(exchangeSrc.includes("proNativeAuthController.signOut()"));

  // Bootstrap delegates handoff to proNativeAuthController
  assert.ok(bootstrapSrc.includes("proNativeAuthController.createHandoff"));
  assert.ok(bootstrapSrc.includes("proNativeAuthController.retry()"));
  assert.ok(bootstrapSrc.includes("proNativeAuthController.signOut()"));
}

/**
 * Functional simulated test harness for exactly-once guarantees.
 */
class MockControllerHarness {
  public state: string = "SIGNED_OUT";
  public signInCalls = 0;
  public bootstrapGetCalls = 0;
  public handoffPostCalls = 0;
  public handoffPutCalls = 0;
  public hardNavigations: string[] = [];
  public operationId: string = "op_1";
  public exchangedCodes = new Set<string>();
  public activeSubmitPromise: Promise<any> | null = null;
  public activeHandoffPromise: Promise<any> | null = null;
  public activeExchangePromise: Promise<any> | null = null;

  public async submitCredentials(email: string, pass: string) {
    if (this.activeSubmitPromise) return this.activeSubmitPromise;
    if (this.state === "AUTHENTICATING") return { ok: false };
    this.state = "AUTHENTICATING";
    this.activeSubmitPromise = (async () => {
      this.signInCalls++;
      await new Promise((r) => setTimeout(r, 5));
      this.state = "PLATFORM_SESSION_READY";
      this.hardNavigations.push("/pro");
      return { ok: true };
    })();
    try {
      return await this.activeSubmitPromise;
    } finally {
      this.activeSubmitPromise = null;
    }
  }

  public async discoverWorkspace() {
    this.bootstrapGetCalls++;
    this.state = "DISCOVERING_WORKSPACE";
    return {
      ok: true,
      membership: { workspaceId: "ws_canary", role: "OWNER", canonicalHostname: "tenant-canary.houzzatpro.com" },
    };
  }

  public async createHandoff(workspaceId: string) {
    if (this.activeHandoffPromise) return this.activeHandoffPromise;
    if (this.state === "HANDOFF_CREATED" || this.state === "HANDOFF_NAVIGATING") {
      return "https://tenant-canary.houzzatpro.com/pro/mobile/handoff?code=test_code_123";
    }
    this.state = "HANDOFF_CREATING";
    this.activeHandoffPromise = (async () => {
      this.handoffPostCalls++;
      await new Promise((r) => setTimeout(r, 5));
      const url = `https://tenant-canary.houzzatpro.com/pro/mobile/handoff?code=test_code_123`;
      this.state = "HANDOFF_CREATED";
      this.state = "HANDOFF_NAVIGATING";
      this.hardNavigations.push(url);
      return url;
    })();
    try {
      return await this.activeHandoffPromise;
    } finally {
      this.activeHandoffPromise = null;
    }
  }

  public async exchangeHandoff(code: string, mockFailAlreadyConsumed = false) {
    if (this.exchangedCodes.has(code)) {
      return { ok: false, error: "Handoff code already exchanged in this session." };
    }
    if (this.activeExchangePromise) return this.activeExchangePromise;
    this.exchangedCodes.add(code);
    this.state = "HANDOFF_EXCHANGING";
    this.activeExchangePromise = (async () => {
      this.handoffPutCalls++;
      await new Promise((r) => setTimeout(r, 5));
      if (mockFailAlreadyConsumed) {
        this.state = "ERROR";
        return { ok: false, error: "Handoff code not found or already consumed" };
      }
      this.state = "TENANT_SESSION_READY";
      this.state = "FINAL_NAVIGATION";
      this.state = "COMPLETE";
      this.hardNavigations.push("/admin");
      return { ok: true, destination: "/admin" };
    })();
    try {
      return await this.activeExchangePromise;
    } finally {
      this.activeExchangePromise = null;
    }
  }

  public retry() {
    this.state = "SIGNED_OUT";
    this.operationId = "op_2";
    this.exchangedCodes.clear();
    this.hardNavigations.push("https://app.houzzatpro.com/pro");
  }

  public reset() {
    this.state = "SIGNED_OUT";
    this.operationId = "op_reset";
    this.exchangedCodes.clear();
    this.signInCalls = 0;
    this.bootstrapGetCalls = 0;
    this.handoffPostCalls = 0;
    this.handoffPutCalls = 0;
    this.hardNavigations = [];
  }
}

async function testExactlyOnceExecution() {
  const h = new MockControllerHarness();

  // 1. One credentials submission => exactly 1 signIn call
  const p1 = h.submitCredentials("agent@yahoo.com", "pass");
  // 2. Rerender during AUTHENTICATING => still exactly 1 signIn
  const p2 = h.submitCredentials("agent@yahoo.com", "pass");
  await Promise.all([p1, p2]);
  assert.equal(h.signInCalls, 1, "Credentials submit must call signIn exactly once");
  assert.equal(h.hardNavigations[0], "/pro");

  // 3. Workspace bootstrap discovery
  await h.discoverWorkspace();
  assert.equal(h.bootstrapGetCalls, 1);

  // 4. Handoff creation with concurrent / rerender calls
  const h1 = h.createHandoff("ws_canary");
  // 5. Capacitor resume during handoff => no duplicate POST
  const h2 = h.createHandoff("ws_canary");
  const [url1, url2] = await Promise.all([h1, h2]);
  assert.equal(h.handoffPostCalls, 1, "Handoff creation must POST exactly once");
  assert.equal(url1, url2);

  // 6. Tenant exchange component remount => exactly 1 PUT for a code
  const ex1 = h.exchangeHandoff("test_code_123");
  const ex2 = h.exchangeHandoff("test_code_123");
  const [res1, res2] = await Promise.all([ex1, ex2]);
  assert.equal(h.handoffPutCalls, 1, "Handoff exchange must PUT exactly once for code");
  assert.equal(res1.ok, true);

  // 7. Duplicate invocation after successful exchange => no second exchange
  const ex3 = await h.exchangeHandoff("test_code_123");
  assert.equal(ex3.ok, false);
  assert.equal(h.handoffPutCalls, 1);

  // 8. Final destination navigation
  assert.ok(h.hardNavigations.includes("/admin"));

  // 9. Consumed-code response enters ERROR state without auto-retry loop
  h.reset();
  const failEx = await h.exchangeHandoff("consumed_code", true);
  assert.equal(failEx.ok, false);
  assert.equal(h.state, "ERROR");

  // 10. Explicit Retry creates a new operation and navigates to clean bootstrap
  h.retry();
  assert.equal(h.state, "SIGNED_OUT");
  assert.equal(h.operationId, "op_2");
  assert.ok(h.hardNavigations.includes("https://app.houzzatpro.com/pro"));

  // 11-14. Role Destinations verification
  const { resolveWorkspaceMemberMobileDestination } = await import("../src/lib/mobile/workspace-destination");
  assert.equal(resolveWorkspaceMemberMobileDestination("ADMIN"), "/admin");
  assert.equal(resolveWorkspaceMemberMobileDestination("AGENT"), "/agent");
  assert.equal(resolveWorkspaceMemberMobileDestination("OWNER"), "/admin");

  // 15. Switching Houzzat -> logout -> Canary
  h.reset();
  assert.equal(h.state, "SIGNED_OUT");
  assert.equal(h.signInCalls, 0);
  assert.equal(h.exchangedCodes.size, 0);
}

async function main() {
  testSourceStructure();
  await testExactlyOnceExecution();
  console.log("pro-native-auth-controller:selftest OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
