/**
 * Vercel/Next.js build must not call OpenNext Cloudflare-for-dev init.
 * Run: node --import tsx scripts/vercel-next-build-compat-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "next.config.ts"), "utf8");
const pkg = readFileSync(join(root, "package.json"), "utf8");
const wrangler = readFileSync(join(root, "wrangler.jsonc"), "utf8");
const openNext = readFileSync(join(root, "open-next.config.ts"), "utf8");
const worker = readFileSync(join(root, "cloudflare/worker.js"), "utf8");

assert.ok(src.includes("initOpenNextCloudflareForDev"));
assert.ok(src.includes("shouldInitOpenNextCloudflareForDev"));
assert.ok(src.includes("process.env.VERCEL"));
assert.ok(src.includes('process.env.NODE_ENV === "production"'));
assert.ok(src.includes("initOpenNextCloudflareForDev({ remoteBindings: true })"));
assert.ok(src.includes("if (shouldInitOpenNextCloudflareForDev())"));

assert.ok(pkg.includes('"build": "next build --webpack"'));
assert.ok(pkg.includes('"build:cloudflare": "opennextjs-cloudflare build"'));
assert.ok(pkg.includes('"deploy:cf":'));
assert.ok(openNext.includes("defineCloudflareConfig"));
assert.ok(wrangler.includes('"main": "cloudflare/worker.js"'));
assert.ok(wrangler.includes('"binding": "BRANDING_ASSETS"'));
assert.ok(worker.includes("openNextWorker"));

const runtimeHelper = readFileSync(
  join(root, "src/lib/runtime/cloudflare-context.ts"),
  "utf8",
);
assert.ok(runtimeHelper.includes("shouldSkipOpenNextCloudflareContext"));
assert.ok(runtimeHelper.includes("process.env.VERCEL"));

console.log("vercel-next-build-compat-selftest: ok");
