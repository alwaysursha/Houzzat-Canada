/**
 * Stage 6.5B — HouzzatPRO branded suspended workspace page selftest.
 * Run: node --import tsx scripts/stage-6.5b-platform-suspended-page-selftest.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HOUZZAT_WORKSPACE_SLUG,
  PLATFORM_SUSPENDED_PAGE_TITLE,
  PLATFORM_SUSPENDED_PRIMARY_MESSAGE,
  resolveHouzzatProSupportCta,
} from "../src/lib/platform";
import { isPlatformSuspendedHostRequest } from "../src/lib/platform/status";
import {
  clearHostResolutionCacheForTests,
  createFixtureHostResolutionDeps,
  resolveWorkspaceFromHostname,
  type DomainLookupRow,
} from "../src/lib/tenancy/resolve-workspace-host";
import { resolveTenantStaffContext } from "../src/lib/tenancy/tenant-staff-context";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_ACTIVE = "ws_active";
const WS_SUSPENDED = "ws_suspended";
const WS_CANCELLED = "ws_cancelled";

const FIXTURE_ROWS: DomainLookupRow[] = [
  {
    hostname: "houzzat.com",
    kind: "CUSTOM",
    role: "PRIMARY",
    workspaceId: WS_ACTIVE,
    workspaceSlug: HOUZZAT_WORKSPACE_SLUG,
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "tenant-canary.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_SUSPENDED,
    workspaceSlug: "tenant-canary",
    domainStatus: "ACTIVE",
    workspaceStatus: "SUSPENDED",
  },
  {
    hostname: "cancelled-tenant.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_CANCELLED,
    workspaceSlug: "cancelled-tenant",
    domainStatus: "ACTIVE",
    workspaceStatus: "CANCELLED",
  },
];

function requestForHost(hostname: string) {
  return new Request(`https://${hostname}/`);
}

async function main() {
  console.log("\n=== STAGE 6.5B — PLATFORM SUSPENDED PAGE ===\n");

  const prevScope = process.env.TENANT_DOMAIN_SCOPE;
  process.env.TENANT_DOMAIN_SCOPE = "workspace";

  try {
    await runTests();
  } finally {
    if (prevScope === undefined) {
      delete process.env.TENANT_DOMAIN_SCOPE;
    } else {
      process.env.TENANT_DOMAIN_SCOPE = prevScope;
    }
  }
}

async function runTests() {
  clearHostResolutionCacheForTests();
  const deps = createFixtureHostResolutionDeps(FIXTURE_ROWS);

  // 1. ACTIVE workspace resolves normally
  {
    const active = await resolveWorkspaceFromHostname("houzzat.com", deps);
    assert.equal(active.ok, true);
    assert.equal(await isPlatformSuspendedHostRequest(requestForHost("houzzat.com"), deps), false);
    console.log("[1] ACTIVE workspace does not trigger suspended page... PASS");
  }

  // 2. SUSPENDED workspace uses workspace_suspended reason
  {
    const suspended = await resolveWorkspaceFromHostname(
      "tenant-canary.houzzatpro.com",
      deps,
    );
    assert.equal(suspended.ok, false);
    if (!suspended.ok) {
      assert.equal(suspended.reason, "workspace_suspended");
    }
    assert.equal(
      await isPlatformSuspendedHostRequest(
        requestForHost("tenant-canary.houzzatpro.com"),
        deps,
      ),
      true,
    );
    console.log("[2] SUSPENDED workspace triggers suspended presentation... PASS");
  }

  // 3. Suspended page copy is public-safe
  {
    const page = read("src/components/platform/status/PlatformSuspendedPage.tsx");
    const copy = read("src/lib/platform/status/copy.ts");
    assert.ok(page.includes("PLATFORM_SUSPENDED_PAGE_TITLE"));
    assert.ok(page.includes("PLATFORM_SUSPENDED_PRIMARY_MESSAGE"));
    assert.ok(copy.includes(PLATFORM_SUSPENDED_PAGE_TITLE));
    assert.ok(copy.includes(PLATFORM_SUSPENDED_PRIMARY_MESSAGE));
    assert.ok(!/reasonDetail|BILLING_PAST_DUE|subscription|tokenHash|WorkspaceStatusEvent/i.test(page));
    assert.ok(!/reasonDetail|BILLING_PAST_DUE|subscription|Stripe/i.test(copy));
    assert.ok(!page.includes("TenantBrandProvider"));
    assert.ok(!page.includes("TenantThemeStyle"));
    console.log("[3] Suspended page avoids sensitive/internal fields... PASS");
  }

  // 4. CANCELLED remains workspace_inactive (404 path)
  {
    const cancelled = await resolveWorkspaceFromHostname(
      "cancelled-tenant.houzzatpro.com",
      deps,
    );
    assert.equal(cancelled.ok, false);
    if (!cancelled.ok) {
      assert.equal(cancelled.reason, "workspace_inactive");
      assert.notEqual(cancelled.reason, "workspace_suspended");
    }
    console.log("[4] CANCELLED does not use suspended page reason... PASS");
  }

  // 5. Unknown hostname remains domain_not_found
  {
    const unknown = await resolveWorkspaceFromHostname("unknown-example.com", deps);
    assert.equal(unknown.ok, false);
    if (!unknown.ok) {
      assert.equal(unknown.reason, "domain_not_found");
    }
    console.log("[5] Unknown hostname remains safe 404 behavior... PASS");
  }

  // 6. Query params cannot spoof suspended state
  {
    const spoof = new Request(
      "https://houzzat.com/?workspaceStatus=SUSPENDED&status=suspended",
    );
    assert.equal(await isPlatformSuspendedHostRequest(spoof, deps), false);
    console.log("[6] Client query params cannot spoof suspended state... PASS");
  }

  // 7. Layout gates use server hostname resolver
  {
    const marketing = read("src/app/(marketing)/layout.tsx");
    const agent = read("src/app/(agent)/agent/layout.tsx");
    const admin = read("src/app/(admin)/admin/layout.tsx");
    for (const src of [marketing, agent, admin]) {
      assert.ok(src.includes("resolvePlatformSuspendedHost"));
      assert.ok(src.includes("PlatformSuspendedPage"));
    }
    console.log("[7] Layout gates wired to server suspended resolver... PASS");
  }

  // 8. Houzzat ACTIVE host resolution unchanged
  {
    const houzzat = await resolveWorkspaceFromHostname("houzzat.com", deps);
    assert.equal(houzzat.ok, true);
    if (houzzat.ok) {
      assert.equal(houzzat.workspaceSlug, HOUZZAT_WORKSPACE_SLUG);
    }
    console.log("[8] Houzzat ACTIVE behavior preserved... PASS");
  }

  // 9. Suspended staff still cannot access CRM context
  {
    const staff = await resolveTenantStaffContext(
      requestForHost("tenant-canary.houzzatpro.com"),
      { id: "staff_user", role: "AGENT" },
      deps,
    );
    assert.equal(staff, null);
    console.log("[9] Suspended host denies tenant staff CRM context... PASS");
  }

  // 10. Reactivation naturally restores routing
  {
    const reactivatedRows = FIXTURE_ROWS.map((row) =>
      row.hostname === "tenant-canary.houzzatpro.com"
        ? { ...row, workspaceStatus: "ACTIVE" as const }
        : row,
    );
    clearHostResolutionCacheForTests();
    const reactivatedDeps = createFixtureHostResolutionDeps(reactivatedRows);
    const restored = await resolveWorkspaceFromHostname(
      "tenant-canary.houzzatpro.com",
      reactivatedDeps,
    );
    assert.equal(restored.ok, true);
    assert.equal(
      await isPlatformSuspendedHostRequest(
        requestForHost("tenant-canary.houzzatpro.com"),
        reactivatedDeps,
      ),
      false,
    );
    console.log("[10] Reactivated workspace restores normal routing... PASS");
  }

  // 11. Support CTA resolves to canonical destination
  {
    const cta = resolveHouzzatProSupportCta();
    assert.equal(cta.href, "https://houzzatpro.com/support");
    assert.equal(cta.label, "Contact HouzzatPRO Technical Support");
    const suspended = read("src/components/platform/status/PlatformSuspendedPage.tsx");
    assert.ok(suspended.includes("supportCta.href"));
    console.log("[11] Support CTA resolves to /support... PASS");
  }

  console.log("\nSTAGE 6.5B — ALL TESTS PASSED\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
