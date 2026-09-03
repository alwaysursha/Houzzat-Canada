import { redirect } from "next/navigation";
import {
  PlatformOperatorAuthError,
  requirePlatformOperator,
  type PlatformOperatorContext,
} from "@/lib/platform/auth/require-platform-operator";

export async function requirePlatformPageAccess(): Promise<PlatformOperatorContext> {
  try {
    return await requirePlatformOperator();
  } catch (error) {
    if (error instanceof PlatformOperatorAuthError) {
      if (error.status === 401) {
        redirect("/pro/sign-in?callbackUrl=/platform");
      }
      redirect("/platform/access-denied");
    }
    throw error;
  }
}
