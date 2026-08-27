/**
 * Stage 3K.4.2 — platform hostname derivation selftest.
 * Run: pnpm tenant-platform-hostname:selftest
 */
import assert from "node:assert/strict";
import {
  HOUZZATPRO_PLATFORM_ZONE,
  isHouzzatProAppBootstrapHost,
  isHouzzatProPlatformRoot,
  isPlatformTenantHostname,
  parsePlatformTenantHostname,
  platformHostnameForWorkspaceSlug,
  RESERVED_PLATFORM_WORKSPACE_SLUGS,
} from "../src/lib/tenancy/platform-hostname";
import {
  blocksTenantHostnameResolution,
  isReservedPlatformHostname,
} from "../src/lib/tenancy/reserved-domains";
import { isPlatformMobileBootstrapHost } from "../src/lib/mobile/platform-bootstrap";

function testDeterministicPlatformHostname() {
  const houzzat = platformHostnameForWorkspaceSlug("houzzat");
  assert.ok(houzzat.ok);
  assert.equal(houzzat.hostname, "houzzat.houzzatpro.com");

  const canary = platformHostnameForWorkspaceSlug("tenant-canary");
  assert.ok(canary.ok);
  assert.equal(canary.hostname, "tenant-canary.houzzatpro.com");

  const example = platformHostnameForWorkspaceSlug("alisyed");
  assert.ok(example.ok);
  assert.equal(example.hostname, "alisyed.houzzatpro.com");
}

function testReservedSlugsRejected() {
  for (const slug of RESERVED_PLATFORM_WORKSPACE_SLUGS) {
    const result = platformHostnameForWorkspaceSlug(slug);
    assert.equal(result.ok, false, slug);
  }
  assert.equal(platformHostnameForWorkspaceSlug("Bad_Slug").ok, false);
  assert.equal(platformHostnameForWorkspaceSlug("").ok, false);
}

function testPlatformRootDenied() {
  assert.ok(isHouzzatProPlatformRoot("houzzatpro.com"));
  assert.ok(isHouzzatProPlatformRoot("www.houzzatpro.com"));
  assert.ok(isHouzzatProPlatformRoot("HOUZZATPRO.COM"));
  assert.equal(blocksTenantHostnameResolution("houzzatpro.com"), "platform_houzzatpro_root");
  assert.ok(isReservedPlatformHostname("houzzatpro.com").reserved);
  // Sales apex is NOT application bootstrap.
  assert.equal(isPlatformMobileBootstrapHost("houzzatpro.com"), false);
  assert.equal(isPlatformMobileBootstrapHost("www.houzzatpro.com"), false);
}

function testAppBootstrapHostReserved() {
  assert.ok(isHouzzatProAppBootstrapHost("app.houzzatpro.com"));
  assert.equal(isHouzzatProPlatformRoot("app.houzzatpro.com"), false);
  assert.equal(isPlatformMobileBootstrapHost("app.houzzatpro.com"), true);
  assert.equal(
    blocksTenantHostnameResolution("app.houzzatpro.com"),
    "platform_houzzatpro_app_bootstrap",
  );
  assert.equal(isPlatformTenantHostname("app.houzzatpro.com"), false);
  assert.equal(parsePlatformTenantHostname("app.houzzatpro.com"), null);
  // Reserved slug "app" cannot become a tenant platform host.
  assert.equal(platformHostnameForWorkspaceSlug("app").ok, false);
}

function testFutureTenantCNoMobileConfigChange() {
  const tenantC = platformHostnameForWorkspaceSlug("tenant-c");
  assert.ok(tenantC.ok);
  assert.equal(tenantC.hostname, "tenant-c.houzzatpro.com");
  assert.equal(blocksTenantHostnameResolution("tenant-c.houzzatpro.com"), null);
  // Capacitor allowNavigation already includes *.houzzatpro.com — no AAB rebuild.
}

function testUnknownPlatformTenantDeniedWithoutDbRow() {
  assert.ok(isPlatformTenantHostname("unknown.houzzatpro.com"));
  assert.equal(parsePlatformTenantHostname("unknown.houzzatpro.com")?.slug, "unknown");
  assert.equal(blocksTenantHostnameResolution("unknown.houzzatpro.com"), null);
  assert.equal(blocksTenantHostnameResolution("tenant-canary.houzzatpro.com"), null);
}

function testParsePlatformTenantHostname() {
  const parsed = parsePlatformTenantHostname("tenant-canary.houzzatpro.com");
  assert.ok(parsed);
  assert.equal(parsed.slug, "tenant-canary");
  assert.equal(parsed.hostname, "tenant-canary.houzzatpro.com");
  assert.equal(parsePlatformTenantHostname("houzzat.com"), null);
  assert.equal(parsePlatformTenantHostname(`www.${HOUZZATPRO_PLATFORM_ZONE}`), null);
}

async function main() {
  testDeterministicPlatformHostname();
  testReservedSlugsRejected();
  testPlatformRootDenied();
  testAppBootstrapHostReserved();
  testFutureTenantCNoMobileConfigChange();
  testUnknownPlatformTenantDeniedWithoutDbRow();
  testParsePlatformTenantHostname();
  console.log("tenant-platform-hostname:selftest ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
