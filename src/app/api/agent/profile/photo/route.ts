import { NextResponse } from "next/server";
import {
  requireAgentContextFromRequest,
  type AgentOrgContext,
} from "@/lib/agent";
import { loadWorkspaceAgentProfile } from "@/lib/agent/admin-managed-profile";
import { OwnerActivationError } from "@/lib/platform/activation/errors";
import {
  canMutateAgentUserProfilePhoto,
  removeAgentUserProfilePhoto,
  uploadAgentUserProfilePhoto,
} from "@/lib/tenancy/branding-assets/agent-user-profile-photo";
import {
  BrandingStorageNotConfiguredError,
  BRANDING_STORAGE_NOT_CONFIGURED,
} from "@/lib/tenancy/branding-assets/storage";

export const runtime = "nodejs";

async function authorizeProfilePhoto(
  ctx: AgentOrgContext,
  targetUserId: string,
) {
  if (!ctx.workspaceId) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (
    !canMutateAgentUserProfilePhoto({
      actorUserId: ctx.user.id,
      targetUserId,
      canManageWorkspace: ctx.canManageWorkspace,
    })
  ) {
    return {
      error: NextResponse.json(
        { error: "You cannot update this agent photo." },
        { status: 403 },
      ),
    };
  }

  const profile = await loadWorkspaceAgentProfile(ctx, targetUserId);
  if (!profile.ok) {
    return {
      error: NextResponse.json(
        { error: profile.error },
        { status: profile.status },
      ),
    };
  }
  if (!profile.profile.canEditPhoto) {
    return {
      error: NextResponse.json(
        { error: "You cannot update this agent photo." },
        { status: 403 },
      ),
    };
  }

  return { workspaceId: ctx.workspaceId, targetUserId };
}

function mapAssetError(error: unknown) {
  if (error instanceof OwnerActivationError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof BrandingStorageNotConfiguredError) {
    return NextResponse.json(
      { error: error.message, code: BRANDING_STORAGE_NOT_CONFIGURED },
      { status: error.status },
    );
  }
  return null;
}

function resolveTargetUserId(
  ctxUserId: string,
  candidate: unknown,
): string {
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }
  return ctxUserId;
}

export async function POST(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx?.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const targetUserId = resolveTargetUserId(ctx.user.id, form.get("userId"));
    const authz = await authorizeProfilePhoto(ctx, targetUserId);
    if ("error" in authz && authz.error) return authz.error;

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File required." }, { status: 400 });
    }

    // Optional email thumb bytes only — never accept client object keys or URLs.
    const emailHeadshotRaw = form.get("emailHeadshot");
    const emailHeadshot =
      emailHeadshotRaw instanceof File ? emailHeadshotRaw : null;

    const result = await uploadAgentUserProfilePhoto({
      workspaceId: authz.workspaceId,
      userId: authz.targetUserId,
      file,
      emailHeadshot,
    });
    return NextResponse.json({
      ok: true,
      // Compat: existing uploader reads agentProfilePhotoUrl.
      agentProfilePhotoUrl: result.agentProfilePhotoUrl,
      image: result.image,
      syncedBrandingPortrait: result.syncedBrandingPortrait,
      primaryAgentUnset: result.primaryAgentUnset,
      // Availability only — never a CDN URL / never a signature preference.
      emailHeadshotStored: result.emailHeadshotStored,
      emailHeadshotAssociated: result.emailHeadshotAssociated,
    });
  } catch (error) {
    const mapped = mapAssetError(error);
    if (mapped) return mapped;
    console.error("[agent/profile/photo] upload failed", error);
    return NextResponse.json(
      { error: "Could not upload photo." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx?.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    let targetUserId = resolveTargetUserId(
      ctx.user.id,
      url.searchParams.get("userId"),
    );
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        const body = (await request.json()) as { userId?: unknown };
        targetUserId = resolveTargetUserId(targetUserId, body?.userId);
      } catch {
        /* ignore empty/invalid JSON */
      }
    }

    const authz = await authorizeProfilePhoto(ctx, targetUserId);
    if ("error" in authz && authz.error) return authz.error;

    const result = await removeAgentUserProfilePhoto({
      workspaceId: authz.workspaceId,
      userId: authz.targetUserId,
    });
    return NextResponse.json({
      ok: true,
      agentProfilePhotoUrl: result.agentProfilePhotoUrl,
      image: result.image,
      syncedBrandingPortrait: result.syncedBrandingPortrait,
      primaryAgentUnset: result.primaryAgentUnset,
    });
  } catch (error) {
    const mapped = mapAssetError(error);
    if (mapped) return mapped;
    console.error("[agent/profile/photo] remove failed", error);
    return NextResponse.json(
      { error: "Could not remove photo." },
      { status: 500 },
    );
  }
}
