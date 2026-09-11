/**
 * Vercel must never invoke OpenNext Cloudflare context (async mode boots wrangler).
 * Run: node --import tsx scripts/vercel-runtime-compat-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const helper = read("src/lib/runtime/cloudflare-context.ts");
assert.ok(helper.includes("shouldSkipOpenNextCloudflareContext"));
assert.ok(helper.includes("process.env.VERCEL"));
assert.ok(helper.includes("getCloudflareContext({ async: true })"));
assert.ok(helper.includes("tryGetCloudflareEnvSync"));
assert.ok(helper.includes("tryGetCloudflareEnvAsync"));
assert.ok(helper.includes("tryGetCloudflareWaitUntil"));

const guarded = [
  "src/lib/prisma.ts",
  "src/lib/email/env.ts",
  "src/lib/typesense/env.ts",
  "src/lib/notifications/push.ts",
  "src/lib/cma/browser-rendering-pdf.ts",
  "src/lib/tenancy/branding-assets/storage.ts",
  "src/app/api/health/route.ts",
];

for (const file of guarded) {
  const src = read(file);
  assert.ok(
    src.includes("@/lib/runtime/cloudflare-context"),
    `${file} must use the dual-runtime helper`,
  );
  assert.equal(
    src.includes('from "@opennextjs/cloudflare"'),
    false,
    `${file} must not call OpenNext context directly`,
  );
}

const nextConfig = read("next.config.ts");
assert.ok(nextConfig.includes("shouldInitOpenNextCloudflareForDev"));
assert.ok(nextConfig.includes("process.env.VERCEL"));
assert.ok(nextConfig.includes("initOpenNextCloudflareForDev({ remoteBindings: true })"));

const wrangler = read("wrangler.jsonc");
assert.ok(wrangler.includes('"main": "cloudflare/worker.js"'));
assert.ok(wrangler.includes('"binding": "BRANDING_ASSETS"'));

const openNext = read("open-next.config.ts");
assert.ok(openNext.includes("defineCloudflareConfig"));

console.log("vercel-runtime-compat-selftest: ok");
