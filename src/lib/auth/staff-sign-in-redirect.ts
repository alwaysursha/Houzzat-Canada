import { redirect } from "next/navigation";
import { staffSignInHref } from "@/lib/auth/pro-sign-in-routing";
import { getRequestAppShell } from "@/lib/mobile/app-shell-server";
import { HOUZZATPRO_STAFF_ONLY_PATH } from "@/lib/mobile/app-shell";

/** Resolve Pro-aware staff sign-in URL for the current request shell. */
export async function staffSignInRedirectUrl(
  callbackUrl: string,
): Promise<string> {
  const shell = await getRequestAppShell();
  return staffSignInHref(shell, callbackUrl);
}

/**
 * Server redirect to Pro or web staff sign-in based on request shell (UA).
 * Prefer `redirect(await staffSignInRedirectUrl(...))` at call sites so
 * TypeScript keeps `never` narrowing from `redirect`.
 */
export async function redirectToStaffSignIn(
  callbackUrl: string,
): Promise<never> {
  redirect(await staffSignInRedirectUrl(callbackUrl));
}

/** Wrong-role bounce for Admin layout when not ADMIN. */
export async function redirectNonAdminFromAdminShell(
  role: string | null | undefined,
): Promise<never> {
  const shell = await getRequestAppShell();
  if (role === "AGENT") redirect("/agent");
  if (shell === "houzzatpro") redirect(HOUZZATPRO_STAFF_ONLY_PATH);
  redirect("/account");
}
