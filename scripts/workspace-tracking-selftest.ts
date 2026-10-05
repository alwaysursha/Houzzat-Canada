/**
 * Workspace website tracking tags.
 * Run: pnpm workspace-tracking:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EMPTY_WORKSPACE_TRACKING,
  googleTagInstall,
  resolveWorkspaceTracking,
  workspaceTrackingIds,
} from "../src/lib/ads/workspace-tracking";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function trackingDb(
  rows: Record<
    string,
    {
      ga4MeasurementId: string | null;
      googleAdsId: string | null;
      metaPixelId: string | null;
    } | null
  >,
) {
  return {
    workspaceTracking: {
      async findUnique(args: { where: { workspaceId: string } }) {
        const row = rows[args.where.workspaceId];
        return row === undefined ? null : row;
      },
    },
  };
}

async function testTenantsResolveDifferentGa4Ids() {
  const db = trackingDb({
    ws_a: {
      ga4MeasurementId: "G-TENANTA",
      googleAdsId: null,
      metaPixelId: null,
    },
    ws_b: {
      ga4MeasurementId: "G-TENANTB",
      googleAdsId: "AW-200",
      metaPixelId: "1234567890",
    },
  });

  const tenantA = await resolveWorkspaceTracking("ws_a", db);
  const tenantB = await resolveWorkspaceTracking("ws_b", db);
  assert.equal(tenantA.ga4MeasurementId, "G-TENANTA");
  assert.equal(tenantB.ga4MeasurementId, "G-TENANTB");
  assert.notEqual(tenantA.ga4MeasurementId, tenantB.ga4MeasurementId);

  const installA = googleTagInstall(tenantA);
  const installB = googleTagInstall(tenantB);
  assert.ok(installA);
  assert.ok(installB);
  assert.equal(installA.src, "https://www.googletagmanager.com/gtag/js?id=G-TENANTA");
  assert.ok(installA.config.startsWith("gtag('config','G-TENANTA');"));
  assert.ok(installA.config.includes("conversion_event_signup_1"));
  assert.equal(installB.src, "https://www.googletagmanager.com/gtag/js?id=AW-200");
  assert.ok(installB.config.includes("gtag('config','G-TENANTB');"));
  assert.ok(installB.config.includes("gtag('config','AW-200');"));
  assert.equal(installA.config.includes("G-TENANTB"), false);
  assert.equal(installB.config.includes("G-TENANTA"), false);
  assert.equal(installA.config.includes("G-H6JNE333QF"), false);
  assert.equal(installB.config.includes("G-H6JNE333QF"), false);
}

async function testMissingGa4LoadsNoGa4Tag() {
  const db = trackingDb({
    ws_empty: {
      ga4MeasurementId: null,
      googleAdsId: null,
      metaPixelId: "1234567890",
    },
    ws_ads_only: {
      ga4MeasurementId: "  ",
      googleAdsId: "AW-300",
      metaPixelId: null,
    },
  });

  const empty = await resolveWorkspaceTracking("ws_missing", db);
  assert.deepEqual(empty, EMPTY_WORKSPACE_TRACKING);
  assert.equal(googleTagInstall(empty), null);

  const noGa4 = await resolveWorkspaceTracking("ws_empty", db);
  assert.equal(noGa4.ga4MeasurementId, null);
  assert.equal(googleTagInstall(noGa4), null);

  const adsOnly = await resolveWorkspaceTracking("ws_ads_only", db);
  const adsInstall = googleTagInstall(adsOnly);
  assert.ok(adsInstall);
  assert.equal(adsInstall.src, "https://www.googletagmanager.com/gtag/js?id=AW-300");
  assert.ok(adsInstall.config.startsWith("gtag('config','AW-300');"));
  assert.ok(adsInstall.config.includes("conversion_event_signup"));
  assert.equal(adsInstall.config.includes("G-"), false);

  assert.equal(workspaceTrackingIds({ ga4MeasurementId: "G-ok';alert(1)" }).ga4MeasurementId, null);
  assert.deepEqual(
    workspaceTrackingIds({
      ga4MeasurementId: "UA-123",
      googleAdsId: "G-NOTADS",
      metaPixelId: "pixel",
    }),
    EMPTY_WORKSPACE_TRACKING,
  );
}

async function testMissingTableLoadsNoTag() {
  const db = {
    workspaceTracking: {
      async findUnique() {
        const error = new Error('relation "WorkspaceTracking" does not exist');
        (error as Error & { code: string }).code = "P2021";
        throw error;
      },
    },
  };
  assert.deepEqual(await resolveWorkspaceTracking("ws_a", db), EMPTY_WORKSPACE_TRACKING);
}

function testShellUsesResolvedWorkspaceAndNotTheEnvVar() {
  const layout = read("src/app/(marketing)/layout.tsx");
  const pixels = read("src/components/ads/AdsTrackingPixels.tsx");
  const signup = read("src/components/auth/SignUpForm.tsx");
  const lead = read("src/components/listings/LeadRequestForm.tsx");
  const events = read("src/lib/ads/ga4-sign-up.ts");
  const migration = read(
    "prisma/migrations/20260929140000_workspace_tracking/migration.sql",
  );
  const schema = read("prisma/schema.prisma");

  const resolveAt = layout.indexOf("resolveWorkspaceTracking(tenancy.workspaceId)");
  const pixelsAt = layout.indexOf("<AdsTrackingPixels");
  assert.ok(resolveAt !== -1 && pixelsAt !== -1 && resolveAt < pixelsAt);
  assert.ok(layout.includes("ga4MeasurementId={tracking.ga4MeasurementId}"));
  assert.equal(layout.includes("NEXT_PUBLIC_GOOGLE_ADS_ID"), false);
  assert.equal(pixels.includes("NEXT_PUBLIC_GOOGLE_ADS_ID"), false);
  assert.equal(pixels.includes("NEXT_PUBLIC_META_PIXEL_ID"), false);
  assert.equal(pixels.includes("G-H6JNE333QF"), false);
  assert.equal(signup.includes("ga4MeasurementId"), false);
  assert.equal(lead.includes("ga4MeasurementId"), false);
  assert.equal(events.includes("G-H6JNE333QF"), false);
  assert.equal(events.includes("workspaceId"), false);

  const branding = schema.slice(
    schema.indexOf("model WorkspaceBranding {"),
    schema.indexOf("model WorkspaceTracking {"),
  );
  assert.equal(branding.includes("ga4MeasurementId"), false);
  assert.ok(schema.includes("tracking                          WorkspaceTracking?"));
  assert.ok(migration.includes(`WHERE "slug" = 'houzzat'`));
  assert.ok(migration.includes("'G-H6JNE333QF'"));
  assert.equal(migration.includes("ALTER TABLE \"WorkspaceBranding\""), false);
}

async function main() {
  await testTenantsResolveDifferentGa4Ids();
  await testMissingGa4LoadsNoGa4Tag();
  await testMissingTableLoadsNoTag();
  testShellUsesResolvedWorkspaceAndNotTheEnvVar();
  console.log("workspace tracking selftest ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
