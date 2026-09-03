import {
  PlatformOperatorAuthError,
  requirePlatformOperator,
  type PlatformOperatorContext,
} from "@/lib/platform/auth/require-platform-operator";
import { platformError } from "@/lib/platform/api/response";
import { WorkspaceStatusActionError } from "@/lib/platform/workspaces/status";

export class PlatformApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "PlatformApiError";
    this.status = status;
    this.code = code;
  }
}

export async function withPlatformOperator<T>(
  handler: (operator: PlatformOperatorContext) => Promise<T>,
): Promise<T> {
  try {
    const operator = await requirePlatformOperator();
    return await handler(operator);
  } catch (error) {
    if (error instanceof PlatformOperatorAuthError) {
      throw error;
    }
    console.error("[platform-api] unhandled error", error);
    throw new PlatformOperatorAuthError(
      "Internal server error",
      500,
      "INTERNAL_ERROR",
    );
  }
}

export function toPlatformHttpError(error: unknown) {
  if (error instanceof PlatformOperatorAuthError) {
    return platformError(error.status, error.code, error.message);
  }
  if (error instanceof PlatformApiError) {
    return platformError(error.status, error.code, error.message);
  }
  if (error instanceof WorkspaceStatusActionError) {
    return platformError(error.status, error.code, error.message);
  }
  return platformError(500, "INTERNAL_ERROR", "Internal server error");
}
