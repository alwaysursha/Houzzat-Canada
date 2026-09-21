import {
  OwnerActivationError,
  listOwnerOnboardingWorkspaces,
  updateOwnerOnboardingBusinessProfile,
  updateOwnerOnboardingProfessionalIdentity,
  updateOwnerOnboardingTemplateTheme,
} from "@/lib/platform/activation";
import { platformError, platformOk } from "@/lib/platform/api/response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const items = await listOwnerOnboardingWorkspaces({ request });
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
    // workspaceId from client is never authoritative — mismatch fails safely.
    const clientWorkspaceId =
      typeof body.workspaceId === "string" ? body.workspaceId : null;
    const action =
      typeof body.action === "string" ? body.action : "business_profile";
    const persistAsDraft = body.draft === true;

    if (action === "template_theme") {
      const updated = await updateOwnerOnboardingTemplateTheme({
        request,
        clientWorkspaceId,
        themeId: body.themeId,
        persistAsDraft,
      });
      return platformOk({ workspace: updated });
    }

    if (action === "professional_identity") {
      const updated = await updateOwnerOnboardingProfessionalIdentity({
        request,
        clientWorkspaceId,
        persistAsDraft,
        agentRegisteredName:
          typeof body.agentRegisteredName === "string"
            ? body.agentRegisteredName
            : "",
        agentDesignation:
          typeof body.agentDesignation === "string"
            ? body.agentDesignation
            : "",
        agentCellPhone:
          typeof body.agentCellPhone === "string" ? body.agentCellPhone : "",
        brokerageRegisteredName:
          typeof body.brokerageRegisteredName === "string"
            ? body.brokerageRegisteredName
            : "",
        brokerageFax:
          typeof body.brokerageFax === "string"
            ? body.brokerageFax
            : null,
        brokeragePhone:
          typeof body.brokeragePhone === "string" ? body.brokeragePhone : "",
        brokerageAddress:
          typeof body.brokerageAddress === "string"
            ? body.brokerageAddress
            : "",
      });
      return platformOk({ workspace: updated });
    }

    if (action !== "business_profile") {
      return platformError(400, "INVALID_ACTION", "Unsupported onboarding action");
    }

    const updated = await updateOwnerOnboardingBusinessProfile({
      request,
      clientWorkspaceId,
      persistAsDraft,
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
