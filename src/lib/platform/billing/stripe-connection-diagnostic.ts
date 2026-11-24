/**
 * Temporary production-only Stripe connection check.
 * Read-only: accounts.retrieve and webhookEndpoints.list.
 * Remove this module after the one approved verification.
 */

import Stripe from "stripe";
import { getStripeClient } from "@/lib/platform/billing/stripe-client";
import {
  StripeConfigError,
  readStripeSecretKey,
} from "@/lib/platform/billing/stripe-env";

const STRIPE_CONNECTION_DIAGNOSTIC_HOSTS = new Set([
  "houzzatpro.com",
  "www.houzzatpro.com",
]);
export const EXPECTED_STRIPE_ACCOUNT_ID = "acct_1UBmnTPvAzmlpNB4";
export const EXPECTED_STRIPE_WEBHOOK_URL =
  "https://houzzatpro.com/api/stripe/webhook";

export const REQUIRED_STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "charge.refunded",
  "credit_note.created",
] as const;

const OPERATOR_WINDOW_MS = 60 * 60_000;
const OPERATOR_MAX = 4;
const IP_WINDOW_MS = 60 * 60_000;
const IP_MAX = 8;
const MAX_WEBHOOK_PAGES = 5;

type YesNo = "yes" | "no";
type ObservedYesNo = YesNo | "unknown";

export type StripeConnectionErrorClass =
  | "not_production"
  | "configuration_missing"
  | "authentication_failed"
  | "permission_denied"
  | "stripe_rate_limited"
  | "stripe_unavailable"
  | "stripe_request_rejected"
  | "response_rejected"
  | "test_mode_key"
  | "account_mismatch"
  | "capabilities_disabled"
  | "requirements_outstanding"
  | "requirements_unreadable"
  | "webhook_missing"
  | "webhook_disabled"
  | "webhook_test_mode"
  | "webhook_events_incomplete";

export type StripeConnectionDiagnostic = {
  status: "PASS" | "FAIL";
  accountId: string | null;
  chargesEnabled: ObservedYesNo;
  payoutsEnabled: ObservedYesNo;
  outstandingRequirements: number | null;
  liveMode: ObservedYesNo;
  webhookDestinationFound: ObservedYesNo;
  webhookUrlMatch: ObservedYesNo;
  webhookEnabled: ObservedYesNo;
  webhookLiveMode: ObservedYesNo;
  missingWebhookEvents: string[];
  signingSecretMatch: "UNKNOWN";
  errorClass: StripeConnectionErrorClass | null;
};

export type StripeWebhookEndpointSnapshot = {
  url: string;
  status: string;
  livemode: boolean;
  enabledEvents: string[];
};

type RateBucket = { count: number; resetAt: number };

const rateByOperator = new Map<string, RateBucket>();
const rateByIp = new Map<string, RateBucket>();

export class StripeConnectionDiagnosticGuardError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(status === 429 ? "Too many requests" : "Forbidden");
    this.name = "StripeConnectionDiagnosticGuardError";
    this.status = status;
    this.code = code;
  }
}

function prune(map: Map<string, RateBucket>, now: number) {
  if (map.size < 400) return;
  for (const [key, bucket] of map) {
    if (bucket.resetAt <= now) map.delete(key);
  }
}

function allow(
  map: Map<string, RateBucket>,
  key: string,
  max: number,
  windowMs: number,
  now: number,
): boolean {
  prune(map, now);
  const bucket = map.get(key);
  if (!bucket || bucket.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}

export function clearStripeConnectionDiagnosticRateLimitsForTests(): void {
  rateByOperator.clear();
  rateByIp.clear();
}

export function allowStripeConnectionDiagnostic(input: {
  operatorId: string;
  clientIp: string;
  now?: number;
}): boolean {
  const now = input.now ?? Date.now();
  const operatorOk = allow(
    rateByOperator,
    input.operatorId || "unknown",
    OPERATOR_MAX,
    OPERATOR_WINDOW_MS,
    now,
  );
  const ipOk = allow(
    rateByIp,
    input.clientIp || "unknown",
    IP_MAX,
    IP_WINDOW_MS,
    now,
  );
  return operatorOk && ipOk;
}

function publicHost(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-host");
  const raw = (forwarded ?? request.headers.get("host") ?? "").split(",")[0] ?? "";
  return raw.trim().toLowerCase().split(":")[0] ?? "";
}

export function assertStripeConnectionDiagnosticOrigin(request: Request): void {
  const origin = request.headers.get("origin")?.trim() ?? "";
  const host = publicHost(request);
  if (!STRIPE_CONNECTION_DIAGNOSTIC_HOSTS.has(host) || origin !== `https://${host}`) {
    throw new StripeConnectionDiagnosticGuardError(403, "ORIGIN_REJECTED");
  }
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase() ?? "";
  if (fetchSite && fetchSite !== "same-origin") {
    throw new StripeConnectionDiagnosticGuardError(403, "ORIGIN_REJECTED");
  }
}

function yesNo(value: boolean): YesNo {
  return value ? "yes" : "no";
}

function safeAccountId(accountId: string): string | null {
  if (!/^acct_[A-Za-z0-9]+$/.test(accountId) || accountId.length > 64) return null;
  return accountId;
}

function missingWebhookEvents(enabledEvents: string[]): string[] {
  if (enabledEvents.includes("*")) return [];
  const enabled = new Set(enabledEvents);
  return REQUIRED_STRIPE_WEBHOOK_EVENTS.filter((eventName) => !enabled.has(eventName));
}

function selectWebhookEndpoint(
  endpoints: StripeWebhookEndpointSnapshot[],
): StripeWebhookEndpointSnapshot | null {
  const matches = endpoints.filter(
    (endpoint) => endpoint.url === EXPECTED_STRIPE_WEBHOOK_URL,
  );
  return (
    matches.find((endpoint) => endpoint.livemode && endpoint.status === "enabled") ??
    matches.find((endpoint) => endpoint.livemode) ??
    matches.find((endpoint) => endpoint.status === "enabled") ??
    matches[0] ??
    null
  );
}

function blankDiagnostic(
  errorClass: StripeConnectionErrorClass,
  liveMode: ObservedYesNo = "unknown",
): StripeConnectionDiagnostic {
  return {
    status: "FAIL",
    accountId: null,
    chargesEnabled: "unknown",
    payoutsEnabled: "unknown",
    outstandingRequirements: null,
    liveMode,
    webhookDestinationFound: "unknown",
    webhookUrlMatch: "unknown",
    webhookEnabled: "unknown",
    webhookLiveMode: "unknown",
    missingWebhookEvents: [],
    signingSecretMatch: "UNKNOWN",
    errorClass,
  };
}

function firstFailure(input: {
  liveMode: YesNo;
  accountId: string | null;
  chargesEnabled: YesNo;
  payoutsEnabled: YesNo;
  outstandingRequirements: number | null;
  webhook: StripeWebhookEndpointSnapshot | null;
  missingEvents: string[];
}): StripeConnectionErrorClass | null {
  if (input.liveMode !== "yes") return "test_mode_key";
  if (input.accountId !== EXPECTED_STRIPE_ACCOUNT_ID) return "account_mismatch";
  if (input.chargesEnabled !== "yes" || input.payoutsEnabled !== "yes") {
    return "capabilities_disabled";
  }
  if (input.outstandingRequirements === null) return "requirements_unreadable";
  if (input.outstandingRequirements > 0) return "requirements_outstanding";
  if (!input.webhook) return "webhook_missing";
  if (!input.webhook.livemode) return "webhook_test_mode";
  if (input.webhook.status !== "enabled") return "webhook_disabled";
  if (input.missingEvents.length > 0) return "webhook_events_incomplete";
  return null;
}

export function summarizeStripeConnection(input: {
  liveKey: boolean;
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsPresent: boolean;
  currentlyDueCount: number;
  pastDueCount: number;
  endpoints: StripeWebhookEndpointSnapshot[] | null;
}): StripeConnectionDiagnostic {
  const accountId = safeAccountId(input.accountId);
  const liveMode = yesNo(input.liveKey);
  const chargesEnabled = yesNo(input.chargesEnabled);
  const payoutsEnabled = yesNo(input.payoutsEnabled);
  const outstandingRequirements = input.requirementsPresent
    ? input.currentlyDueCount + input.pastDueCount
    : null;
  const webhook =
    input.endpoints === null ? null : selectWebhookEndpoint(input.endpoints);
  const missingEvents = webhook ? missingWebhookEvents(webhook.enabledEvents) : [];
  const webhookKnown = input.endpoints !== null;
  const failure = firstFailure({
    liveMode,
    accountId,
    chargesEnabled,
    payoutsEnabled,
    outstandingRequirements,
    webhook,
    missingEvents,
  });
  const result: StripeConnectionDiagnostic = {
    status: failure ? "FAIL" : "PASS",
    accountId,
    chargesEnabled,
    payoutsEnabled,
    outstandingRequirements,
    liveMode,
    webhookDestinationFound: webhookKnown ? yesNo(webhook !== null) : "unknown",
    webhookUrlMatch: webhookKnown ? yesNo(webhook !== null) : "unknown",
    webhookEnabled: webhook ? yesNo(webhook.status === "enabled") : webhookKnown ? "no" : "unknown",
    webhookLiveMode: webhook ? yesNo(webhook.livemode) : webhookKnown ? "no" : "unknown",
    missingWebhookEvents: missingEvents,
    signingSecretMatch: "UNKNOWN",
    errorClass: failure,
  };
  return assertSanitized(result);
}

function assertSanitized(
  result: StripeConnectionDiagnostic,
): StripeConnectionDiagnostic {
  const encoded = JSON.stringify(result);
  if (/sk_|rk_|whsec_|bearer\s/i.test(encoded)) {
    return blankDiagnostic("response_rejected");
  }
  return result;
}

function classifyStripeFailure(error: unknown): StripeConnectionErrorClass {
  if (error instanceof Stripe.errors.StripeAuthenticationError) {
    return "authentication_failed";
  }
  if (error instanceof Stripe.errors.StripePermissionError) {
    return "permission_denied";
  }
  if (error instanceof Stripe.errors.StripeRateLimitError) {
    return "stripe_rate_limited";
  }
  if (error instanceof Stripe.errors.StripeConnectionError) {
    return "stripe_unavailable";
  }
  if (error instanceof Stripe.errors.StripeAPIError) {
    return "stripe_unavailable";
  }
  if (error instanceof Stripe.errors.StripeInvalidRequestError) {
    return "stripe_request_rejected";
  }
  return "stripe_unavailable";
}

function snapshotWebhookEndpoint(
  endpoint: Stripe.WebhookEndpoint,
): StripeWebhookEndpointSnapshot {
  return {
    url: endpoint.url,
    status: endpoint.status,
    livemode: endpoint.livemode === true,
    enabledEvents: endpoint.enabled_events.filter(
      (eventName): eventName is string => typeof eventName === "string",
    ),
  };
}

async function listWebhookEndpoints(
  stripe: Stripe,
): Promise<StripeWebhookEndpointSnapshot[]> {
  const snapshots: StripeWebhookEndpointSnapshot[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < MAX_WEBHOOK_PAGES; page += 1) {
    const listed = await stripe.webhookEndpoints.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const endpoint of listed.data) {
      snapshots.push(snapshotWebhookEndpoint(endpoint));
    }
    if (!listed.has_more || listed.data.length === 0) break;
    const cursor = listed.data[listed.data.length - 1]?.id;
    if (!cursor) break;
    startingAfter = cursor;
  }
  return snapshots;
}

export async function diagnoseStripeConnection(): Promise<StripeConnectionDiagnostic> {
  if (process.env.VERCEL_ENV !== "production") {
    return blankDiagnostic("not_production");
  }

  let liveKey = false;
  try {
    const key = readStripeSecretKey();
    liveKey = key.startsWith("sk_live_");
  } catch (error) {
    if (error instanceof StripeConfigError) {
      return blankDiagnostic("configuration_missing");
    }
    return blankDiagnostic("configuration_missing");
  }

  try {
    const stripe = getStripeClient();
    const account = await stripe.accounts.retrieve();
    let endpoints: StripeWebhookEndpointSnapshot[] | null = null;
    try {
      endpoints = await listWebhookEndpoints(stripe);
    } catch (error) {
      const partial = summarizeStripeConnection({
        liveKey,
        accountId: account.id,
        chargesEnabled: account.charges_enabled === true,
        payoutsEnabled: account.payouts_enabled === true,
        requirementsPresent: account.requirements != null,
        currentlyDueCount: account.requirements?.currently_due?.length ?? 0,
        pastDueCount: account.requirements?.past_due?.length ?? 0,
        endpoints: null,
      });
      return assertSanitized({
        ...partial,
        status: "FAIL",
        errorClass: classifyStripeFailure(error),
      });
    }
    return summarizeStripeConnection({
      liveKey,
      accountId: account.id,
      chargesEnabled: account.charges_enabled === true,
      payoutsEnabled: account.payouts_enabled === true,
      requirementsPresent: account.requirements != null,
      currentlyDueCount: account.requirements?.currently_due?.length ?? 0,
      pastDueCount: account.requirements?.past_due?.length ?? 0,
      endpoints,
    });
  } catch (error) {
    return blankDiagnostic(classifyStripeFailure(error), yesNo(liveKey));
  }
}
