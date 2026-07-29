"use client";

import { signOut } from "next-auth/react";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { SITE_URL } from "@/lib/constants";
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
    void signOut({ callbackUrl: SITE_URL });
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
