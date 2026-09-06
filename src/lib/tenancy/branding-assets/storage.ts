/**
 * Stage 6.11C.3 — R2 (production) + local filesystem (dev/test only) branding storage.
 */

import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { extractBrandingObjectKeyFromUrl } from "@/lib/tenancy/branding-assets/keys";

export type BrandingAssetPutResult = {
  objectKey: string;
  publicUrl: string;
};

export const BRANDING_STORAGE_NOT_CONFIGURED = "STORAGE_NOT_CONFIGURED" as const;

/** Fail-closed storage misconfiguration — safe client message, no env/bucket leakage. */
export class BrandingStorageNotConfiguredError extends Error {
  readonly code = BRANDING_STORAGE_NOT_CONFIGURED;
  readonly status = 503;

  constructor() {
    super("Brand asset storage is not configured.");
    this.name = "BrandingStorageNotConfiguredError";
  }
}

type R2Like = {
  put: (
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | null,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>;
  delete: (key: string | string[]) => Promise<void>;
};

type BrandingStorageTestDeps = {
  getBucket?: () => Promise<R2Like | null>;
  getPublicBase?: () => string | null;
  isProduction?: () => boolean;
};

let testDeps: BrandingStorageTestDeps | null = null;

/** Selftest-only — never call from production request paths. */
export function setBrandingStorageTestDeps(
  deps: BrandingStorageTestDeps | null,
): void {
  testDeps = deps;
}

function publicBaseUrl(): string | null {
  const raw = testDeps?.getPublicBase
    ? testDeps.getPublicBase()
    : process.env.BRANDING_ASSETS_PUBLIC_BASE_URL?.trim() || null;
  if (!raw?.trim()) return null;
  return raw.trim().replace(/\/$/, "");
}

function isProductionRuntime(): boolean {
  if (testDeps?.isProduction) return testDeps.isProduction();
  return process.env.NODE_ENV === "production";
}

async function getBrandingR2Bucket(): Promise<R2Like | null> {
  if (testDeps?.getBucket) return testDeps.getBucket();
  try {
    const { env } = await getCloudflareContext({ async: true });
    const bucket = (env as unknown as Record<string, unknown>).BRANDING_ASSETS;
    if (
      bucket &&
      typeof bucket === "object" &&
      typeof (bucket as R2Like).put === "function" &&
      typeof (bucket as R2Like).delete === "function"
    ) {
      return bucket as R2Like;
    }
  } catch {
    // Local Node / selftests — no Cloudflare context.
  }
  return null;
}

function localPublicUrl(objectKey: string): string {
  return `/uploads/branding/${objectKey}`;
}

/**
 * Persist bytes under tenant-isolated object key.
 * Production: requires BRANDING_ASSETS R2 binding + BRANDING_ASSETS_PUBLIC_BASE_URL.
 * Development/test without binding: public/uploads/branding (never on Workers prod).
 */
export async function putBrandingAssetObject(input: {
  objectKey: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<BrandingAssetPutResult> {
  const bucket = await getBrandingR2Bucket();
  if (bucket) {
    const base = publicBaseUrl();
    if (!base) {
      throw new BrandingStorageNotConfiguredError();
    }
    await bucket.put(input.objectKey, input.bytes, {
      httpMetadata: { contentType: input.contentType },
    });
    return {
      objectKey: input.objectKey,
      publicUrl: `${base}/${input.objectKey}`,
    };
  }

  // Stage 6.11C.3 — production must never write ephemeral Worker filesystem.
  if (isProductionRuntime()) {
    throw new BrandingStorageNotConfiguredError();
  }

  const abs = path.join(
    process.cwd(),
    "public",
    "uploads",
    "branding",
    ...input.objectKey.split("/"),
  );
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, input.bytes);
  return {
    objectKey: input.objectKey,
    publicUrl: localPublicUrl(input.objectKey),
  };
}

/** Best-effort delete; never throws to callers managing replace/remove. */
export async function deleteBrandingAssetObject(
  objectKey: string,
): Promise<void> {
  try {
    const bucket = await getBrandingR2Bucket();
    if (bucket) {
      await bucket.delete(objectKey);
      return;
    }
    if (isProductionRuntime()) {
      return;
    }
    const abs = path.join(
      process.cwd(),
      "public",
      "uploads",
      "branding",
      ...objectKey.split("/"),
    );
    await unlink(abs).catch(() => undefined);
  } catch {
    // best-effort
  }
}

export async function deleteBrandingAssetByPersistedUrl(input: {
  url: string | null | undefined;
  workspaceId: string;
}): Promise<void> {
  const key = extractBrandingObjectKeyFromUrl(input.url, input.workspaceId);
  if (!key) return;
  await deleteBrandingAssetObject(key);
}
