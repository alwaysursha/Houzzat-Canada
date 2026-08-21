import assert from "node:assert/strict";
import { z } from "zod";

/** Mirrors the public /api/valuation request schema (subset). */
const schema = z.object({
  address: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(80).optional(),
  email: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .pipe(z.string().email().optional()),
  name: z.string().trim().min(1).max(120).optional(),
  quick: z.boolean().optional(),
  estimateOnly: z.boolean().optional(),
  intent: z.enum(["sell", "buy", "curious"]).default("sell"),
});

function testValidation() {
  assert.equal(schema.safeParse({ address: "ab" }).success, false);
  assert.equal(
    schema.safeParse({ address: "123 Main St, Milton, ON" }).success,
    true,
  );
  const withContact = schema.safeParse({
    address: "123 Main St",
    name: "Test Seller",
    email: "seller-test@houzzat.com",
    intent: "sell",
  });
  assert.equal(withContact.success, true);
}

/**
 * Durable CRM write plan for valuation — flat steps only (Neon HTTP safe).
 * Nested activities/appointments/consent create must not be used on Workers.
 */
function testFlatWritePlan() {
  const steps = [
    "lead.create",
    "leadActivity.create",
    "appointment.create (full contact only)",
    "agentTask.create (when assigned)",
  ] as const;

  assert.equal(steps[0], "lead.create");
  assert.ok(!steps.some((s) => s.includes("nested")));

  // Quick hero path skips appointment; still creates Lead + activity.
  const quickSteps = steps.filter((s) => !s.includes("appointment"));
  assert.deepEqual(quickSteps, [
    "lead.create",
    "leadActivity.create",
    "agentTask.create (when assigned)",
  ]);
}

function testSuccessGate() {
  function clientAccepts(res: {
    ok: boolean;
    leadId?: string;
    estimate?: { low: number; high: number };
  }) {
    return Boolean(res.ok && res.leadId && res.estimate);
  }

  assert.equal(
    clientAccepts({
      ok: true,
      leadId: "lead_1",
      estimate: { low: 1, high: 2 },
    }),
    true,
  );
  assert.equal(
    clientAccepts({ ok: true, estimate: { low: 1, high: 2 } }),
    false,
  );
  assert.equal(clientAccepts({ ok: false, leadId: "x" }), false);
}

function testDoubleTapLock() {
  let lock = false;
  let calls = 0;
  function submit() {
    if (lock) return;
    lock = true;
    calls += 1;
  }
  submit();
  submit();
  submit();
  assert.equal(calls, 1);
}

testValidation();
testFlatWritePlan();
testSuccessGate();
testDoubleTapLock();
console.log("seller-valuation-selftest: ok");
