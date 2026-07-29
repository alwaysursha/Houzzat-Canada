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

    // 1) Server hard-clear of all Auth.js cookie variants
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      // continue
    }

    // 2) Client Auth.js cleanup (session store)
    try {
      await signOut({ redirect: false });
    } catch {
      // continue
    }

    // 3) Hard navigation so UI cannot keep a stale SessionProvider state
    window.location.href = "/?signedOut=1";
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
