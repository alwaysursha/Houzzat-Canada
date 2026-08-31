/**
 * Stage 3K.5.34 — Selftest for SessionProvider focus revalidation policy.
 * Run: pnpm session-revalidate-policy:selftest
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldRefetchSessionOnWindowFocus } from "../src/lib/mobile/session-revalidate-policy";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testPolicyFunction() {
  // 1. HouzzatPRO native UA marker => false
  const proUa =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 HouzzatNative/1 (com.houzzat.pro)";
  assert.equal(shouldRefetchSessionOnWindowFocus(proUa), false);

  // 2. Fallback Pro UA marker => false
  const proFallbackUa =
    "Mozilla/5.0 (Linux; Android 14; com.houzzat.pro) AppleWebKit/537.36 (KHTML, like Gecko)";
  assert.equal(shouldRefetchSessionOnWindowFocus(proFallbackUa), false);

  // 3. Consumer Houzzat native UA => true
  const consumerUa =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 HouzzatNative/1 (com.houzzat.app)";
  assert.equal(shouldRefetchSessionOnWindowFocus(consumerUa), true);

  // 4. Standard Desktop / Mobile Chrome => true
  const chromeMobileUa =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
  assert.equal(shouldRefetchSessionOnWindowFocus(chromeMobileUa), true);

  const desktopUa =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  assert.equal(shouldRefetchSessionOnWindowFocus(desktopUa), true);

  // 5. Undefined / null UA => true
  assert.equal(shouldRefetchSessionOnWindowFocus(null), true);
  assert.equal(shouldRefetchSessionOnWindowFocus(undefined), true);
}

function testProvidersWiring() {
  const providersSrc = read("src/components/Providers.tsx");
  assert.ok(providersSrc.includes("shouldRefetchSessionOnWindowFocus"));
  assert.ok(providersSrc.includes("refetchOnWindowFocus={refetchOnWindowFocus}"));
  assert.ok(providersSrc.includes("refetchInterval={30 * 60}"));
}

function runAll() {
  testPolicyFunction();
  testProvidersWiring();
  console.log("session-revalidate-policy:selftest OK");
}

runAll();
