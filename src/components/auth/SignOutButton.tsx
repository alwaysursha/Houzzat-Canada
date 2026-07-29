"use client";

import { signOut } from "next-auth/react";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { cn } from "@/lib/utils";

export function SignOutButton({ className }: { className?: string }) {
  const { confirm } = useSiteAlert();

  async function onSignOut() {
    const ok = await confirm({
      ...SITE_MESSAGES.signOut,
      destructive: true,
    });
    if (!ok) return;

    // Clear session on the current host, then hard-navigate.
    // Absolute SITE_URL redirects were leaving a stale session cookie.
    try {
      await signOut({ redirect: false });
    } catch {
      // Still force a clean reload below.
    }
    window.location.assign("/");
  }

  return (
    <button
      type="button"
      onClick={() => void onSignOut()}
      className={cn(
        "text-sm font-medium text-ink/55 transition hover:text-canopy",
        className,
      )}
    >
      Sign out
    </button>
  );
}
