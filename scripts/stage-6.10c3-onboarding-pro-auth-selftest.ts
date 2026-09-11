/**
 * Stage 6.10C.3 — OWNER onboarding Pro sign-in + handoff return selftest.
 * Run: pnpm stage-6.10c3-onboarding-pro-auth:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendOwnerOnboardingAuthQuery,
  buildHouzzatVercelTestOnboardingSignInUrl,
  buildOwnerOnboardingProSignInUrl,
  OWNER_ONBOARDING_RETURN_PATH,
  parseOwnerOnboardingAuthSearchParams,
  resolveHandoffDestinationWithReturnPath,
  sanitizeOwnerOnboardingReturnPath,
  sanitizeWorkspaceHintId,
  selectMembershipForWorkspaceHint,
} from "@/lib/platform/activation/onboarding-pro-auth";
import {
  buildMobileHandoffIdentifier,
  parseMobileHandoffIdentifier,
} from "@/lib/mobile/mobile-workspace-handoff";
import { resolveMobileWorkspaceBootstrapState } from "@/lib/mobile/workspace-bootstrap";
import { isSuccessfulHandoffClientDestination } from "@/lib/mobile/workspace-destination";
import { HOUZZATPRO_APP_BOOTSTRAP_ORIGIN } from "@/lib/mobile/platform-bootstrap";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_REMAX = "cmtn5glsq0005psp7z8wk891q";
const WS_OTHER = "ws_other_owned_fixture01";
const USER = "user_fixture_12345678";

function membership(workspaceId: string, slug: string, host: string) {
  return {
    workspaceId,
    role: "OWNER" as const,
    name: slug,
    slug,
    displayName: slug,
    primaryColor: null,
    canonicalHostname: host,
    canonicalOrigin: `https://${host}`,
  };
}

function testSourceGuards() {
  const page = read("src/app/(app)/onboarding/page.tsx");
  assert.ok(page.includes("buildOwnerOnboardingProSignInUrl"));
  assert.ok(page.includes("buildHouzzatVercelTestOnboardingSignInUrl"));
  assert.ok(page.includes("isHouzzatVercelTestHost"));
  assert.ok(page.includes("resolveRequestTenancy"));
  assert.ok(!page.includes("/auth/sign-in?callbackUrl=/onboarding"));
  assert.ok(!page.includes("/auth/signin"));
  assert.ok(!page.includes("*.vercel.app"));
  assert.ok(!page.includes('endsWith(".vercel.app")'));

  const bridge = read("src/components/auth/AuthRouteBridge.tsx");
  // Must not "fix" onboarding by mapping to / in the consumer bridge.
  assert.ok(!bridge.includes('"/onboarding"'));

  const handoffRoute = read("src/app/api/mobile/workspace-handoff/route.ts");
  assert.ok(handoffRoute.includes("returnPath"));
  assert.ok(handoffRoute.includes('"/onboarding"'));

  console.log("[0] Source guards... PASS");
}

function testReturnPathSanitization() {
  assert.equal(
    sanitizeOwnerOnboardingReturnPath("/onboarding"),
    OWNER_ONBOARDING_RETURN_PATH,
  );
  assert.equal(sanitizeOwnerOnboardingReturnPath("/onboarding/"), "/onboarding");
  assert.equal(sanitizeOwnerOnboardingReturnPath(null), null);
  assert.equal(sanitizeOwnerOnboardingReturnPath(""), null);
  assert.equal(sanitizeOwnerOnboardingReturnPath("https://evil.example/"), null);
  assert.equal(sanitizeOwnerOnboardingReturnPath("//evil.example"), null);
  assert.equal(sanitizeOwnerOnboardingReturnPath("/\\evil"), null);
  assert.equal(sanitizeOwnerOnboardingReturnPath("/%2f%2fevil.example"), null);
  assert.equal(sanitizeOwnerOnboardingReturnPath("/admin"), null);
  assert.equal(sanitizeOwnerOnboardingReturnPath("/onboarding?x=1"), null);
  assert.equal(sanitizeOwnerOnboardingReturnPath("/onboarding#x"), null);
  assert.equal(sanitizeOwnerOnboardingReturnPath("/../onboarding"), null);
  assert.equal(
    sanitizeOwnerOnboardingReturnPath("http://re-max-realty.houzzatpro.com/onboarding"),
    null,
  );

  console.log("[1] Return path sanitization... PASS");
}

function testProSignInUrl() {
  const url = buildOwnerOnboardingProSignInUrl({
    workspaceId: WS_REMAX,
    returnPath: "/onboarding",
  });
  assert.ok(url.startsWith(`${HOUZZATPRO_APP_BOOTSTRAP_ORIGIN}/pro/sign-in?`));
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("returnPath"), "/onboarding");
  assert.equal(parsed.searchParams.get("workspaceHint"), WS_REMAX);
  assert.equal(parsed.searchParams.get("callbackUrl"), null);

  const vercelUrl = buildHouzzatVercelTestOnboardingSignInUrl({
    workspaceId: WS_REMAX,
    returnPath: "/onboarding",
  });
  assert.equal(vercelUrl.startsWith("/pro/sign-in?"), true);
  assert.equal(vercelUrl.includes("app.houzzatpro.com"), false);
  const vercelParsed = new URL(vercelUrl, "https://houzzat-vercel-test.vercel.app");
  assert.equal(vercelParsed.searchParams.get("callbackUrl"), "/onboarding");
  assert.equal(vercelParsed.searchParams.get("returnPath"), "/onboarding");
  assert.equal(vercelParsed.searchParams.get("workspaceHint"), WS_REMAX);

  // Malicious returnPath collapses to allowlisted /onboarding when building onboarding URL
  // (builder always forces onboarding allowlist default).
  const evil = buildOwnerOnboardingProSignInUrl({
    workspaceId: WS_REMAX,
    returnPath: "https://evil.example",
  });
  assert.equal(new URL(evil).searchParams.get("returnPath"), "/onboarding");

  // Invalid workspace id shape → no hint param
  const noHint = buildOwnerOnboardingProSignInUrl({
    workspaceId: "!!",
    returnPath: "/onboarding",
  });
  assert.equal(new URL(noHint).searchParams.get("workspaceHint"), null);

  console.log("[2] Pro sign-in URL... PASS");
}

function testWorkspaceHintNonAuthoritative() {
  assert.equal(sanitizeWorkspaceHintId(WS_REMAX), WS_REMAX);
  assert.equal(sanitizeWorkspaceHintId("evil"), null);
  assert.equal(sanitizeWorkspaceHintId("../../x"), null);

  const remMax = membership(WS_REMAX, "re-max-realty", "re-max-realty.houzzatpro.com");
  const other = membership(WS_OTHER, "other", "other.houzzatpro.com");

  // Hint matches → handoff to that membership only
  const hinted = resolveMobileWorkspaceBootstrapState({
    authenticated: true,
    requestHostname: "app.houzzatpro.com",
    memberships: [remMax, other],
    currentHostMembership: null,
    workspaceHint: WS_REMAX,
  });
  assert.equal(hinted.kind, "handoff");
  if (hinted.kind === "handoff") {
    assert.equal(hinted.membership.workspaceId, WS_REMAX);
  }

  // Hint for workspace user does not belong to → ignore, keep multi picker
  const ignored = resolveMobileWorkspaceBootstrapState({
    authenticated: true,
    requestHostname: "app.houzzatpro.com",
    memberships: [other],
    currentHostMembership: null,
    workspaceHint: WS_REMAX,
  });
  assert.equal(ignored.kind, "handoff");
  if (ignored.kind === "handoff") {
    assert.equal(ignored.membership.workspaceId, WS_OTHER);
  }

  // Multi without matching hint → picker (cannot bypass via return metadata)
  const multi = resolveMobileWorkspaceBootstrapState({
    authenticated: true,
    requestHostname: "app.houzzatpro.com",
    memberships: [remMax, other],
    currentHostMembership: null,
    workspaceHint: null,
  });
  assert.equal(multi.kind, "select_workspace");

  assert.equal(
    selectMembershipForWorkspaceHint([remMax, other], WS_REMAX)?.workspaceId,
    WS_REMAX,
  );
  assert.equal(
    selectMembershipForWorkspaceHint([other], WS_REMAX),
    null,
  );

  console.log("[3] Workspace hint membership validation... PASS");
}

function testHandoffDestinationAndIdentifier() {
  assert.equal(
    resolveHandoffDestinationWithReturnPath({
      workspaceRole: "OWNER",
      returnPath: "/onboarding",
    }),
    "/onboarding",
  );
  assert.equal(
    resolveHandoffDestinationWithReturnPath({
      workspaceRole: "OWNER",
      returnPath: "//evil.example",
    }),
    "/admin",
  );
  assert.equal(
    resolveHandoffDestinationWithReturnPath({
      workspaceRole: "AGENT",
      returnPath: null,
    }),
    "/agent",
  );

  const id = buildMobileHandoffIdentifier({
    userId: USER,
    workspaceId: WS_REMAX,
    targetHostname: "re-max-realty.houzzatpro.com",
    returnPath: "/onboarding",
  });
  const parsed = parseMobileHandoffIdentifier(id);
  assert.equal(parsed?.returnPath, "/onboarding");
  assert.equal(parsed?.workspaceId, WS_REMAX);
  assert.equal(parsed?.targetHostname, "re-max-realty.houzzatpro.com");

  // Tampered absolute return in identifier is dropped
  const tampered = `${id.split("|rp=")[0]}|rp=${encodeURIComponent("https://evil.example")}`;
  assert.equal(parseMobileHandoffIdentifier(tampered)?.returnPath ?? null, null);

  assert.equal(isSuccessfulHandoffClientDestination("/onboarding"), true);

  console.log("[4] Handoff destination + identifier... PASS");
}

function testNoAuthSignInLoopWiring() {
  const page = read("src/app/(app)/onboarding/page.tsx");
  assert.ok(page.includes("HOUZZATPRO_APP_BOOTSTRAP_ORIGIN") === false);
  assert.ok(page.includes("buildOwnerOnboardingProSignInUrl"));
  assert.ok(page.includes("isHouzzatVercelTestHost(tenancy.hostname)"));
  assert.ok(page.includes("buildHouzzatVercelTestOnboardingSignInUrl"));
  assert.ok(page.includes('returnPath: "/onboarding"'));

  const parsed = parseOwnerOnboardingAuthSearchParams(
    new URLSearchParams("returnPath=/onboarding&workspaceHint=" + WS_REMAX),
  );
  assert.equal(parsed.returnPath, "/onboarding");
  assert.equal(parsed.workspaceHint, WS_REMAX);

  const appended = appendOwnerOnboardingAuthQuery("/pro", {
    returnPath: "/onboarding",
    workspaceHint: WS_REMAX,
  });
  assert.ok(appended.startsWith("/pro?"));
  assert.ok(appended.includes("returnPath=%2Fonboarding"));
  assert.ok(appended.includes(`workspaceHint=${WS_REMAX}`));

  console.log("[5] No /auth/sign-in loop wiring... PASS");
}

function testConsumerAuthUnchanged() {
  const bridge = read("src/components/auth/AuthRouteBridge.tsx");
  assert.ok(bridge.includes("openAuth"));
  assert.ok(bridge.includes("backgroundPath"));
  assert.ok(bridge.includes('target.startsWith("/account")'));

  const signInPage = read("src/app/(marketing)/auth/sign-in/page.tsx");
  assert.ok(signInPage.includes("AuthRouteBridge"));

  console.log("[6] Consumer /auth/sign-in unchanged... PASS");
}

function main() {
  console.log("\n=== STAGE 6.10C.3 — OWNER ONBOARDING PRO AUTH ===\n");
  testSourceGuards();
  testReturnPathSanitization();
  testProSignInUrl();
  testWorkspaceHintNonAuthoritative();
  testHandoffDestinationAndIdentifier();
  testNoAuthSignInLoopWiring();
  testConsumerAuthUnchanged();
  console.log("\nSTAGE 6.10C.3 SELFTEST PASSED\n");
}

main();
