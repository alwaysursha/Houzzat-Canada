const RELOAD_KEY = "houzzat:stale-build-reload";

const NEXT_STATIC_ASSET = /\/_next\/static\/(?:chunks|css|media)\//;

let reloadIssued = false;

/**
 * Next aborts in-flight RSC/fetch on rapid navigation. Never reload for that.
 */
export function isNavigationAbort(message: string, error?: unknown): boolean {
  if (error instanceof DOMException || error instanceof Error) {
    if (error.name === "AbortError") return true;
  }
  return /AbortError|\baborted\b|AbortSignal|The user aborted|The operation was aborted|signal is aborted|Request aborted|Fetch aborted/i.test(
    message,
  );
}

function combinedText(message: string, error?: unknown, assetUrl?: string) {
  const parts = [message, assetUrl ?? ""];
  if (error instanceof Error) {
    parts.push(error.name, error.message, error.stack ?? "");
  } else if (error != null) {
    parts.push(String(error));
  }
  return parts.join(" ");
}

function isApiOnlyFailure(text: string) {
  return /\/api\//i.test(text) && !NEXT_STATIC_ASSET.test(text);
}

/** Script/link/css/font URL from a resource or script error event. */
export function staleAssetUrlFromEvent(event: ErrorEvent): string | undefined {
  const target = event.target;
  if (target instanceof HTMLScriptElement && NEXT_STATIC_ASSET.test(target.src)) {
    return target.src;
  }
  if (target instanceof HTMLLinkElement && NEXT_STATIC_ASSET.test(target.href)) {
    return target.href;
  }
  if (typeof event.filename === "string" && NEXT_STATIC_ASSET.test(event.filename)) {
    return event.filename;
  }
  return undefined;
}

/**
 * True only for missing Next hashed assets from a previous deploy.
 * Ordinary API 4xx/5xx and abort/cancel races must not match.
 */
export function isStaleNextAssetFailure(
  message: string,
  error?: unknown,
  assetUrl?: string,
): boolean {
  if (isNavigationAbort(message, error)) return false;
  const text = combinedText(message, error, assetUrl);
  if (isApiOnlyFailure(text)) return false;
  if (assetUrl && NEXT_STATIC_ASSET.test(assetUrl)) return true;
  if (NEXT_STATIC_ASSET.test(text)) return true;
  return /ChunkLoadError|CSS_CHUNK_LOAD_FAILED|Loading (?:CSS )?chunk\b/i.test(
    text,
  );
}

/** One hard reload per tab session. Survives the reload so a still-broken page cannot loop. */
export function reloadOnceForStaleBuild(reason: string): boolean {
  if (typeof window === "undefined") return false;
  if (reloadIssued) return false;
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === "1") return false;
    sessionStorage.setItem(RELOAD_KEY, "1");
  } catch {
    // sessionStorage unavailable — in-memory flag still stops same-tick doubles.
  }
  reloadIssued = true;
  console.warn("[stale-build] reloading after", reason.slice(0, 160));
  window.location.reload();
  return true;
}
