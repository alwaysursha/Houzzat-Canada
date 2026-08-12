export const STALE_BUILD_RELOAD_KEY = "houzzat:stale-build-reload";

/** Shared with the inline <head> boot script — keep in sync. */
export const NEXT_STATIC_ASSET_SOURCE =
  String.raw`\/_next\/static\/(?:chunks|css|media)\/`;

const NEXT_STATIC_ASSET = new RegExp(NEXT_STATIC_ASSET_SOURCE);

let reloadIssued = false;

export function getHouzzatBuildId(): string {
  return process.env.NEXT_PUBLIC_HOUZZAT_BUILD || "dev";
}

/**
 * Reload unless we already recovered while running this same build.
 * A leftover mark from an older build (or the legacy `"1"` flag) must not
 * block recovery after a later deploy.
 */
export function shouldReloadForBuild(
  lastMark: string | null,
  currentBuild: string,
): boolean {
  return lastMark !== currentBuild;
}

/** After a successful load of a newer build, drop the previous recovery mark. */
export function shouldClearRecoveryMark(
  lastMark: string | null,
  currentBuild: string,
): boolean {
  return Boolean(lastMark && lastMark !== currentBuild);
}

export function clearStaleBuildRecoveryIfFresh(): void {
  if (typeof window === "undefined") return;
  try {
    const last = sessionStorage.getItem(STALE_BUILD_RELOAD_KEY);
    if (shouldClearRecoveryMark(last, getHouzzatBuildId())) {
      sessionStorage.removeItem(STALE_BUILD_RELOAD_KEY);
    }
  } catch {
    // sessionStorage unavailable
  }
}

/**
 * Tiny parse-time listener. Injected into <head> so SCRIPT/LINK 404s that
 * fire before React hydrate are still caught.
 */
export function getStaleBuildBootScript(
  buildId: string = getHouzzatBuildId(),
): string {
  return `(function(){var K=${JSON.stringify(STALE_BUILD_RELOAD_KEY)};var B=${JSON.stringify(buildId)};var R=/${NEXT_STATIC_ASSET_SOURCE}/;function g(){try{return sessionStorage.getItem(K)}catch(e){return null}}function s(v){try{sessionStorage.setItem(K,v)}catch(e){}}function d(){try{sessionStorage.removeItem(K)}catch(e){}}function fresh(){var l=g();if(l&&l!==B)d()}function go(w){if(g()===B)return;s(B);console.warn("[stale-build] reloading after",String(w).slice(0,160));location.reload()}function u(t){if(!t||!t.tagName)return"";if(t.tagName==="SCRIPT"&&t.src&&R.test(t.src))return t.src;if(t.tagName==="LINK"&&t.href&&R.test(t.href))return t.href;return""}window.addEventListener("error",function(e){var x=u(e.target);if(!x)return;go(x)},true);window.addEventListener("pageshow",function(e){if(!e.persisted)fresh()});window.addEventListener("load",function(){try{var es=performance.getEntriesByType("resource");for(var i=0;i<es.length;i++){var n=es[i].name||"";if(!R.test(n))continue;if(es[i].responseStatus===404||es[i].responseStatus===410){go(n);return}}}catch(e){}});fresh()})();`;
}

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

/** One hard reload per current build. Survives the reload so a still-broken page cannot loop. */
export function reloadOnceForStaleBuild(reason: string): boolean {
  if (typeof window === "undefined") return false;
  if (reloadIssued) return false;
  const build = getHouzzatBuildId();
  try {
    const last = sessionStorage.getItem(STALE_BUILD_RELOAD_KEY);
    if (!shouldReloadForBuild(last, build)) return false;
    sessionStorage.setItem(STALE_BUILD_RELOAD_KEY, build);
  } catch {
    // sessionStorage unavailable — in-memory flag still stops same-tick doubles.
  }
  reloadIssued = true;
  console.warn("[stale-build] reloading after", reason.slice(0, 160));
  window.location.reload();
  return true;
}
