/**
 * Stage 3K.4.2 — infer domain kind before kind column migration is applied.
 */
import type { WorkspaceDomainKind } from "@prisma/client";
import { platformHostnameForWorkspaceSlug } from "@/lib/tenancy/platform-hostname";

export function inferWorkspaceDomainKind(input: {
  hostname: string;
  workspaceSlug: string;
  storedKind?: WorkspaceDomainKind | null;
}): WorkspaceDomainKind {
  if (input.storedKind) return input.storedKind;
  const platform = platformHostnameForWorkspaceSlug(input.workspaceSlug);
  if (platform.ok && platform.hostname === input.hostname) {
    return "PLATFORM";
  }
  return "CUSTOM";
}

export function isPrismaMissingWorkspaceDomainKindColumn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? (error as { code?: string }).code : null;
  if (code === "P2022") return true;
  const message =
    "message" in error && typeof (error as { message?: string }).message === "string"
      ? (error as { message: string }).message
      : "";
  return message.includes("WorkspaceDomainKind") || message.includes("kind");
}
