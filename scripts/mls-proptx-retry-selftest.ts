/**
 * Shared PropTx retry, timeout, and address-history stamp rules.
 * Mocks only — no PropTx, no database.
 * Run: pnpm mls:proptx-retry:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PropTxConfig } from "../src/lib/proptx/config";
import {
  PropTxError,
  PropTxTimeoutError,
  proptxFetch,
  proptxJson,
  proptxPages,
} from "../src/lib/proptx/client";
import {
  AddressHistoryLookupError,
  collectCompletedAddressProperties,
} from "../src/lib/proptx/resolve-listing";
import {
  backoffDelayMs,
  configurePropTxTransportForTests,
  parseRetryAfterMs,
  PROPTX_MAX_RETRY_AFTER_MS,
  propTxInFlight,
  readPropTxTransportStats,
  resetPropTxTransportForTests,
} from "../src/lib/proptx/transport-retry";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const config: PropTxConfig = {
  endpointUrl: "https://proptx.test",
  bearerToken: "test-token-do-not-log",
  tokenId: "token-id-do-not-log",
  tokenIdHeader: "TokenId",
  feed: "vow",
};

function jsonResponse(
  body: string,
  status: number,
  headers?: Record<string, string>,
): Response {
  return new Response(body, { status, headers });
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function main() {
  console.log("\n=== MLS PROPTX RETRY ===\n");
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };

  try {
    {
      const header = parseRetryAfterMs("2", 0);
      assert.equal(header, 2_000);
      const huge = parseRetryAfterMs("999999", 0);
      assert.equal(huge, PROPTX_MAX_RETRY_AFTER_MS);
      const when = Date.parse("2026-09-21T22:00:05.000Z");
      const httpDate = parseRetryAfterMs(
        new Date(when).toUTCString(),
        Date.parse("2026-09-21T22:00:00.000Z"),
      );
      assert.equal(httpDate, 5_000);
      assert.equal(parseRetryAfterMs("not-a-date", 0), null);
      assert.equal(backoffDelayMs(1, 1), 1_000);
      assert.equal(backoffDelayMs(2, 1), 2_000);
      assert.equal(backoffDelayMs(1, 0), 0);
      console.log("[1] Retry-After parsing and full-jitter backoff... PASS");
    }

    {
      resetPropTxTransportForTests();
      const sleeps: number[] = [];
      let calls = 0;
      let clock = 1_000_000;
      configurePropTxTransportForTests({
        now: () => clock,
        random: () => 0,
        sleep: async (ms) => {
          sleeps.push(ms);
          clock += ms;
        },
        fetch: async () => {
          calls += 1;
          if (calls === 1) {
            return jsonResponse("no", 429, { "Retry-After": "2" });
          }
          return jsonResponse("{}", 200);
        },
      });
      const res = await proptxFetch("Property", {}, config);
      assert.equal(res.status, 200);
      assert.equal(calls, 2);
      assert.deepEqual(sleeps, [2_000]);
      const stats = readPropTxTransportStats();
      assert.equal(stats.requests, 2);
      assert.equal(stats.retries, 1);
      assert.equal(stats.rateLimited, 1);
      assert.equal(stats.retryAfterWaits, 1);
      assert.equal(stats.backoffMs, 2_000);
      console.log("[2] 429 honors Retry-After and then succeeds... PASS");
    }

    {
      resetPropTxTransportForTests();
      const sleeps: number[] = [];
      let calls = 0;
      let clock = 5_000;
      configurePropTxTransportForTests({
        now: () => clock,
        random: () => 1,
        sleep: async (ms) => {
          sleeps.push(ms);
          clock += ms;
        },
        fetch: async () => {
          calls += 1;
          if (calls === 1) return jsonResponse("busy", 429);
          return jsonResponse("{}", 200);
        },
      });
      await proptxFetch("Property", {}, config);
      assert.equal(calls, 2);
      assert.equal(sleeps[0], 1_000);
      assert.equal(readPropTxTransportStats().retryAfterWaits, 0);
      console.log("[3] 429 without Retry-After uses backoff... PASS");
    }

    {
      resetPropTxTransportForTests();
      const sleeps: number[] = [];
      let clock = 0;
      configurePropTxTransportForTests({
        now: () => clock,
        random: () => 1,
        sleep: async (ms) => {
          sleeps.push(ms);
          clock += ms;
        },
        fetch: async () => jsonResponse("slow", 429, { "Retry-After": "999999" }),
      });
      await assert.rejects(
        () => proptxFetch("Property", {}, config),
        (err: unknown) => err instanceof PropTxError && err.status === 429,
      );
      assert.ok(sleeps.every((ms) => ms === 120_000));
      assert.equal(sleeps.length, 2);
      console.log("[3b] oversized Retry-After is capped at 120s... PASS");
    }

    {
      resetPropTxTransportForTests();
      let clock = 10_000;
      let calls = 0;
      const sleeps: Array<{ ms: number; release: () => void }> = [];
      const hung: Array<(response: Response) => void> = [];
      const signals: AbortSignal[] = [];
      configurePropTxTransportForTests({
        now: () => clock,
        random: () => 0,
        sleep: (ms) =>
          new Promise((resolve) => {
            sleeps.push({
              ms,
              release: () => {
                clock += ms;
                resolve();
              },
            });
          }),
        fetch: (_url, init) => {
          calls += 1;
          if (init?.signal) signals.push(init.signal);
          return new Promise((resolve) => {
            hung.push(resolve);
          });
        },
      });
      const first = proptxFetch("Property?$top=1", {}, config);
      const second = proptxFetch("Property?$top=2", {}, config);
      for (let i = 0; i < 10 && hung.length < 2; i += 1) await flush();
      assert.equal(hung.length, 2);
      const secondSignal = signals[1];
      hung[0]!(jsonResponse("{}", 429, { "Retry-After": "5" }));
      for (let i = 0; i < 10 && sleeps.length < 1; i += 1) await flush();
      assert.equal(secondSignal?.aborted, false);
      hung[1]!(jsonResponse("{}", 200));
      await second;
      const third = proptxFetch("Property?$top=3", {}, config);
      for (let i = 0; i < 10 && sleeps.length < 2; i += 1) await flush();
      assert.equal(calls, 2);
      assert.equal(sleeps.length, 2);
      assert.equal(sleeps[0]?.ms, 5_000);
      sleeps[0]?.release();
      for (let i = 0; i < 10 && hung.length < 3; i += 1) await flush();
      hung[2]!(jsonResponse("{}", 200));
      sleeps[1]?.release();
      for (let i = 0; i < 10 && hung.length < 4; i += 1) await flush();
      hung[3]!(jsonResponse("{}", 200));
      await Promise.all([first, third]);
      assert.ok(calls >= 3);
      console.log("[4] in-flight work continues; later calls wait out the shared cooldown... PASS");
    }

    {
      resetPropTxTransportForTests();
      let calls = 0;
      configurePropTxTransportForTests({
        now: () => 0,
        random: () => 1,
        sleep: async () => {},
        fetch: async () => {
          calls += 1;
          if (calls < 3) return jsonResponse("down", 503);
          return jsonResponse("{}", 200);
        },
      });
      const res = await proptxFetch("Media", {}, config);
      assert.equal(res.status, 200);
      assert.equal(calls, 3);
      assert.equal(readPropTxTransportStats().serverErrors, 2);
      assert.equal(readPropTxTransportStats().retries, 2);
      console.log("[5] 503 retries then succeeds... PASS");
    }

    {
      resetPropTxTransportForTests();
      let calls = 0;
      configurePropTxTransportForTests({
        now: () => 0,
        random: () => 1,
        sleep: async () => {},
        fetch: async () => {
          calls += 1;
          if (calls === 1) throw new TypeError("fetch failed");
          return jsonResponse("{}", 200);
        },
      });
      await proptxFetch("Property", {}, config);
      assert.equal(calls, 2);
      assert.equal(readPropTxTransportStats().networkErrors, 1);
      console.log("[6] network errors retry... PASS");
    }

    {
      resetPropTxTransportForTests();
      let sawAbort = false;
      configurePropTxTransportForTests({
        now: () => 0,
        random: () => 0,
        sleep: async () => {},
        fetch: (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              sawAbort = true;
              reject(new DOMException("aborted", "AbortError"));
            });
          }),
      });
      await assert.rejects(
        () => proptxFetch("Property", {}, config, { timeoutMs: 30, retry: false }),
        (err: unknown) => err instanceof PropTxTimeoutError,
      );
      assert.equal(sawAbort, true);
      assert.equal(readPropTxTransportStats().timeouts, 1);
      console.log("[7] timeout aborts the request... PASS");
    }

    {
      for (const status of [400, 401, 403, 404]) {
        resetPropTxTransportForTests();
        let calls = 0;
        configurePropTxTransportForTests({
          now: () => 0,
          random: () => 1,
          sleep: async () => {},
          fetch: async () => {
            calls += 1;
            return jsonResponse("no", status);
          },
        });
        await assert.rejects(
          () => proptxFetch("Property('missing')", {}, config),
          (err: unknown) => err instanceof PropTxError && err.status === status,
        );
        assert.equal(calls, 1, `status ${status} was retried`);
      }
      console.log("[8] 400/401/403/404 are a single attempt... PASS");
    }

    {
      resetPropTxTransportForTests();
      let calls = 0;
      configurePropTxTransportForTests({
        now: () => 0,
        random: () => 1,
        sleep: async () => {},
        fetch: async () => {
          calls += 1;
          return jsonResponse("down", 502);
        },
      });
      await assert.rejects(
        () => proptxFetch("Property", {}, config),
        (err: unknown) => err instanceof PropTxError && err.status === 502,
      );
      assert.equal(calls, 3);
      assert.equal(readPropTxTransportStats().exhaustedRetries, 1);
      assert.equal(readPropTxTransportStats().retries, 2);
      console.log("[9] three failed attempts then throw... PASS");
    }

    {
      resetPropTxTransportForTests();
      let current = 0;
      let max = 0;
      let started = 0;
      const pending: Array<() => void> = [];
      configurePropTxTransportForTests({
        now: () => 0,
        random: () => 0,
        sleep: async () => {},
        fetch: () => {
          started += 1;
          current += 1;
          max = Math.max(max, current);
          return new Promise((resolve) => {
            pending.push(() => {
              current -= 1;
              resolve(jsonResponse("{}", 200));
            });
          });
        },
      });
      const calls = Array.from({ length: 6 }, (_, index) =>
        proptxFetch(`Property?$skip=${index}`, {}, config, { retry: false }),
      );
      for (let i = 0; i < 20 && started < 4; i += 1) await flush();
      assert.equal(started, 4);
      assert.equal(max, 4);
      assert.equal(propTxInFlight(), 4);
      while (started < 6 || pending.length > 0) {
        const batch = pending.splice(0, pending.length);
        assert.ok(batch.length > 0);
        for (const done of batch) done();
        await flush();
        assert.ok(max <= 4);
      }
      await Promise.all(calls);
      assert.equal(max, 4);
      assert.equal(started, 6);
      console.log("[10] at most 4 PropTx requests are in flight... PASS");
    }

    {
      resetPropTxTransportForTests();
      let calls = 0;
      configurePropTxTransportForTests({
        now: () => 0,
        random: () => 1,
        sleep: async () => {},
        fetch: async () => {
          calls += 1;
          return jsonResponse("down", 504);
        },
      });
      let yielded = false;
      await assert.rejects(
        async () => {
          for await (const _page of proptxPages("Property?$top=100", { config })) {
            yielded = true;
            void _page;
          }
        },
        (err: unknown) => err instanceof PropTxError && err.status === 504,
      );
      assert.equal(yielded, false);
      assert.equal(calls, 3);

      resetPropTxTransportForTests();
      configurePropTxTransportForTests({
        now: () => 0,
        random: () => 0,
        sleep: async () => {},
        fetch: async () => jsonResponse('{"value":[]}', 200),
      });
      const empty = await proptxJson<{ value: unknown[] }>("Property?$top=1", config);
      assert.deepEqual(empty.value, []);
      assert.equal(readPropTxTransportStats().requests, 1);

      resetPropTxTransportForTests();
      configurePropTxTransportForTests({
        now: () => 0,
        random: () => 0,
        sleep: async () => {},
        fetch: async () => jsonResponse("not-json", 200),
      });
      await assert.rejects(
        () => proptxJson("Property?$top=1", config),
        (err: unknown) => err instanceof PropTxError,
      );
      assert.equal(readPropTxTransportStats().requests, 1);
      console.log("[11] failed pages throw; 200 empty is success; bad JSON is not retried... PASS");
    }

    {
      const sync = read("src/lib/proptx/sync.ts");
      const property = sync.slice(
        sync.indexOf("async function syncProperties"),
        sync.indexOf("async function syncMediaBackfill"),
      );
      const loop = property.indexOf("for await");
      const cursor = property.indexOf("setCursor(RESOURCE_PROPERTY");
      assert.ok(loop >= 0 && cursor > loop);
      assert.ok(!property.slice(loop, cursor).includes("catch"));
      const history = sync.slice(
        sync.indexOf("async function syncHistory("),
        sync.indexOf("async function runMlsFastPropertyPasses"),
      );
      const historyLoop = history.indexOf("for await");
      const historyCursor = history.indexOf("setCursor(RESOURCE_HISTORY");
      assert.ok(historyLoop >= 0 && historyCursor > historyLoop);
      assert.ok(
        !history
          .slice(0, historyLoop)
          .includes("try {"),
        "history page walk must not be wrapped in a catch that can advance the cursor",
      );

      const media = sync.slice(
        sync.indexOf("async function syncMediaForListing"),
        sync.indexOf("async function commitMediaSyncStamp"),
      );
      const fetchCatch = media.indexOf('return "error"');
      const deletes = media.indexOf("plan.deleteUrls");
      assert.ok(fetchCatch >= 0 && deletes > fetchCatch);
      assert.ok(sync.includes('if (outcome !== "complete") return'));

      const reconcile = read("src/lib/proptx/mls-on-market-reconcile.ts");
      const verify = reconcile.slice(
        reconcile.indexOf("async function verifyOne"),
        reconcile.indexOf("function countTransition"),
      );
      const failed = verify.indexOf("if (!fetched.ok)");
      const apply = verify.indexOf("deps.applyStatus");
      assert.ok(failed >= 0 && apply > failed);
      assert.ok(reconcile.includes("if (!walk.complete)"));
      assert.ok(!reconcile.includes("new Promise<never>"));
      console.log("[12] pagination, media, and reconciliation keep failure from looking complete... PASS");
    }

    {
      const addressConfig = config;
      resetPropTxTransportForTests();
      let clock = 0;
      configurePropTxTransportForTests({
        now: () => clock,
        random: () => 1,
        sleep: async (ms) => {
          clock += ms;
        },
        fetch: async () => jsonResponse("busy", 429),
      });
      await assert.rejects(
        () =>
          collectCompletedAddressProperties({
            filters: ["City eq 'Toronto'"],
            configs: [addressConfig],
            timeoutMs: 8_000,
            top: 25,
          }),
        (err: unknown) =>
          err instanceof AddressHistoryLookupError &&
          err.reason === "http" &&
          err.status === 429,
      );

      resetPropTxTransportForTests();
      const aborted = new AbortController();
      aborted.abort();
      configurePropTxTransportForTests({
        now: () => 0,
        random: () => 0,
        sleep: async () => {},
        fetch: async () => {
          throw new Error("should not fetch");
        },
      });
      await assert.rejects(
        () =>
          collectCompletedAddressProperties({
            filters: ["City eq 'Toronto'"],
            configs: [addressConfig],
            timeoutMs: 8_000,
            signal: aborted.signal,
            top: 25,
          }),
        (err: unknown) =>
          err instanceof AddressHistoryLookupError && err.reason === "timeout",
      );

      for (const status of [400, 404]) {
        resetPropTxTransportForTests();
        let calls = 0;
        configurePropTxTransportForTests({
          now: () => 0,
          random: () => 1,
          sleep: async () => {},
          fetch: async () => {
            calls += 1;
            return jsonResponse("no", status);
          },
        });
        await assert.rejects(
          () =>
            collectCompletedAddressProperties({
              filters: ["City eq 'Toronto'"],
              configs: [addressConfig],
              timeoutMs: 8_000,
              top: 25,
            }),
          (err: unknown) =>
            err instanceof AddressHistoryLookupError &&
            err.reason === "http" &&
            err.status === status,
        );
        assert.equal(calls, 1);
      }

      resetPropTxTransportForTests();
      configurePropTxTransportForTests({
        now: () => 0,
        random: () => 0,
        sleep: async () => {},
        fetch: async () => jsonResponse('{"value":[]}', 200),
      });
      const rows = await collectCompletedAddressProperties({
        filters: ["City eq 'Toronto'", "City eq 'Mississauga'"],
        configs: [addressConfig],
        timeoutMs: 8_000,
        top: 25,
      });
      assert.deepEqual(rows, []);

      const enrich = read("src/lib/proptx/address-history-enrich.ts");
      const fn = enrich.slice(
        enrich.indexOf("export async function enrichAddressListingHistory"),
        enrich.indexOf("export async function loadListingForAddressHistory"),
      );
      const fetchAt = fn.indexOf("await fetchAllPropertiesAtExactAddress");
      const stampAt = fn.indexOf("addressHistoryEnrichedAt: now");
      const catchAt = fn.indexOf("} catch (err)");
      assert.ok(fetchAt >= 0 && stampAt > fetchAt && catchAt > stampAt);
      assert.ok(!fn.slice(catchAt).includes("addressHistoryEnrichedAt"));
      console.log("[13] address history stamps only a completed HTTP 200... PASS");
    }

    {
      const sync = read("src/lib/proptx/sync.ts");
      assert.ok(sync.includes("applyPropTxTransportStats"));
      assert.ok(sync.includes("proptx429"));
      assert.ok(sync.includes("resetPropTxTransportStats"));
      const joined = warnings.join("\n");
      assert.ok(!joined.includes("test-token-do-not-log"));
      assert.ok(!joined.includes("token-id-do-not-log"));
      console.log("[14] transport counters attach to the sync run and logs omit credentials... PASS");
    }
  } finally {
    console.warn = originalWarn;
    resetPropTxTransportForTests();
  }

  console.log("\nMLS PROPTX RETRY SELFTEST PASSED\n");
}

main().catch((err) => {
  console.error(err);
  resetPropTxTransportForTests();
  process.exitCode = 1;
});
