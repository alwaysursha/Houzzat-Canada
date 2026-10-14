/**
 * Seller Readiness bot-protection selftest.
 * Run: node --import tsx scripts/seller-readiness-abuse-selftest.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BOOK_DEMO_TURNSTILE_ACTION,
  BookDemoPublicError,
  SELLER_READINESS_TURNSTILE_ACTION,
  SELLER_READINESS_TURNSTILE_ALLOWED_HOSTNAMES,
  TURNSTILE_TEST_DUMMY_TOKEN,
  TURNSTILE_TEST_SECRET_KEY_PASS,
  assertTurnstileSiteverifyContext,
  verifyTurnstileToken,
} from "../src/lib/platform";
import {
  allowSellerReadinessRequest,
  clearSellerReadinessRateLimitsForTests,
  isDisposableEmailDomain,
  isHoneypotTripped,
  SELLER_READINESS_HONEYPOT_FIELD,
  validateSellerReadinessFields,
} from "../src/lib/tools/seller-readiness-abuse";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function mockFetch(payload: unknown, ok = true, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

async function main() {
  console.log("\n=== SELLER READINESS ABUSE PROTECTION ===\n");

  // 1. Route requires Turnstile before lead write
  {
    const route = read("src/app/api/tools/seller-readiness/route.ts");
    assert.ok(route.includes("verifyTurnstileToken"));
    assert.ok(route.includes("SELLER_READINESS_TURNSTILE_ACTION"));
    assert.ok(route.includes("allowSellerReadinessRequest"));
    assert.ok(route.includes("isHoneypotTripped"));
    assert.ok(route.includes("validateSellerReadinessFields"));
    assert.ok(
      /await verifyTurnstileToken\([\s\S]*?publicResolveOrCreateLead\(/.test(
        route,
      ),
    );
    assert.ok(route.includes("function publicOk"));
    assert.ok(/return NextResponse\.json\(\{\s*ok:\s*true as const\s*\}\)/.test(route));
    assert.ok(!route.includes("leadId: lead.id }"));
    assert.ok(route.includes("if (created)"));
    console.log("[1] Route gates writes behind Turnstile + rate limit... PASS");
  }

  // 2. Form sends token + honeypot; no secret on client
  {
    const form = read("src/components/tools/SellerReadinessForm.tsx");
    const page = read("src/app/(marketing)/tools/seller-readiness/page.tsx");
    assert.ok(form.includes("turnstileToken"));
    assert.ok(form.includes("SELLER_READINESS_HONEYPOT_FIELD"));
    assert.ok(form.includes("SELLER_READINESS_TURNSTILE_ACTION"));
    assert.ok(!form.includes("TURNSTILE_SECRET"));
    assert.ok(page.includes("readTurnstileSiteKey"));
    assert.equal(SELLER_READINESS_HONEYPOT_FIELD, "companyUrl");
    console.log("[2] Client sends token; secret stays server-side... PASS");
  }

  // 3. Missing / invalid Turnstile fails closed
  {
    await assert.rejects(
      () =>
        verifyTurnstileToken({
          token: "",
          secret: TURNSTILE_TEST_SECRET_KEY_PASS,
          expectedAction: SELLER_READINESS_TURNSTILE_ACTION,
          allowedHostnames: SELLER_READINESS_TURNSTILE_ALLOWED_HOSTNAMES,
          fetchImpl: mockFetch({ success: true }),
        }),
      (e: unknown) =>
        e instanceof BookDemoPublicError && e.code === "TURNSTILE_REQUIRED",
    );
    await assert.rejects(
      () =>
        verifyTurnstileToken({
          token: TURNSTILE_TEST_DUMMY_TOKEN,
          secret: TURNSTILE_TEST_SECRET_KEY_PASS,
          expectedAction: SELLER_READINESS_TURNSTILE_ACTION,
          allowedHostnames: SELLER_READINESS_TURNSTILE_ALLOWED_HOSTNAMES,
          fetchImpl: mockFetch({
            success: false,
            hostname: "houzzat.com",
            action: SELLER_READINESS_TURNSTILE_ACTION,
          }),
        }),
      (e: unknown) =>
        e instanceof BookDemoPublicError && e.code === "TURNSTILE_FAILED",
    );
    console.log("[3] Bot without valid verification rejected... PASS");
  }

  // 4. Action binding — wrong / missing action must not pass seller_readiness
  {
    assert.throws(
      () =>
        assertTurnstileSiteverifyContext(
          {
            success: true,
            hostname: "houzzat.com",
            action: BOOK_DEMO_TURNSTILE_ACTION,
          },
          {
            expectedAction: SELLER_READINESS_TURNSTILE_ACTION,
            allowedHostnames: SELLER_READINESS_TURNSTILE_ALLOWED_HOSTNAMES,
          },
        ),
      (e: unknown) =>
        e instanceof BookDemoPublicError &&
        e.code === "TURNSTILE_ACTION_MISMATCH",
    );
    assert.throws(
      () =>
        assertTurnstileSiteverifyContext(
          {
            success: true,
            hostname: "houzzat.com",
          },
          {
            expectedAction: SELLER_READINESS_TURNSTILE_ACTION,
            allowedHostnames: SELLER_READINESS_TURNSTILE_ALLOWED_HOSTNAMES,
          },
        ),
      (e: unknown) =>
        e instanceof BookDemoPublicError &&
        e.code === "TURNSTILE_ACTION_MISMATCH",
    );
    console.log("[4] Direct API cannot reuse Book Demo / empty action... PASS");
  }

  // 5. Tenant hostname + request host matching
  {
    const ok = await verifyTurnstileToken({
      token: TURNSTILE_TEST_DUMMY_TOKEN,
      secret: TURNSTILE_TEST_SECRET_KEY_PASS,
      expectedAction: SELLER_READINESS_TURNSTILE_ACTION,
      allowedHostnames: SELLER_READINESS_TURNSTILE_ALLOWED_HOSTNAMES,
      requestHostname: "custom-tenant.example",
      fetchImpl: mockFetch({
        success: true,
        hostname: "custom-tenant.example",
        action: SELLER_READINESS_TURNSTILE_ACTION,
      }),
    });
    assert.equal(ok.success, true);

    assert.throws(
      () =>
        assertTurnstileSiteverifyContext(
          {
            success: true,
            hostname: "evil.example",
            action: SELLER_READINESS_TURNSTILE_ACTION,
          },
          {
            expectedAction: SELLER_READINESS_TURNSTILE_ACTION,
            allowedHostnames: SELLER_READINESS_TURNSTILE_ALLOWED_HOSTNAMES,
            requestHostname: "houzzat.com",
          },
        ),
      (e: unknown) =>
        e instanceof BookDemoPublicError &&
        e.code === "TURNSTILE_HOSTNAME_MISMATCH",
    );
    console.log("[5] Hostname binding for tenant hosts... PASS");
  }

  // 6. Rate limit per IP / email
  {
    clearSellerReadinessRateLimitsForTests();
    for (let i = 0; i < 5; i++) {
      assert.equal(
        allowSellerReadinessRequest({
          clientIp: "203.0.113.9",
          email: `user${i}@example.com`,
        }),
        true,
      );
    }
    assert.equal(
      allowSellerReadinessRequest({
        clientIp: "203.0.113.9",
        email: "another@example.com",
      }),
      false,
    );

    clearSellerReadinessRateLimitsForTests();
    assert.equal(
      allowSellerReadinessRequest({
        clientIp: "203.0.113.10",
        email: "same@example.com",
      }),
      true,
    );
    assert.equal(
      allowSellerReadinessRequest({
        clientIp: "203.0.113.11",
        email: "same@example.com",
      }),
      true,
    );
    assert.equal(
      allowSellerReadinessRequest({
        clientIp: "203.0.113.12",
        email: "same@example.com",
      }),
      true,
    );
    assert.equal(
      allowSellerReadinessRequest({
        clientIp: "203.0.113.13",
        email: "same@example.com",
      }),
      false,
    );
    clearSellerReadinessRateLimitsForTests();
    console.log("[6] Rate-limit enforcement... PASS");
  }

  // 7. Honeypot + validation + disposable email
  {
    assert.equal(isHoneypotTripped("http://spam.test"), true);
    assert.equal(isHoneypotTripped(""), false);
    assert.equal(isHoneypotTripped("   "), false);

    assert.equal(
      validateSellerReadinessFields({
        address: "123 Main Street",
        name: "José García",
        email: "jose@example.com",
        score: 40,
      }).ok,
      true,
    );
    assert.equal(
      validateSellerReadinessFields({
        address: "123 Main Street",
        name: "12345",
        email: "jose@example.com",
        score: 40,
      }).ok,
      false,
    );
    assert.equal(isDisposableEmailDomain("bot@mailinator.com"), true);
    assert.equal(isDisposableEmailDomain("person@gmail.com"), false);
    console.log("[7] Honeypot + input validation... PASS");
  }

  // 8. Book Demo still hostname-isolated from random tenants
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
    console.log("[8] Existing Book Demo hostname isolation preserved... PASS");
  }

  // 9. Inventory note — creates User+Lead (docs for operators)
  {
    const route = read("src/app/api/tools/seller-readiness/route.ts");
    assert.ok(route.includes('source: "SELLER_READINESS"'));
    assert.ok(route.includes('upsertCustomer') === false); // default true → User
    console.log("[9] Source attribution SELLER_READINESS unchanged... PASS");
  }

  console.log("\nAll seller-readiness abuse selftests passed.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
