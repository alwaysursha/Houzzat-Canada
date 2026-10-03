import { NextResponse } from "next/server";
import { requireAgentContextFromRequest } from "@/lib/agent";
import { loadWorkspaceAgentProfile } from "@/lib/agent/admin-managed-profile";
import { OwnerActivationError } from "@/lib/platform/activation/errors";
import {
  removeWorkspaceAgentProfilePhoto,
  uploadWorkspaceAgentProfilePhoto,
} from "@/lib/tenancy/branding-assets/manage";
import {
  BrandingStorageNotConfiguredError,
  BRANDING_STORAGE_NOT_CONFIGURED,
} from "@/lib/tenancy/branding-assets/storage";

export const runtime = "nodejs";

async function authorizeProfilePhoto(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx?.workspaceId) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!ctx.canManageWorkspace) {
    return {
      error: NextResponse.json(
        { error: "Workspace manager access required." },
        { status: 403 },
      ),
    };
  }

  const profile = await loadWorkspaceAgentProfile(ctx, ctx.user.id);
  if (!profile.ok || !profile.profile.canEditPhoto) {
    return {
      error: NextResponse.json(
        { error: "You cannot update the public agent photo." },
        { status: 403 },
      ),
    };
  }

  return { ctx, workspaceId: ctx.workspaceId };
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

export async function POST(request: Request) {
  const authz = await authorizeProfilePhoto(request);
  if ("error" in authz && authz.error) return authz.error;

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File required." }, { status: 400 });
    }

    const result = await uploadWorkspaceAgentProfilePhoto({
      workspaceId: authz.workspaceId,
      file,
    });
    return NextResponse.json({
      ok: true,
      agentProfilePhotoUrl: result.agentProfilePhotoUrl,
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
  const authz = await authorizeProfilePhoto(request);
  if ("error" in authz && authz.error) return authz.error;

  try {
    const result = await removeWorkspaceAgentProfilePhoto({
      workspaceId: authz.workspaceId,
    });
    return NextResponse.json({
      ok: true,
      agentProfilePhotoUrl: result.agentProfilePhotoUrl,
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
