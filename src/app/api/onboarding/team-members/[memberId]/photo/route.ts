/**
 * Stage 6.11E.5 — host-bound OWNER Team member photo upload / remove.
 */

import { OwnerActivationError } from "@/lib/platform/activation";
import { platformError, platformOk } from "@/lib/platform/api/response";
import {
  removeOwnerTeamMemberPhoto,
  uploadOwnerTeamMemberPhoto,
} from "@/lib/tenancy/team-roster";
import {
  BrandingStorageNotConfiguredError,
  BRANDING_STORAGE_NOT_CONFIGURED,
} from "@/lib/tenancy/branding-assets/storage";

export const runtime = "nodejs";

function clientWorkspaceIdFrom(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function mapError(error: unknown) {
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

type RouteContext = { params: Promise<{ memberId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { memberId } = await context.params;
    const form = await request.formData();
    const file = form.get("file");
    const clientWorkspaceIdRaw = form.get("workspaceId");
    const clientWorkspaceId = clientWorkspaceIdFrom(clientWorkspaceIdRaw);

    if (!(file instanceof File)) {
      return platformError(400, "FILE_REQUIRED", "File required.");
    }

    const member = await uploadOwnerTeamMemberPhoto({
      request,
      memberId,
      file,
      clientWorkspaceId,
    });
    return platformOk({ member });
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) return mapped;
    return platformError(
      500,
      "INTERNAL_ERROR",
      "Unable to upload Team member photo",
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { memberId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const url = new URL(request.url);
    const clientWorkspaceId =
      clientWorkspaceIdFrom(body.workspaceId) ??
      clientWorkspaceIdFrom(url.searchParams.get("workspaceId"));

    const member = await removeOwnerTeamMemberPhoto({
      request,
      memberId,
      clientWorkspaceId,
    });
    return platformOk({ member });
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) return mapped;
    return platformError(
      500,
      "INTERNAL_ERROR",
      "Unable to remove Team member photo",
    );
  }
}
