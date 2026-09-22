import { getPropTxSyncConfig, type PropTxConfig } from "@/lib/proptx/config";
import {
  acquirePropTxSlot,
  armPropTxThrottle,
  backoffDelayMs,
  isRetryableHttpStatus,
  isRetryableNetworkError,
  notePropTxExhausted,
  notePropTxHttpStatus,
  notePropTxNetwork,
  notePropTxRequest,
  notePropTxRetry,
  notePropTxTimeout,
  parseRetryAfterMs,
  PROPTX_DEFAULT_TIMEOUT_MS,
  PROPTX_MAX_ATTEMPTS,
  propTxThrottleUntil,
  propTxTransportHooks,
  releasePropTxSlot,
  waitForPropTxThrottle,
} from "@/lib/proptx/transport-retry";

export class PropTxError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "PropTxError";
    this.status = status;
    this.body = body;
  }
}

export class PropTxTimeoutError extends Error {
  readonly status = 0;

  constructor() {
    super("PropTx request timed out");
    this.name = "TimeoutError";
  }
}

export type PropTxFetchOptions = {
  /** Aborts the underlying request. Default is 25 seconds. */
  timeoutMs?: number;
  /**
   * When false, a retryable failure is thrown after the first attempt.
   * Default is true.
   */
  retry?: boolean;
  /** Caller cancellation. Aborted requests are not retried. */
  signal?: AbortSignal;
};

function authHeaders(config: PropTxConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.bearerToken}`,
    [config.tokenIdHeader]: config.tokenId,
    Accept: "application/json",
  };
}

function resolveUrl(config: PropTxConfig, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${config.endpointUrl}${path}`;
}

function callerAborted(signal: AbortSignal | undefined): boolean {
  return Boolean(signal?.aborted);
}

function throwCallerAbort(): never {
  const error = new Error("PropTx request aborted");
  error.name = "AbortError";
  throw error;
}

async function sleepOrAbort(
  ms: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (callerAborted(signal)) throwCallerAbort();
  if (ms <= 0) return;
  if (!signal) {
    await propTxTransportHooks().sleep(ms);
    return;
  }
  let onAbort: (() => void) | undefined;
  try {
    await Promise.race([
      propTxTransportHooks().sleep(ms),
      new Promise<void>((_, reject) => {
        onAbort = () => {
          const error = new Error("PropTx request aborted");
          error.name = "AbortError";
          reject(error);
        };
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } catch (err) {
    if (callerAborted(signal) || (err instanceof Error && err.name === "AbortError")) {
      throwCallerAbort();
    }
    throw err;
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

async function takeRequestSlot(signal: AbortSignal | undefined): Promise<void> {
  for (;;) {
    if (callerAborted(signal)) throwCallerAbort();
    await waitForPropTxThrottle();
    if (callerAborted(signal)) throwCallerAbort();
    await acquirePropTxSlot();
    if (propTxThrottleUntil() <= propTxTransportHooks().now()) return;
    releasePropTxSlot();
  }
}

export async function proptxFetch(
  pathOrUrl: string,
  init: RequestInit = {},
  config: PropTxConfig | null = getPropTxSyncConfig(),
  options?: PropTxFetchOptions,
): Promise<Response> {
  if (!config) {
    throw new PropTxError(
      "PropTx credentials not configured (PROPTX_ENDPOINT_URL + IDX Token ID / bearer).",
      0,
      "",
    );
  }

  const headers = new Headers(init.headers);
  const auth = authHeaders(config);
  for (const [key, value] of Object.entries(auth)) {
    if (!headers.has(key)) headers.set(key, value as string);
  }

  const timeoutMs = options?.timeoutMs ?? PROPTX_DEFAULT_TIMEOUT_MS;
  const maxAttempts = options?.retry === false ? 1 : PROPTX_MAX_ATTEMPTS;
  const callerSignal = options?.signal ?? init.signal ?? undefined;
  const url = resolveUrl(config, pathOrUrl);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (callerAborted(callerSignal)) throwCallerAbort();
    await takeRequestSlot(callerSignal);

    const timeoutController = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, timeoutMs);
    const onCallerAbort = () => timeoutController.abort();
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
    let held = true;

    const release = () => {
      if (!held) return;
      held = false;
      releasePropTxSlot();
    };

    try {
      const signal = callerSignal
        ? AbortSignal.any([callerSignal, timeoutController.signal])
        : timeoutController.signal;
      let response: Response;
      try {
        notePropTxRequest();
        response = await propTxTransportHooks().fetch(url, {
          ...init,
          headers,
          signal,
        });
      } catch (err) {
        release();
        if (callerAborted(callerSignal)) throwCallerAbort();
        const timedOutNow =
          timedOut ||
          (err instanceof Error && err.name === "TimeoutError");
        if (timedOutNow) notePropTxTimeout();
        else if (isRetryableNetworkError(err) || err instanceof TypeError) {
          notePropTxNetwork();
        } else if (!timedOutNow) {
          throw err;
        }
        const retryable = timedOutNow || isRetryableNetworkError(err) || err instanceof TypeError;
        if (!retryable || attempt >= maxAttempts) {
          if (retryable) notePropTxExhausted();
          if (timedOutNow) throw new PropTxTimeoutError();
          throw new PropTxError(
            `PropTx network error for ${pathOrUrl}`,
            0,
            "",
          );
        }
        const delay = backoffDelayMs(attempt, propTxTransportHooks().random());
        notePropTxRetry(delay, false);
        console.warn(
          `[proptx] retry ${attempt + 1}/${maxAttempts} after ${timedOutNow ? "timeout" : "network"} (${delay}ms)`,
        );
        await sleepOrAbort(delay, callerSignal);
        continue;
      }

      if (response.ok) return response;

      const status = response.status;
      const retryAfterHeader = response.headers.get("retry-after");
      const body = await response.text().catch(() => "");
      release();
      notePropTxHttpStatus(status);
      const retryable = isRetryableHttpStatus(status);
      if (!retryable || attempt >= maxAttempts) {
        if (retryable) notePropTxExhausted();
        throw new PropTxError(
          `PropTx ${status} for ${pathOrUrl}`,
          status,
          body.slice(0, 2000),
        );
      }

      const parsedRetryAfter =
        status === 429
          ? parseRetryAfterMs(retryAfterHeader, propTxTransportHooks().now())
          : null;
      const delay =
        parsedRetryAfter != null
          ? parsedRetryAfter
          : backoffDelayMs(attempt, propTxTransportHooks().random());
      if (status === 429) armPropTxThrottle(delay);
      notePropTxRetry(delay, parsedRetryAfter != null);
      console.warn(
        `[proptx] retry ${attempt + 1}/${maxAttempts} after ${status} (${delay}ms)`,
      );
      await sleepOrAbort(delay, callerSignal);
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
      release();
    }
  }

  throw new PropTxError(`PropTx failed for ${pathOrUrl}`, 0, "");
}

export type ODataCollection<T> = {
  value?: T[];
  "@odata.nextLink"?: string;
  "@odata.count"?: number;
};

export type PropTxPageOptions = {
  maxPages?: number;
  config?: PropTxConfig | null;
  timeoutMs?: number;
  retry?: boolean;
  signal?: AbortSignal;
};

/**
 * Walk OData pages. `path` is relative (e.g. `Property?$top=100`) or absolute nextLink.
 * A failed page throws. It is never yielded as an empty collection.
 */
export async function* proptxPages<T>(
  path: string,
  options?: PropTxPageOptions,
): AsyncGenerator<T[], void, unknown> {
  const config = options?.config ?? getPropTxSyncConfig();
  const maxPages = options?.maxPages ?? 50;
  let next: string | null = path;
  let pages = 0;

  while (next && pages < maxPages) {
    const res = await proptxFetch(next, {}, config, {
      timeoutMs: options?.timeoutMs,
      retry: options?.retry,
      signal: options?.signal,
    });
    let data: ODataCollection<T>;
    try {
      data = (await res.json()) as ODataCollection<T>;
    } catch (err) {
      throw new PropTxError(
        `PropTx invalid JSON for ${next}`,
        0,
        err instanceof Error ? err.message : "",
      );
    }
    const rows = data.value ?? [];
    yield rows;
    next = data["@odata.nextLink"] ?? null;
    pages += 1;
  }
}

export async function proptxJson<T>(
  path: string,
  config: PropTxConfig | null = getPropTxSyncConfig(),
  options?: PropTxFetchOptions,
): Promise<T> {
  const res = await proptxFetch(path, {}, config, options);
  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new PropTxError(
      `PropTx invalid JSON for ${path}`,
      0,
      err instanceof Error ? err.message : "",
    );
  }
}
