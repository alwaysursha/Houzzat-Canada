/**
 * Stage 6.4 — Master Admin read-only UI shell selftest.
 * Run: node --import tsx scripts/stage-6.4-platform-ui-selftest.ts
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function listTsFiles(dir: string): string[] {
  const abs = join(root, dir);
  const out: string[] = [];
  for (const name of readdirSync(abs, { withFileTypes: true })) {
    const rel = join(dir, name.name);
    if (name.isDirectory()) out.push(...listTsFiles(rel));
    else if (name.name.endsWith(".ts") || name.name.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

console.log("\n=== STAGE 6.4 — PLATFORM READ-ONLY UI ===\n");

// 1. Routes exist
{
  const pages = [
    "src/app/platform/layout.tsx",
    "src/app/platform/access-denied/page.tsx",
    "src/app/platform/(shell)/layout.tsx",
    "src/app/platform/(shell)/page.tsx",
    "src/app/platform/(shell)/workspaces/page.tsx",
    "src/app/platform/(shell)/workspaces/[workspaceId]/page.tsx",
    "src/app/platform/(shell)/prospects/page.tsx",
    "src/app/platform/(shell)/prospects/[prospectId]/page.tsx",
    "src/app/platform/(shell)/offers/page.tsx",
    "src/app/platform/(shell)/offers/[offerId]/page.tsx",
    "src/app/platform/(shell)/subscriptions/page.tsx",
    "src/app/platform/(shell)/subscriptions/[subscriptionId]/page.tsx",
    "src/app/platform/(shell)/provisioning/page.tsx",
    "src/app/platform/(shell)/provisioning/[runId]/page.tsx",
    "src/app/platform/(shell)/audit/page.tsx",
  ];
  for (const page of pages) {
    assert.ok(read(page).length > 0, page);
  }
  console.log(`[1] ${pages.length} platform UI routes present... PASS`);
}

// 2. Shell layout enforces platform operator auth
{
  const shellLayout = read("src/app/platform/(shell)/layout.tsx");
  assert.ok(shellLayout.includes("requirePlatformPageAccess"), "shell auth");
  assert.ok(!shellLayout.includes("requireAgentContext"), "no agent context");
  assert.ok(!shellLayout.includes("isAdminRole"), "no user.role admin");
  assert.ok(!shellLayout.includes("WorkspaceMember"), "no workspace member");
  console.log("[2] Platform shell uses requirePlatformPageAccess... PASS");
}

// 3. API client consumes /api/platform/v1 only
{
  const client = read("src/lib/platform/ui/api-client.ts");
  assert.ok(client.includes("/api/platform/v1/me"));
  assert.ok(client.includes("/api/platform/v1/summary"));
  assert.ok(!client.includes("prisma."), "no direct prisma in client");
  console.log("[3] UI API client targets platform v1 routes... PASS");
}

// 4. CRM / tenant lead isolation in platform UI tree
{
  const forbidden = [
    /from\s+["']@\/lib\/crm-read-scope["']/,
    /from\s+["']@\/lib\/agent\/lead-summary["']/,
    /from\s+["']@\/lib\/agent["']/,
    /prisma\.lead\./,
    /\/agent\/leads/,
    /requireAgentContext/,
    /isAdminRole/,
  ];
  const dirs = [
    "src/app/platform",
    "src/components/platform",
    "src/lib/platform/ui",
  ];
  for (const dir of dirs) {
    for (const file of listTsFiles(dir)) {
      const src = read(file);
      for (const re of forbidden) {
        assert.ok(!re.test(src), `${file} matches forbidden ${re}`);
      }
    }
  }
  console.log("[4] CRM/tenant lead imports absent from platform UI... PASS");
}

// 5. No offer/secret controls in UI (prospect writes arrive in Stage 6.6A)
{
  const writePatterns = [
    /tokenHash/,
    /sk_live_/,
    /sk_test_/,
  ];
  const uiFiles = listTsFiles("src/app/platform").concat(
    listTsFiles("src/components/platform"),
  );
  for (const file of uiFiles) {
    const src = read(file);
    for (const re of writePatterns) {
      assert.ok(!re.test(src), `${file} contains forbidden write/secret pattern ${re}`);
    }
  }
  // Stage 6.7A introduces Create Offer UI — still must never expose tokenHash.
  assert.ok(
    uiFiles.some((file) => /Create Offer/i.test(read(file))),
    "Create Offer UI expected in Stage 6.7A",
  );
  console.log("[5] No offer secret fields in UI (Create Offer allowed)... PASS");
}

// 6. Shell navigation excludes CRM
{
  const shell = read("src/components/platform/PlatformShell.tsx");
  const navLabels = [
    "Dashboard",
    "Workspaces",
    "Prospects",
    "Offers",
    "Subscriptions",
    "Provisioning",
    "Audit",
  ];
  for (const label of navLabels) {
    assert.ok(shell.includes(label), label);
  }
  assert.ok(!shell.includes("Leads"), "no leads nav");
  assert.ok(!shell.includes("CRM"), "no crm nav");
  assert.ok(!shell.includes("workspace switcher"), "no switcher");
  console.log("[6] Platform shell navigation scope... PASS");
}

// 7. Error/empty state components used
{
  const dashboard = read("src/app/platform/(shell)/page.tsx");
  assert.ok(dashboard.includes("PlatformErrorState"));
  assert.ok(dashboard.includes("getPlatformSummary"));
  const workspaces = read("src/app/platform/(shell)/workspaces/page.tsx");
  assert.ok(workspaces.includes("PlatformEmptyState"));
  assert.ok(workspaces.includes("PlatformApiClientError"));
  console.log("[7] Loading/error/empty handling present... PASS");
}

// 8. Houzzat/Canary must not be hardcoded in UI pages
{
  const hardcodedCommercial = [
    /HOUZZAT_LEGACY/,
    /GRANDFATHERED/,
    /"houzzat"/i,
    /canary.*no subscription/i,
  ];
  for (const file of listTsFiles("src/app/platform")) {
    const src = read(file);
    for (const re of hardcodedCommercial) {
      assert.ok(!re.test(src), `${file} hardcodes commercial state ${re}`);
    }
  }
  console.log("[8] Houzzat/Canary not hardcoded in UI pages... PASS");
}

// 9. Middleware coming-soon bypass for /platform
{
  const middleware = read("src/middleware.ts");
  assert.ok(middleware.includes('pathname.startsWith("/platform")'));
  console.log("[9] Middleware bypass for /platform... PASS");
}

// 10. Audit pagination
{
  const audit = read("src/app/platform/(shell)/audit/page.tsx");
  assert.ok(audit.includes("PlatformPagination"));
  assert.ok(audit.includes("listPlatformAuditEvents"));
  console.log("[10] Audit pagination wired... PASS");
}

console.log("\nSTAGE 6.4 PLATFORM UI SELFTEST: ALL PASS\n");
