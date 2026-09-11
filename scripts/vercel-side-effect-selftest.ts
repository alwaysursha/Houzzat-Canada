/**
 * Dual-runtime scheduleWorkerSideEffect: CF waitUntil + Next.js after().
 * Run: node --import tsx scripts/vercel-side-effect-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const prismaSrc = read("src/lib/prisma.ts");

assert.ok(prismaSrc.includes('from "next/server"'));
assert.ok(prismaSrc.includes("after(tracked)"));
assert.ok(prismaSrc.includes("tryGetCloudflareWaitUntil"));
assert.ok(prismaSrc.includes("isWorkerdRuntime()"));

const fnStart = prismaSrc.indexOf(
  "export function scheduleWorkerSideEffect(work: Promise<unknown>): void",
);
assert.ok(fnStart > 0);
const workerdIdx = prismaSrc.indexOf("if (isWorkerdRuntime())", fnStart);
const waitUntilIdx = prismaSrc.indexOf("tryGetCloudflareWaitUntil()", fnStart);
const afterIdx = prismaSrc.indexOf("after(tracked)", fnStart);
assert.ok(workerdIdx > fnStart);
assert.ok(waitUntilIdx > workerdIdx);
assert.ok(afterIdx > waitUntilIdx);

const callers = [
  "src/lib/notifications/push.ts",
  "src/lib/notifications/staff-events.ts",
  "src/lib/agent.ts",
  "src/lib/agent/brokerage.ts",
  "src/app/api/auth/sign-up/route.ts",
];
for (const file of callers) {
  const src = read(file);
  assert.ok(
    src.includes("scheduleWorkerSideEffect("),
    `${file} must still schedule via the shared helper`,
  );
  assert.equal(
    src.includes("from \"next/server\"") && src.includes("after("),
    false,
    `${file} must not call after() directly`,
  );
}

const cfCtx = read("src/lib/runtime/cloudflare-context.ts");
assert.ok(cfCtx.includes("tryGetCloudflareWaitUntil"));
assert.ok(cfCtx.includes("ctx.waitUntil"));

console.log("vercel-side-effect-selftest: ok");
