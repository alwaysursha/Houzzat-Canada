import { NextResponse } from "next/server";
import {
  OwnerActivationError,
  completeOwnerActivation,
  resolvePublicOwnerActivation,
} from "@/lib/platform/activation";
import { platformError, platformOk } from "@/lib/platform/api/response";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  try {
    const view = await resolvePublicOwnerActivation({ rawToken: token });
    return platformOk(view);
  } catch (error) {
    if (error instanceof OwnerActivationError) {
      return platformError(error.status, error.code, error.message);
    }
    return platformError(500, "INTERNAL_ERROR", "Unable to resolve activation");
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  try {
    const body = (await request.json()) as {
      password?: unknown;
      confirmPassword?: unknown;
    };
    const result = await completeOwnerActivation({
      rawToken: token,
      password: typeof body.password === "string" ? body.password : "",
      confirmPassword:
        typeof body.confirmPassword === "string" ? body.confirmPassword : "",
    });
    return platformOk({
      activated: true,
      workspaceId: result.workspaceId,
      signInPath: "/auth/sign-in",
    });
  } catch (error) {
    if (error instanceof OwnerActivationError) {
      return platformError(error.status, error.code, error.message);
    }
    return platformError(500, "INTERNAL_ERROR", "Unable to complete activation");
  }
}
