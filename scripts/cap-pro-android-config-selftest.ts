/**
 * Stage 3K.5.9.2 — HouzzatPRO Android Capacitor server.url regression.
 *
 * Proves:
 * - Default pro config cold-starts houzzat.com (production Houzzat tenant).
 * - HOUZZAT_CAP_PRO_SERVER_URL embeds Tenant Canary origin at cap sync time.
 * - cap-target.sh passes env through to generated android-pro assets.
 *
 * Run: pnpm cap-pro-android-config:selftest
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAdminSurfaceMode } from "../src/lib/admin/tenant-command-centre-auth";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRO_ASSETS_CONFIG = join(
  root,
  "android-pro/app/src/main/assets/capacitor.config.json",
);

const DEFAULT_PRO_URL = "https://app.houzzatpro.com/pro/sign-in";
const CANARY_OVERRIDE_URL = "https://tenant-canary.houzzatpro.com/pro";

function resolveProServer(env: Record<string, string | undefined>) {
  const merged = { ...process.env, ...env };
  return JSON.parse(
    execSync(
      'node --import tsx -e \'import mod from "./capacitor.config.ts"; const c = mod?.default ?? mod; process.stdout.write(JSON.stringify(c.server));\'',
      {
        cwd: root,
        env: merged,
        encoding: "utf8",
      },
    ),
  ) as {
    url: string;
    allowNavigation: string[];
  };
}

function readEmbeddedProConfig() {
  return JSON.parse(readFileSync(PRO_ASSETS_CONFIG, "utf8")) as {
    server: { url: string; allowNavigation: string[] };
  };
}

function runCapCopyPro(env: Record<string, string | undefined>) {
  execSync("bash scripts/cap-target.sh pro copy", {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "pipe",
  });
}

function withWorkspaceMode(fn: () => void) {
  const prevDomain = process.env.TENANT_DOMAIN_SCOPE;
  const prevRead = process.env.WORKSPACE_READ_SCOPE;
  process.env.TENANT_DOMAIN_SCOPE = "workspace";
  process.env.WORKSPACE_READ_SCOPE = "workspace";
  try {
    fn();
  } finally {
    if (prevDomain === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prevDomain;
    if (prevRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prevRead;
  }
}

function testResolvedConfigDefaults() {
  const server = resolveProServer({ HOUZZAT_CAP_TARGET: "pro" });
  assert.equal(server.url, DEFAULT_PRO_URL);
  assert.ok(server.allowNavigation.includes("app.houzzatpro.com"));
  assert.ok(server.allowNavigation.includes("houzzat.com"));
  assert.ok(server.allowNavigation.includes("*.houzzatpro.com"));
}

function testResolvedConfigCanaryOverride() {
  const server = resolveProServer({
    HOUZZAT_CAP_TARGET: "pro",
    HOUZZAT_CAP_PRO_SERVER_URL: CANARY_OVERRIDE_URL,
  });
  assert.equal(server.url, CANARY_OVERRIDE_URL);
}

function testEmbeddedArtifactTracksEnvAtSync() {
  runCapCopyPro({
    HOUZZAT_CAP_TARGET: "pro",
    HOUZZAT_CAP_PRO_SERVER_URL: CANARY_OVERRIDE_URL,
  });
  let embedded = readEmbeddedProConfig();
  assert.equal(embedded.server.url, CANARY_OVERRIDE_URL);
  assert.deepEqual(embedded.server.allowNavigation, [
    "app.houzzatpro.com",
    "houzzat.com",
    "*.houzzat.com",
    "houzzatpro.com",
    "*.houzzatpro.com",
    "accounts.google.com",
    "*.google.com",
    "*.googleapis.com",
  ]);

  runCapCopyPro({ HOUZZAT_CAP_TARGET: "pro" });
  embedded = readEmbeddedProConfig();
  assert.equal(embedded.server.url, DEFAULT_PRO_URL);
}

function testMobileRoutingIntent() {
  const startup = readFileSync(
    join(root, "src/components/mobile/HouzzatProStartup.tsx"),
    "utf8",
  );
  const middleware = readFileSync(join(root, "src/middleware.ts"), "utf8");
  const proPage = readFileSync(
    join(root, "src/app/(marketing)/pro/page.tsx"),
    "utf8",
  );

  assert.ok(proPage.includes("ProShellRuntimeDiagnostic") || proPage.includes("ProWorkspaceTransition"));
  assert.ok(startup.includes("ProWorkspaceBootstrap"));
  assert.ok(middleware.includes("workspace bootstrap handles authenticated routing"));
}

function testTenantCanaryAdminSurface() {
  withWorkspaceMode(() => {
    assert.equal(
      resolveAdminSurfaceMode("tenant-canary.houzzatpro.com"),
      "tenant",
    );
    assert.equal(resolveAdminSurfaceMode("houzzat.com"), "tenant");
    assert.equal(resolveAdminSurfaceMode("houzzatpro.com"), "platform");
  });
}

function testGradleProReleaseConfig() {
  const gradle = readFileSync(join(root, "android-pro/app/build.gradle"), "utf8");
  assert.ok(gradle.includes('applicationId "com.houzzat.pro"'));
  const codeMatch = gradle.match(/versionCode\s+(\d+)/);
  assert.ok(codeMatch && parseInt(codeMatch[1], 10) >= 7, "versionCode must be >= 7");
  const nameMatch = gradle.match(/versionName\s+"([^"]+)"/);
  assert.ok(nameMatch && nameMatch[1] === "1.0.5", "versionName must be 1.0.5");
}

function main() {
  testGradleProReleaseConfig();
  testResolvedConfigDefaults();
  testResolvedConfigCanaryOverride();
  testEmbeddedArtifactTracksEnvAtSync();
  testMobileRoutingIntent();
  testTenantCanaryAdminSurface();
  console.log("cap-pro-android-config:selftest OK");
}

main();
