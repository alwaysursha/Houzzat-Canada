/**
 * SSR hang probe: structured logs only, no behavior change.
 * Run: node --import tsx scripts/ssr-hang-instrumentation-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  logSsrHang,
  SSR_HANG_EVENT,
  SSR_HANG_LOG_PREFIX,
  ssrHangCorrelationFromHeaders,
  ssrHangCorrelationFromRequest,
  ssrHangErrorFields,
} from "@/lib/observability/ssr-hang-log";
import { loadListingForDetailPage } from "@/lib/listings/load-listing-for-detail";
import type { ListingDetail } from "@/lib/listings/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function captureInfo(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(" "));
  };
  return {
    lines,
    restore: () => {
      console.info = original;
    },
  };
}

function payloadFromLine(line: string): Record<string, unknown> {
  const idx = line.indexOf("{");
  assert.ok(idx >= 0, `expected JSON payload in ${line}`);
  return JSON.parse(line.slice(idx)) as Record<string, unknown>;
}

async function main() {
{
  const corr = ssrHangCorrelationFromHeaders((name) => {
    if (name === "cookie") return "session=SECRET";
    if (name === "authorization") return "Bearer SECRET";
    if (name === "x-vercel-id") return "sfo1::abc123";
    if (name === "host") return "houzzat.com:443";
    if (name === "x-matched-path") return "/listing/[...parts]";
    if (name === "x-forwarded-for") return "1.2.3.4";
    return null;
  });
  assert.equal(corr.requestId, "sfo1::abc123");
  assert.equal(corr.host, "houzzat.com");
  assert.equal(corr.route, "/listing/[...parts]");
  const serialized = JSON.stringify(corr);
  assert.ok(!serialized.toLowerCase().includes("cookie"));
  assert.ok(!serialized.toLowerCase().includes("bearer"));
  assert.ok(!serialized.includes("1.2.3.4"));
  console.log("[1] correlation picks vercel-id/host/route only... PASS");
}

{
  const request = new Request("https://houzzat.com/", {
    headers: {
      cookie: "session=SECRET",
      authorization: "Bearer SECRET",
      "x-vercel-id": "iad1::xyz",
      host: "www.houzzat.com",
    },
  });
  const corr = ssrHangCorrelationFromRequest(request);
  assert.equal(corr.requestId, "iad1::xyz");
  assert.equal(corr.host, "www.houzzat.com");
  assert.ok(!JSON.stringify(corr).includes("SECRET"));
  console.log("[2] request correlation ignores cookies/tokens... PASS");
}

{
  const { lines, restore } = captureInfo();
  try {
    logSsrHang({
      event: SSR_HANG_EVENT.tenancyStart,
      requestId: "req_1",
      host: "houzzat.com",
      route: "/",
    });
    assert.equal(lines.length, 1);
    assert.ok(lines[0]!.startsWith(SSR_HANG_LOG_PREFIX));
    const payload = payloadFromLine(lines[0]!);
    assert.equal(payload.event, "ssr-hang.tenancy.start");
    assert.equal(payload.requestId, "req_1");
    assert.equal(payload.host, "houzzat.com");
    assert.equal(payload.route, "/");
    const blob = JSON.stringify(payload).toLowerCase();
    assert.ok(!blob.includes("cookie"));
    assert.ok(!blob.includes("authorization"));
    assert.ok(!blob.includes("token"));
    assert.ok(!blob.includes("email"));
  } finally {
    restore();
  }
  console.log("[3] structured [ssr-hang] payload... PASS");
}

{
  const prismaErr = Object.assign(new Error("hidden"), {
    name: "PrismaClientKnownRequestError",
    code: "P2024",
  });
  const fields = ssrHangErrorFields(prismaErr);
  assert.equal(fields.errorName, "PrismaClientKnownRequestError");
  assert.equal(fields.errorCode, "P2024");
  assert.ok(!("message" in fields));
  console.log("[4] failure logs name/code only... PASS");
}

{
  const listing = {
    organizationId: "org",
    providerKey: "proptx",
    dataSource: "mls",
    status: "ACTIVE",
  } as ListingDetail;

  const { lines, restore } = captureInfo();
  try {
    const hit = await loadListingForDetailPage("X123", {
      getByMlsForDetailPage: async () => listing,
      onDemandLookup: async () => {
        throw new Error("on-demand must not run on HIT");
      },
    });
    assert.equal(hit, listing);

    let lookups = 0;
    const miss = await loadListingForDetailPage("X404", {
      getByMlsForDetailPage: async () => {
        lookups += 1;
        return null;
      },
      onDemandLookup: async () => ({ mlsNumbers: [] }),
    });
    assert.equal(miss, null);
    assert.equal(lookups, 1);

    const skip = await loadListingForDetailPage("   ", {
      getByMlsForDetailPage: async () => {
        throw new Error("empty MLS must not query");
      },
    });
    assert.equal(skip, null);

    await assert.rejects(
      () =>
        loadListingForDetailPage("XERR", {
          getByMlsForDetailPage: async () => {
            throw Object.assign(new Error("db down"), {
              name: "HangProbeError",
            });
          },
        }),
      (err: unknown) => err instanceof Error && err.name === "HangProbeError",
    );

    const events = lines.map((line) => payloadFromLine(line).event);
    assert.ok(events.includes("ssr-hang.listing.start"));
    assert.ok(events.includes("ssr-hang.listing.success"));
    const success = lines
      .map((line) => payloadFromLine(line))
      .filter((p) => p.event === "ssr-hang.listing.success");
    const neons = success.map((p) => p.neon);
    assert.ok(neons.includes("HIT"));
    assert.ok(neons.includes("MISS"));
    assert.ok(neons.includes("SKIP"));
    const failure = lines
      .map((line) => payloadFromLine(line))
      .find((p) => p.event === "ssr-hang.listing.failure");
    assert.equal(failure?.errorName, "HangProbeError");
    assert.ok(!JSON.stringify(failure).includes("db down"));
  } finally {
    restore();
  }
  console.log("[5] listing START/SUCCESS HIT|MISS|SKIP... PASS");
}

{
  const page = read("src/app/(marketing)/listing/[...parts]/listing-operational.tsx");
  const vercelGate = page.indexOf("const clientLivePhotosPromise = process.env.VERCEL");
  const fetchIdx = page.indexOf("fetchListingPhotosFromPropTx(");
  assert.ok(vercelGate >= 0, "Vercel SSR must short-circuit live photos");
  assert.ok(fetchIdx > vercelGate, "PropTx must not be invoked before the Vercel gate");
  assert.ok(!page.includes("const livePhotosPromise ="));
  assert.ok(!page.includes("await fetchListingPhotosFromPropTx"));
  assert.ok(!page.includes("await livePhotosPromise"));
  assert.ok(page.includes("verifyLocked ? null : clientLivePhotosPromise"));
  console.log("[6] Vercel listing SSR never starts PropTx gallery fetch... PASS");
}

{
  const photos = read("src/lib/proptx/listing-photos.ts");
  assert.ok(photos.includes("SSR_HANG_EVENT.proptxStart"));
  assert.ok(photos.includes("SSR_HANG_EVENT.proptxSettled"));
  assert.ok(photos.includes("finally"));
  const tenancy = read("src/lib/tenancy/resolve-marketing-tenancy.ts");
  assert.ok(tenancy.includes("SSR_HANG_EVENT.tenancyStart"));
  assert.ok(tenancy.includes("SSR_HANG_EVENT.tenancySuccess"));
  assert.ok(tenancy.includes("SSR_HANG_EVENT.tenancyFailure"));
  console.log("[7] event names present in instrumented files... PASS");
}

console.log("ssr-hang instrumentation selftest: all passed");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
