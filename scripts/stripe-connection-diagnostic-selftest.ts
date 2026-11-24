import assert from "node:assert/strict";
import {
  EXPECTED_STRIPE_ACCOUNT_ID,
  EXPECTED_STRIPE_WEBHOOK_URL,
  REQUIRED_STRIPE_WEBHOOK_EVENTS,
  StripeConnectionDiagnosticGuardError,
  allowStripeConnectionDiagnostic,
  assertStripeConnectionDiagnosticOrigin,
  clearStripeConnectionDiagnosticRateLimitsForTests,
  diagnoseStripeConnection,
  summarizeStripeConnection,
  type StripeWebhookEndpointSnapshot,
} from "../src/lib/platform/billing/stripe-connection-diagnostic";

const REQUIRED = [...REQUIRED_STRIPE_WEBHOOK_EVENTS];

function endpoint(
  overrides: Partial<StripeWebhookEndpointSnapshot> = {},
): StripeWebhookEndpointSnapshot {
  return {
    url: EXPECTED_STRIPE_WEBHOOK_URL,
    status: "enabled",
    livemode: true,
    enabledEvents: REQUIRED,
    ...overrides,
  };
}

function request(headers: Record<string, string>): Request {
  return new Request(
    "https://houzzatpro.com/api/platform/v1/billing/stripe-connection",
    { method: "POST", headers },
  );
}

const allowedHeaders = {
  origin: "https://houzzatpro.com",
  host: "houzzatpro.com",
  "sec-fetch-site": "same-origin",
};

assert.doesNotThrow(() =>
  assertStripeConnectionDiagnosticOrigin(request(allowedHeaders)),
);
assert.doesNotThrow(() =>
  assertStripeConnectionDiagnosticOrigin(
    request({
      origin: "https://houzzatpro.com",
      "x-forwarded-host": "houzzatpro.com",
      host: "houzzat-vercel-test.vercel.app",
      "sec-fetch-site": "same-origin",
    }),
  ),
);

for (const headers of [
  { host: "houzzatpro.com" },
  { ...allowedHeaders, origin: "https://evil.example" },
  { ...allowedHeaders, origin: "https://houzzatpro.com.evil.example" },
  { ...allowedHeaders, "sec-fetch-site": "cross-site" },
  { ...allowedHeaders, host: "www.houzzatpro.com", "x-forwarded-host": "" },
  {
    origin: "https://houzzatpro.com",
    host: "preview.vercel.app",
    "sec-fetch-site": "same-origin",
  },
]) {
  assert.throws(
    () => assertStripeConnectionDiagnosticOrigin(request(headers)),
    (error: unknown) =>
      error instanceof StripeConnectionDiagnosticGuardError &&
      error.status === 403 &&
      error.code === "ORIGIN_REJECTED",
  );
}

clearStripeConnectionDiagnosticRateLimitsForTests();
for (let attempt = 0; attempt < 4; attempt += 1) {
  assert.equal(
    allowStripeConnectionDiagnostic({
      operatorId: "operator-a",
      clientIp: "203.0.113.8",
      now: 1_000,
    }),
    true,
  );
}
assert.equal(
  allowStripeConnectionDiagnostic({
    operatorId: "operator-a",
    clientIp: "203.0.113.9",
    now: 1_000,
  }),
  false,
);
assert.equal(
  allowStripeConnectionDiagnostic({
    operatorId: "operator-b",
    clientIp: "203.0.113.8",
    now: 1_000,
  }),
  true,
);

const pass = summarizeStripeConnection({
  liveKey: true,
  accountId: EXPECTED_STRIPE_ACCOUNT_ID,
  chargesEnabled: true,
  payoutsEnabled: true,
  requirementsPresent: true,
  currentlyDueCount: 0,
  pastDueCount: 0,
  endpoints: [endpoint()],
});
assert.equal(pass.status, "PASS");
assert.equal(pass.accountId, EXPECTED_STRIPE_ACCOUNT_ID);
assert.equal(pass.chargesEnabled, "yes");
assert.equal(pass.payoutsEnabled, "yes");
assert.equal(pass.outstandingRequirements, 0);
assert.equal(pass.liveMode, "yes");
assert.equal(pass.webhookDestinationFound, "yes");
assert.equal(pass.webhookUrlMatch, "yes");
assert.equal(pass.webhookEnabled, "yes");
assert.equal(pass.webhookLiveMode, "yes");
assert.deepEqual(pass.missingWebhookEvents, []);
assert.equal(pass.signingSecretMatch, "UNKNOWN");
assert.equal(pass.errorClass, null);

const wildcard = summarizeStripeConnection({
  liveKey: true,
  accountId: EXPECTED_STRIPE_ACCOUNT_ID,
  chargesEnabled: true,
  payoutsEnabled: true,
  requirementsPresent: true,
  currentlyDueCount: 0,
  pastDueCount: 0,
  endpoints: [endpoint({ enabledEvents: ["*"] })],
});
assert.equal(wildcard.status, "PASS");
assert.deepEqual(wildcard.missingWebhookEvents, []);

const mismatch = summarizeStripeConnection({
  liveKey: true,
  accountId: "acct_otheraccount",
  chargesEnabled: true,
  payoutsEnabled: true,
  requirementsPresent: true,
  currentlyDueCount: 0,
  pastDueCount: 0,
  endpoints: [endpoint()],
});
assert.equal(mismatch.status, "FAIL");
assert.equal(mismatch.errorClass, "account_mismatch");

const requirements = summarizeStripeConnection({
  liveKey: true,
  accountId: EXPECTED_STRIPE_ACCOUNT_ID,
  chargesEnabled: true,
  payoutsEnabled: true,
  requirementsPresent: true,
  currentlyDueCount: 1,
  pastDueCount: 2,
  endpoints: [endpoint()],
});
assert.equal(requirements.status, "FAIL");
assert.equal(requirements.outstandingRequirements, 3);
assert.equal(requirements.errorClass, "requirements_outstanding");

const testMode = summarizeStripeConnection({
  liveKey: false,
  accountId: EXPECTED_STRIPE_ACCOUNT_ID,
  chargesEnabled: true,
  payoutsEnabled: true,
  requirementsPresent: true,
  currentlyDueCount: 0,
  pastDueCount: 0,
  endpoints: [endpoint()],
});
assert.equal(testMode.status, "FAIL");
assert.equal(testMode.liveMode, "no");
assert.equal(testMode.errorClass, "test_mode_key");

const missingEvent = summarizeStripeConnection({
  liveKey: true,
  accountId: EXPECTED_STRIPE_ACCOUNT_ID,
  chargesEnabled: true,
  payoutsEnabled: true,
  requirementsPresent: true,
  currentlyDueCount: 0,
  pastDueCount: 0,
  endpoints: [
    endpoint({
      enabledEvents: REQUIRED.filter((eventName) => eventName !== "invoice.paid"),
    }),
  ],
});
assert.equal(missingEvent.status, "FAIL");
assert.deepEqual(missingEvent.missingWebhookEvents, ["invoice.paid"]);
assert.equal(missingEvent.errorClass, "webhook_events_incomplete");

const trailingSlash = summarizeStripeConnection({
  liveKey: true,
  accountId: EXPECTED_STRIPE_ACCOUNT_ID,
  chargesEnabled: true,
  payoutsEnabled: true,
  requirementsPresent: true,
  currentlyDueCount: 0,
  pastDueCount: 0,
  endpoints: [endpoint({ url: `${EXPECTED_STRIPE_WEBHOOK_URL}/` })],
});
assert.equal(trailingSlash.webhookUrlMatch, "no");
assert.equal(trailingSlash.errorClass, "webhook_missing");

const prefersLiveDisabled = summarizeStripeConnection({
  liveKey: true,
  accountId: EXPECTED_STRIPE_ACCOUNT_ID,
  chargesEnabled: true,
  payoutsEnabled: true,
  requirementsPresent: true,
  currentlyDueCount: 0,
  pastDueCount: 0,
  endpoints: [
    endpoint({ livemode: false, status: "enabled" }),
    endpoint({ livemode: true, status: "disabled" }),
  ],
});
assert.equal(prefersLiveDisabled.webhookLiveMode, "yes");
assert.equal(prefersLiveDisabled.webhookEnabled, "no");
assert.equal(prefersLiveDisabled.errorClass, "webhook_disabled");

const leaked = summarizeStripeConnection({
  liveKey: true,
  accountId: EXPECTED_STRIPE_ACCOUNT_ID,
  chargesEnabled: true,
  payoutsEnabled: true,
  requirementsPresent: true,
  currentlyDueCount: 0,
  pastDueCount: 0,
  endpoints: [
    endpoint({
      url: "https://houzzatpro.com/api/stripe/webhook",
      enabledEvents: ["sk_live_secret", "whsec_secret"],
    }),
  ],
});
const encoded = JSON.stringify(leaked);
assert.equal(encoded.includes("sk_"), false);
assert.equal(encoded.includes("whsec_"), false);
assert.equal(encoded.includes("https://"), false);
assert.equal(leaked.signingSecretMatch, "UNKNOWN");

async function assertPreviewCannotCallStripe(): Promise<void> {
  const previousVercelEnv = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "preview";
  try {
    const blocked = await diagnoseStripeConnection();
    assert.equal(blocked.status, "FAIL");
    assert.equal(blocked.errorClass, "not_production");
    assert.equal(blocked.accountId, null);
    assert.equal(blocked.signingSecretMatch, "UNKNOWN");
  } finally {
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
  }
}

assertPreviewCannotCallStripe()
  .then(() => {
    console.log("stripe-connection-diagnostic selftest ok");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
