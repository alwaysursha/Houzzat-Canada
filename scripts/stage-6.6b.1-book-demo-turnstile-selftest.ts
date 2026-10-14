/**
 * Stage 6.6B.1 — Cloudflare Turnstile for Book a Demo selftest.
 * Run: node --import tsx scripts/stage-6.6b.1-book-demo-turnstile-selftest.ts
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  BOOK_DEMO_TURNSTILE_ACTION,
  BOOK_DEMO_TURNSTILE_ERROR_MESSAGE,
  BookDemoPublicError,
  TURNSTILE_TEST_DUMMY_TOKEN,
  TURNSTILE_TEST_SECRET_KEY_FAIL,
  TURNSTILE_TEST_SECRET_KEY_PASS,
  assertTurnstileSiteverifyContext,
  verifyTurnstileToken,
} from "../src/lib/platform";

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

function mockFetch(payload: unknown, ok = true, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

async function main() {
  console.log("\n=== STAGE 6.6B.1 — BOOK A DEMO TURNSTILE ===\n");

  // 1. Missing token fails closed
  {
    await assert.rejects(
      () =>
        verifyTurnstileToken({
          token: "",
          secret: TURNSTILE_TEST_SECRET_KEY_PASS,
          fetchImpl: mockFetch({ success: true }),
        }),
      (e: unknown) =>
        e instanceof BookDemoPublicError && e.code === "TURNSTILE_REQUIRED",
    );
    console.log("[1] Missing token → no verification success... PASS");
  }

  // 2. Invalid / failed token
  {
    await assert.rejects(
      () =>
        verifyTurnstileToken({
          token: TURNSTILE_TEST_DUMMY_TOKEN,
          secret: TURNSTILE_TEST_SECRET_KEY_FAIL,
          fetchImpl: mockFetch({
            success: false,
            "error-codes": ["invalid-input-response"],
            hostname: "houzzatpro.com",
            action: BOOK_DEMO_TURNSTILE_ACTION,
          }),
        }),
      (e: unknown) =>
        e instanceof BookDemoPublicError && e.code === "TURNSTILE_FAILED",
    );
    console.log("[2] Invalid token fails closed... PASS");
  }

  // 3. Successful verification with hostname + action binding
  {
    const result = await verifyTurnstileToken({
      token: TURNSTILE_TEST_DUMMY_TOKEN,
      secret: TURNSTILE_TEST_SECRET_KEY_PASS,
      fetchImpl: mockFetch({
        success: true,
        hostname: "houzzatpro.com",
        action: BOOK_DEMO_TURNSTILE_ACTION,
      }),
    });
    assert.equal(result.success, true);
    console.log("[3] Successful verification allowed... PASS");
  }

  // 4. Wrong hostname rejected
  {
    assert.throws(
      () =>
        assertTurnstileSiteverifyContext({
          success: true,
          hostname: "tenant-canary.houzzatpro.com",
          action: BOOK_DEMO_TURNSTILE_ACTION,
        }),
      (e: unknown) =>
        e instanceof BookDemoPublicError &&
        e.code === "TURNSTILE_HOSTNAME_MISMATCH",
    );
    console.log("[4] Hostname binding rejects tenant hosts... PASS");
  }

  // 5. Wrong / missing action rejected
  {
    assert.throws(
      () =>
        assertTurnstileSiteverifyContext({
          success: true,
          hostname: "houzzatpro.com",
          action: "other_form",
        }),
      (e: unknown) =>
        e instanceof BookDemoPublicError &&
        e.code === "TURNSTILE_ACTION_MISMATCH",
    );
    assert.throws(
      () =>
        assertTurnstileSiteverifyContext({
          success: true,
          hostname: "houzzatpro.com",
        }),
      (e: unknown) =>
        e instanceof BookDemoPublicError &&
        e.code === "TURNSTILE_ACTION_MISMATCH",
    );
    console.log("[5] Action binding enforced... PASS");
  }

  // 6. Network / HTTP failure fails closed
  {
    await assert.rejects(
      () =>
        verifyTurnstileToken({
          token: TURNSTILE_TEST_DUMMY_TOKEN,
          secret: TURNSTILE_TEST_SECRET_KEY_PASS,
          fetchImpl: (async () => {
            throw new Error("network down");
          }) as typeof fetch,
        }),
      (e: unknown) =>
        e instanceof BookDemoPublicError && e.code === "TURNSTILE_UNAVAILABLE",
    );
    await assert.rejects(
      () =>
        verifyTurnstileToken({
          token: TURNSTILE_TEST_DUMMY_TOKEN,
          secret: TURNSTILE_TEST_SECRET_KEY_PASS,
          fetchImpl: mockFetch({ success: true }, false, 502),
        }),
      (e: unknown) =>
        e instanceof BookDemoPublicError && e.code === "TURNSTILE_UNAVAILABLE",
    );
    console.log("[6] Siteverify failure fails closed... PASS");
  }

  // 7. Missing secret fails closed
  {
    const prev = process.env.TURNSTILE_SECRET_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    try {
      await assert.rejects(
        () =>
          verifyTurnstileToken({
            token: TURNSTILE_TEST_DUMMY_TOKEN,
            fetchImpl: mockFetch({ success: true }),
          }),
        (e: unknown) =>
          e instanceof BookDemoPublicError &&
          e.code === "TURNSTILE_NOT_CONFIGURED",
      );
    } finally {
      if (prev === undefined) delete process.env.TURNSTILE_SECRET_KEY;
      else process.env.TURNSTILE_SECRET_KEY = prev;
    }
    console.log("[7] Missing secret fails closed... PASS");
  }

  // 8. Route verifies before intake; safe error UX
  {
    const route = read("src/app/api/platform/public/book-demo/route.ts");
    assert.ok(route.includes("verifyTurnstileToken"));
    assert.ok(route.includes("BOOK_DEMO_TURNSTILE_ERROR_MESSAGE"));
    assert.ok(
      /await verifyTurnstileToken\([\s\S]*?await receiveWebsiteDemoRequest\(/.test(
        route,
      ),
    );
    assert.ok(!route.includes("process.env.TURNSTILE_SECRET_KEY"));
    console.log("[8] Route verifies before prospect write... PASS");
  }

  // 9. Client uses site key only; secret never in client sources
  {
    const form = read("src/components/platform/public/BookDemoForm.tsx");
    const widget = read("src/components/platform/public/BookDemoTurnstile.tsx");
    const page = read("src/app/(marketing)/book-a-demo/page.tsx");
    assert.ok(form.includes("turnstileToken"));
    assert.ok(form.includes("BookDemoTurnstile"));
    assert.ok(form.includes("canSubmit"));
    assert.ok(widget.includes("BOOK_DEMO_TURNSTILE_ACTION"));
    assert.ok(widget.includes("challenges.cloudflare.com/turnstile"));
    assert.ok(page.includes("readTurnstileSiteKey"));
    assert.ok(page.includes("turnstileSiteKey"));
    for (const file of [
      "src/components/platform/public/BookDemoForm.tsx",
      "src/components/platform/public/BookDemoTurnstile.tsx",
      "src/app/(marketing)/book-a-demo/page.tsx",
    ]) {
      const src = read(file);
      assert.ok(!src.includes("TURNSTILE_SECRET_KEY"));
      assert.ok(!/1x0000000000000000000000000000000AA/.test(src));
    }
    console.log("[9] Secret never enters client sources... PASS");
  }

  // 10. Existing anti-spam preserved
  {
    const route = read("src/app/api/platform/public/book-demo/route.ts");
    assert.ok(route.includes("allowBookDemoRequest"));
    assert.ok(route.includes("BOOK_DEMO_HONEYPOT_FIELD") || route.includes("faxNumber"));
    assert.ok(route.includes('"status"'));
    assert.ok(route.includes("assertBookDemoPlatformHostname"));
    const rate = read("src/lib/platform/public/book-demo-rate-limit.ts");
    assert.ok(rate.includes("best-effort"));
    assert.ok(rate.includes("isolate"));
    console.log("[10] Existing anti-spam preserved + rate-limit note... PASS");
  }

  // 11. Isolation + env naming
  {
    const envExample = read(".env.example");
    assert.ok(envExample.includes("NEXT_PUBLIC_TURNSTILE_SITE_KEY"));
    assert.ok(envExample.includes("TURNSTILE_SECRET_KEY"));
    assert.ok(!envExample.includes("NEXT_PUBLIC_TURNSTILE_SECRET"));
    for (const file of listTsFiles("src/lib/platform/public").concat([
      "src/app/api/platform/public/book-demo/route.ts",
    ])) {
      const src = read(file);
      assert.ok(!/prisma\.lead\./.test(src), file);
      assert.ok(!/requirePlatformOperator/.test(src), file);
    }
    console.log("[11] Env naming + isolation... PASS");
  }

  // 12. Public error message is safe
  {
    assert.equal(
      BOOK_DEMO_TURNSTILE_ERROR_MESSAGE,
      "Please complete the security verification and try again.",
    );
    console.log("[12] Safe verification error UX... PASS");
  }

  console.log("\nSTAGE 6.6B.1 — ALL TESTS PASSED\n");
  console.log(
    "Owner must create a Cloudflare Turnstile widget for houzzatpro.com and set Worker secrets before physical production testing.\n",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
