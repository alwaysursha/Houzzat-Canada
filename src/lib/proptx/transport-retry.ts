/**
 * Shared PropTx retry, backoff, and process-wide throttle.
 * Pure helpers plus in-process state. No PropTx calls live here.
 */

export const PROPTX_MAX_ATTEMPTS = 3;
export const PROPTX_BASE_DELAY_MS = 1_000;
export const PROPTX_MAX_DELAY_MS = 30_000;
export const PROPTX_MAX_RETRY_AFTER_MS = 120_000;
export const PROPTX_DEFAULT_TIMEOUT_MS = 25_000;
export const PROPTX_MAX_IN_FLIGHT = 4;
export const PROPTX_RESUME_JITTER_MS = 500;

const RETRYABLE_HTTP = new Set([429, 500, 502, 503, 504]);

export type PropTxTransportStats = {
  requests: number;
  retries: number;
  rateLimited: number;
  serverErrors: number;
  timeouts: number;
  networkErrors: number;
  retryAfterWaits: number;
  exhaustedRetries: number;
  backoffMs: number;
};

export type PropTxTransportHooks = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  random: () => number;
};

function emptyStats(): PropTxTransportStats {
  return {
    requests: 0,
    retries: 0,
    rateLimited: 0,
    serverErrors: 0,
    timeouts: 0,
    networkErrors: 0,
    retryAfterWaits: 0,
    exhaustedRetries: 0,
    backoffMs: 0,
  };
}

const defaultHooks = (): PropTxTransportHooks => ({
  fetch: globalThis.fetch.bind(globalThis),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  random: () => Math.random(),
});

let hooks = defaultHooks();
let stats = emptyStats();
let throttleUntil = 0;
let inFlight = 0;
const slotWaiters: Array<() => void> = [];

export function isRetryableHttpStatus(status: number): boolean {
  return RETRYABLE_HTTP.has(status);
}

/**
 * Retry-After as delta-seconds or HTTP-date.
 * Returns milliseconds to wait, capped at 120s. Null when the header is absent
 * or not a delay we can honor (caller falls back to computed backoff).
 */
export function parseRetryAfterMs(
  header: string | null | undefined,
  nowMs: number,
): number | null {
  if (header == null) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return Math.min(Math.round(seconds * 1000), PROPTX_MAX_RETRY_AFTER_MS);
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  const wait = parsed - nowMs;
  if (wait <= 0) return 0;
  return Math.min(wait, PROPTX_MAX_RETRY_AFTER_MS);
}

/** Full jitter: a random delay in [0, min(cap, base * 2^(attempt-1))]. */
export function backoffDelayMs(attempt: number, random: number): number {
  const exponent = Math.max(0, attempt - 1);
  const ceiling = Math.min(
    PROPTX_MAX_DELAY_MS,
    PROPTX_BASE_DELAY_MS * 2 ** exponent,
  );
  const unit = Math.max(0, Math.min(1, random));
  return Math.floor(unit * ceiling);
}

export function resumeJitterMs(random: number): number {
  const unit = Math.max(0, Math.min(1, random));
  return Math.floor(unit * PROPTX_RESUME_JITTER_MS);
}

export function isRetryableNetworkError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String(err.name) : "";
  if (name === "AbortError" || name === "TimeoutError") return false;
  if (err instanceof TypeError) return true;
  const code = "code" in err ? String(err.code) : "";
  return (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "ETIMEDOUT" ||
    code === "EPIPE" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_SOCKET" ||
    code === "UND_ERR_HEADERS_TIMEOUT" ||
    code === "UND_ERR_BODY_TIMEOUT"
  );
}

export function readPropTxTransportStats(): PropTxTransportStats {
  return { ...stats };
}

export function resetPropTxTransportStats(): void {
  stats = emptyStats();
}

export function notePropTxRequest(): void {
  stats.requests += 1;
}

export function notePropTxHttpStatus(status: number): void {
  if (status === 429) stats.rateLimited += 1;
  else if (status >= 500 && status <= 599) stats.serverErrors += 1;
}

export function notePropTxTimeout(): void {
  stats.timeouts += 1;
}

export function notePropTxNetwork(): void {
  stats.networkErrors += 1;
}

export function notePropTxRetry(delayMs: number, usedRetryAfter: boolean): void {
  stats.retries += 1;
  stats.backoffMs += Math.max(0, delayMs);
  if (usedRetryAfter) stats.retryAfterWaits += 1;
}

export function notePropTxThrottleWait(delayMs: number): void {
  stats.backoffMs += Math.max(0, delayMs);
}

export function notePropTxExhausted(): void {
  stats.exhaustedRetries += 1;
}

export function propTxInFlight(): number {
  return inFlight;
}

export function armPropTxThrottle(delayMs: number): void {
  const until = hooks.now() + Math.max(0, delayMs);
  if (until > throttleUntil) throttleUntil = until;
}

export function propTxThrottleUntil(): number {
  return throttleUntil;
}

export async function waitForPropTxThrottle(): Promise<void> {
  for (;;) {
    const wait = throttleUntil - hooks.now();
    if (wait <= 0) return;
    const delay = wait + resumeJitterMs(hooks.random());
    notePropTxThrottleWait(delay);
    await hooks.sleep(delay);
  }
}

export async function acquirePropTxSlot(): Promise<void> {
  if (inFlight < PROPTX_MAX_IN_FLIGHT) {
    inFlight += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    slotWaiters.push(resolve);
  });
}

export function releasePropTxSlot(): void {
  const next = slotWaiters.shift();
  if (next) {
    next();
    return;
  }
  inFlight = Math.max(0, inFlight - 1);
}

export function propTxTransportHooks(): PropTxTransportHooks {
  return hooks;
}

export function configurePropTxTransportForTests(
  overrides: Partial<PropTxTransportHooks>,
): void {
  hooks = { ...hooks, ...overrides };
}

export function resetPropTxTransportForTests(): void {
  hooks = defaultHooks();
  stats = emptyStats();
  throttleUntil = 0;
  inFlight = 0;
  slotWaiters.splice(0, slotWaiters.length);
}
