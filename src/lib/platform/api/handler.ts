import { Prisma } from "@prisma/client";
import {
  PlatformOperatorAuthError,
  requirePlatformOperator,
  type PlatformOperatorContext,
} from "@/lib/platform/auth/require-platform-operator";
import { platformError } from "@/lib/platform/api/response";
import { PlatformProspectActionError } from "@/lib/platform/prospects/manage";
import { CommercialOfferActionError } from "@/lib/platform/offers/errors";
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
    if (
      error instanceof PlatformOperatorAuthError ||
      error instanceof PlatformApiError ||
      error instanceof WorkspaceStatusActionError ||
      error instanceof PlatformProspectActionError ||
      error instanceof CommercialOfferActionError ||
      error instanceof Prisma.PrismaClientKnownRequestError
    ) {
      throw error;
    }
    if (
      error instanceof Error &&
      /Transactions are not supported in HTTP mode/i.test(error.message)
    ) {
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
  if (error instanceof PlatformProspectActionError) {
    return platformError(error.status, error.code, error.message);
  }
  if (error instanceof CommercialOfferActionError) {
    return platformError(error.status, error.code, error.message);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error("[platform-api] prisma error", error.code, error.meta);
    switch (error.code) {
      case "P2021":
        return platformError(
          503,
          "SCHEMA_OUT_OF_DATE",
          "Platform database schema is missing required tables. Apply platform migrations.",
        );
      case "P2003":
        return platformError(
          500,
          "DATABASE_CONSTRAINT",
          "Database constraint violation while completing the request.",
        );
      default:
        break;
    }
  }
  if (
    error instanceof Error &&
    /Transactions are not supported in HTTP mode/i.test(error.message)
  ) {
    console.error("[platform-api] neon http transaction error", error);
    return platformError(
      500,
      "DATABASE_ADAPTER",
      "Database adapter rejected the write. Retry shortly.",
    );
  }
  return platformError(500, "INTERNAL_ERROR", "Internal server error");
}
