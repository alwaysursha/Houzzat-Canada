import { NextResponse } from "next/server";
import {
  OwnerActivationError,
  listOwnerOnboardingWorkspaces,
  updateOwnerOnboardingBusinessProfile,
} from "@/lib/platform/activation";
import { platformError, platformOk } from "@/lib/platform/api/response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const items = await listOwnerOnboardingWorkspaces();
    return platformOk({ items });
  } catch (error) {
    if (error instanceof OwnerActivationError) {
      return platformError(error.status, error.code, error.message);
    }
    return platformError(500, "INTERNAL_ERROR", "Unable to load onboarding");
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const workspaceId =
      typeof body.workspaceId === "string" ? body.workspaceId : "";
    const updated = await updateOwnerOnboardingBusinessProfile({
      workspaceId,
      displayName:
        typeof body.displayName === "string" ? body.displayName : "",
      contactEmail:
        typeof body.contactEmail === "string" ? body.contactEmail : "",
      contactPhone:
        typeof body.contactPhone === "string" ? body.contactPhone : null,
      replyToEmail:
        typeof body.replyToEmail === "string" ? body.replyToEmail : null,
      senderDisplayName:
        typeof body.senderDisplayName === "string"
          ? body.senderDisplayName
          : null,
    });
    return platformOk({ workspace: updated });
  } catch (error) {
    if (error instanceof OwnerActivationError) {
      return platformError(error.status, error.code, error.message);
    }
    return platformError(500, "INTERNAL_ERROR", "Unable to save onboarding");
  }
}
