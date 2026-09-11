/**
 * Dual-runtime Cloudflare context access.
 *
 * OpenNext `getCloudflareContext({ async: true })` on Node (`NEXT_RUNTIME=nodejs`)
 * dynamically imports wrangler and starts a platform proxy. That is required for
 * local `next dev`, but must never run on Vercel (VERCEL=1).
 *
 * Cloudflare Workers still get live bindings via the Worker entrypoint global.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

export function shouldSkipOpenNextCloudflareContext(): boolean {
  return Boolean(process.env.VERCEL);
}

export function tryGetCloudflareEnvSync(): Record<string, unknown> | null {
  if (shouldSkipOpenNextCloudflareContext()) return null;
  try {
    const { env } = getCloudflareContext();
    return env as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function tryGetCloudflareEnvAsync(): Promise<Record<
  string,
  unknown
> | null> {
  if (shouldSkipOpenNextCloudflareContext()) return null;
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env as unknown as Record<string, unknown>;
  } catch {
    return tryGetCloudflareEnvSync();
  }
}

export function tryGetCloudflareWaitUntil():
  | ((work: Promise<unknown>) => void)
  | null {
  if (shouldSkipOpenNextCloudflareContext()) return null;
  try {
    const { ctx } = getCloudflareContext();
    if (ctx && typeof ctx.waitUntil === "function") {
      return (work) => ctx.waitUntil(work);
    }
  } catch {
    return null;
  }
  return null;
}
