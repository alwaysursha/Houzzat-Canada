/**
 * Phase 2A — FunnelEvent foundation selftest.
 * Run: pnpm funnel-events:selftest
 */

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  allowFunnelIngest,
  clearFunnelRateLimitsForTests,
  FunnelSanitizeError,
  ingestClientFunnelEvent,
  isFunnelEventsEnabled,
  parseClientFunnelPayload,
  recordRegistrationCompletedEvent,
  recordRegistrationCompletedEventSafe,
  writeFunnelEvent,
} from "../src/lib/funnel";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

console.log("\n=== FUNNEL EVENTS PHASE 2A ===\n");

// 1. Feature flag default disabled
{
  assert.equal(isFunnelEventsEnabled({}), false);
  assert.equal(isFunnelEventsEnabled({ FUNNEL_EVENTS_ENABLED: "" }), false);
  assert.equal(isFunnelEventsEnabled({ FUNNEL_EVENTS_ENABLED: "0" }), false);
  assert.equal(isFunnelEventsEnabled({ FUNNEL_EVENTS_ENABLED: "1" }), true);
  assert.equal(isFunnelEventsEnabled({ FUNNEL_EVENTS_ENABLED: "true" }), true);
  console.log("[1] Feature flag default-off... PASS");
}

// 2. Unknown event / server-only / spoofed ids
{
  assert.throws(
    () => parseClientFunnelPayload({ eventName: "not_real", visitorKey: "v", sessionKey: "s" }),
    (e: unknown) => e instanceof FunnelSanitizeError && e.code === "UNKNOWN_EVENT",
  );
  assert.throws(
    () =>
      parseClientFunnelPayload({
        eventName: "registration_completed",
        visitorKey: "v1",
        sessionKey: "s1",
      }),
    (e: unknown) => e instanceof FunnelSanitizeError && e.code === "SERVER_ONLY_EVENT",
  );
  assert.throws(
    () =>
      parseClientFunnelPayload({
        eventName: "registration_gate_shown",
        visitorKey: "v1",
        sessionKey: "s1",
        workspaceId: "ws_spoof",
      }),
    (e: unknown) =>
      e instanceof FunnelSanitizeError && e.code === "CLIENT_WORKSPACE_ID_FORBIDDEN",
  );
  assert.throws(
    () =>
      parseClientFunnelPayload({
        eventName: "registration_gate_shown",
        visitorKey: "v1",
        sessionKey: "s1",
        userId: "user_spoof",
      }),
    (e: unknown) =>
      e instanceof FunnelSanitizeError && e.code === "CLIENT_USER_ID_FORBIDDEN",
  );
  console.log("[2] Event allowlist + spoof rejection... PASS");
}

// 3. Payload validation (keys, meta PII strip, sizes)
{
  assert.throws(
    () =>
      parseClientFunnelPayload({
        eventName: "search_results_viewed",
        visitorKey: "a@b.com",
        sessionKey: "s1",
      }),
    (e: unknown) =>
      e instanceof FunnelSanitizeError && e.code === "MISSING_VISITOR_SESSION",
  );

  const ok = parseClientFunnelPayload({
    eventName: "property_card_clicked",
    visitorKey: "vk_abc",
    sessionKey: "sk_abc",
    mlsNumber: "w1234567",
    meta: {
      intentType: "VIEW_LISTING",
      email: "leak@example.com",
      name: "Secret",
      phone: "+15551212",
      pathClass: "search_card",
    },
  });
  assert.equal(ok.mlsNumber, "W1234567");
  assert.deepEqual(ok.meta, {
    intentType: "VIEW_LISTING",
    pathClass: "search_card",
  });
  console.log("[3] Payload validation + PII meta strip... PASS");
}

// 4. Rate limiting
{
  clearFunnelRateLimitsForTests();
  let allowed = 0;
  let blocked = 0;
  for (let i = 0; i < 70; i++) {
    if (allowFunnelIngest({ clientIp: "1.2.3.4", visitorKey: "same_visitor" })) {
      allowed += 1;
    } else {
      blocked += 1;
    }
  }
  assert.ok(allowed <= 60);
  assert.ok(blocked >= 1);
  clearFunnelRateLimitsForTests();
  console.log("[4] Rate limiting... PASS");
}

async function runAsyncCases(): Promise<void> {
// 5. Disabled flag no-ops writes
{
  const creates: unknown[] = [];
  const db = {
    funnelEvent: {
      async create(args: { data: unknown; select: { id: true } }) {
        creates.push(args.data);
        return { id: "evt1" };
      },
    },
  };
  const disabled = await writeFunnelEvent(
    {
      workspaceId: "ws1",
      eventName: "registration_gate_shown",
      occurredAt: new Date(),
      visitorKey: "v",
      sessionKey: "s",
      dedupeKey: "d1",
    },
    db,
    {},
  );
  assert.equal(disabled.status, "disabled");
  assert.equal(creates.length, 0);

  const enabled = await writeFunnelEvent(
    {
      workspaceId: "ws1",
      eventName: "registration_gate_shown",
      occurredAt: new Date(),
      visitorKey: "v",
      sessionKey: "s",
      dedupeKey: "d1",
    },
    db,
    { FUNNEL_EVENTS_ENABLED: "1" },
  );
  assert.equal(enabled.status, "written");
  assert.equal(creates.length, 1);
  console.log("[5] Feature flag disabled behavior... PASS");
}

// 6. Idempotent duplicate (P2002)
{
  let calls = 0;
  const db = {
    funnelEvent: {
      async create() {
        calls += 1;
        if (calls === 1) return { id: "evt1" };
        const err = Object.assign(new Error("Unique constraint"), { code: "P2002" });
        throw err;
      },
    },
  };
  const first = await writeFunnelEvent(
    {
      workspaceId: "ws1",
      eventName: "search_results_viewed",
      occurredAt: new Date(),
      visitorKey: "v",
      sessionKey: "s",
      dedupeKey: "dup-key",
    },
    db,
    { FUNNEL_EVENTS_ENABLED: "1" },
  );
  const second = await writeFunnelEvent(
    {
      workspaceId: "ws1",
      eventName: "search_results_viewed",
      occurredAt: new Date(),
      visitorKey: "v",
      sessionKey: "s",
      dedupeKey: "dup-key",
    },
    db,
    { FUNNEL_EVENTS_ENABLED: "1" },
  );
  assert.equal(first.status, "written");
  assert.equal(second.status, "duplicate");
  console.log("[6] Duplicate-event idempotency... PASS");
}

// 7. Client registration_completed rejection via ingest
{
  const result = await ingestClientFunnelEvent({
    workspaceId: "ws1",
    body: {
      eventName: "registration_completed",
      visitorKey: "v",
      sessionKey: "s",
    },
    env: { FUNNEL_EVENTS_ENABLED: "1" },
    db: {
      funnelEvent: {
        async create() {
          throw new Error("must not write");
        },
      },
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "SERVER_ONLY_EVENT");
    assert.equal(result.httpStatus, 403);
  }
  console.log("[7] Client registration_completed rejection... PASS");
}

// 8. Server completion without visitor/session keys + once per user
{
  const rows: Array<Record<string, unknown>> = [];
  const db = {
    funnelEvent: {
      async create(args: { data: Record<string, unknown>; select: { id: true } }) {
        rows.push(args.data);
        return { id: `id_${rows.length}` };
      },
    },
  };
  const r1 = await recordRegistrationCompletedEvent({
    workspaceId: "ws_a",
    userId: "user_1",
    visitorKey: null,
    sessionKey: undefined,
    env: { FUNNEL_EVENTS_ENABLED: "1" },
    db,
  });
  assert.equal(r1.status, "written");
  assert.equal(rows[0]?.visitorKey, null);
  assert.equal(rows[0]?.sessionKey, null);
  assert.equal(rows[0]?.userId, "user_1");
  assert.equal(rows[0]?.workspaceId, "ws_a");
  assert.equal(rows[0]?.eventName, "registration_completed");
  assert.equal(rows[0]?.dedupeKey, "registration_completed:user:user_1");

  // Cross-tenant isolation: same user id key is per-workspace unique constraint
  // (dedupe includes userId; workspaceId is separate column).
  const r2 = await recordRegistrationCompletedEvent({
    workspaceId: "ws_b",
    userId: "user_1",
    env: { FUNNEL_EVENTS_ENABLED: "1" },
    db,
  });
  assert.equal(r2.status, "written");
  assert.equal(rows[1]?.workspaceId, "ws_b");
  console.log("[8] Missing visitor/session + cross-tenant writes... PASS");
}

// 9. Signup success despite analytics failure (safe wrapper + route wiring)
{
  const route = read("src/app/api/auth/sign-up/route.ts");
  assert.ok(route.includes("recordRegistrationCompletedEventSafe"));
  assert.ok(route.includes("void recordRegistrationCompletedEventSafe"));
  assert.ok(!route.includes("reportGa4SignUp"));
  assert.ok(!route.includes("conversion_event_signup"));

  // Safe wrapper must not throw even if write throws unexpectedly.
  await recordRegistrationCompletedEventSafe({
    workspaceId: "ws1",
    userId: "u1",
    env: { FUNNEL_EVENTS_ENABLED: "1" },
    db: {
      funnelEvent: {
        async create() {
          throw new Error("db down");
        },
      },
    },
  });
  console.log("[9] Signup analytics fail-soft + no Ads in route... PASS");
}

// 10. API route security wiring
{
  assert.ok(existsSync("src/app/api/analytics/funnel/route.ts"));
  const api = read("src/app/api/analytics/funnel/route.ts");
  assert.ok(api.includes("resolveRequestTenancy"));
  assert.ok(api.includes("isFunnelEventsEnabled"));
  assert.ok(api.includes("allowFunnelIngest"));
  assert.ok(api.includes("ingestClientFunnelEvent"));
  assert.ok(api.includes("TENANCY_REQUIRED") || api.includes("Unresolved tenant"));

  // ActivityBeacon unchanged (no funnel import)
  const beacon = read("src/components/analytics/ActivityBeacon.tsx");
  assert.ok(!beacon.includes("@/lib/funnel"));
  const beaconRoute = read("src/app/api/analytics/beacon/route.ts");
  assert.ok(!beaconRoute.includes("@/lib/funnel"));
  console.log("[10] API tenancy + ActivityBeacon isolation... PASS");
}

// 11. Schema + migration present
{
  const schema = read("prisma/schema.prisma");
  assert.ok(schema.includes("model FunnelEvent"));
  assert.ok(schema.includes("enum FunnelEventName"));
  assert.ok(schema.includes('@@unique([workspaceId, dedupeKey])'));
  assert.ok(
    existsSync("prisma/migrations/20261012010000_funnel_event_phase2a/migration.sql"),
  );
  const mig = read(
    "prisma/migrations/20261012010000_funnel_event_phase2a/migration.sql",
  );
  assert.ok(mig.includes('CREATE TABLE "FunnelEvent"'));
  assert.ok(mig.includes("FunnelEvent_workspaceId_dedupeKey_key"));
  console.log("[11] Schema + additive migration... PASS");
}

// 12. Client ingest ignores body workspaceId (uses server workspace)
{
  const rows: Array<Record<string, unknown>> = [];
  const result = await ingestClientFunnelEvent({
    workspaceId: "ws_resolved",
    body: {
      eventName: "listing_detail_opened",
      visitorKey: "vk1",
      sessionKey: "sk1",
      // workspaceId forbidden — already tested; without it writes server workspace
      mlsNumber: "X1234567",
      dedupeKey: "listing:sk1:X1234567",
    },
    env: { FUNNEL_EVENTS_ENABLED: "1" },
    db: {
      funnelEvent: {
        async create(args: { data: Record<string, unknown>; select: { id: true } }) {
          rows.push(args.data);
          return { id: "ok" };
        },
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(rows[0]?.workspaceId, "ws_resolved");
  console.log("[12] Server tenancy workspace wins... PASS");
}
}

runAsyncCases()
  .then(() => {
    console.log("\nFUNNEL EVENTS PHASE 2A: ALL PASS\n");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
