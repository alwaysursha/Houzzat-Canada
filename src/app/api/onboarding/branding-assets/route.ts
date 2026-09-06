/**
 * Stage 6.11C.1 — host-bound OWNER branding asset upload / remove.
 */

import {
  OwnerActivationError,
} from "@/lib/platform/activation";
import { platformError, platformOk } from "@/lib/platform/api/response";
import {
  removeWorkspaceBrandingAsset,
  uploadWorkspaceBrandingAsset,
} from "@/lib/tenancy/branding-assets/manage";
import {
  BrandingStorageNotConfiguredError,
  BRANDING_STORAGE_NOT_CONFIGURED,
} from "@/lib/tenancy/branding-assets/storage";

export const runtime = "nodejs";

function mapBrandingAssetError(error: unknown) {
  if (error instanceof OwnerActivationError) {
    return platformError(error.status, error.code, error.message);
  }
  if (error instanceof BrandingStorageNotConfiguredError) {
    return platformError(
      error.status,
      BRANDING_STORAGE_NOT_CONFIGURED,
      error.message,
    );
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const kind = form.get("kind");
    const file = form.get("file");
    const clientWorkspaceIdRaw = form.get("workspaceId");
    const clientWorkspaceId =
      typeof clientWorkspaceIdRaw === "string" ? clientWorkspaceIdRaw : null;

    if (!(file instanceof File)) {
      return platformError(400, "FILE_REQUIRED", "File required.");
    }

    const assets = await uploadWorkspaceBrandingAsset({
      request,
      kind,
      file,
      clientWorkspaceId,
    });
    return platformOk({ assets });
  } catch (error) {
    const mapped = mapBrandingAssetError(error);
    if (mapped) return mapped;
    return platformError(
      500,
      "INTERNAL_ERROR",
      "Unable to upload branding asset",
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const kind = body.kind;
    const clientWorkspaceId =
      typeof body.workspaceId === "string" ? body.workspaceId : null;

    const assets = await removeWorkspaceBrandingAsset({
      request,
      kind,
      clientWorkspaceId,
    });
    return platformOk({ assets });
  } catch (error) {
    const mapped = mapBrandingAssetError(error);
    if (mapped) return mapped;
    return platformError(
      500,
      "INTERNAL_ERROR",
      "Unable to remove branding asset",
    );
  }
}
