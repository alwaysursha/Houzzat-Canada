"use client";

import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { cn } from "@/lib/utils";

export function SignOutButton({
  className,
  label = "Sign out",
}: {
  className?: string;
  label?: string;
}) {
  const { confirm } = useSiteAlert();

  async function onSignOut() {
    const ok = await confirm({
      ...SITE_MESSAGES.signOut,
      destructive: true,
    });
    if (!ok) return;

    // Hard navigation to the logout route — one response clears cookies and
    // redirects. Avoid next-auth client signOut on Cloudflare Workers: Auth.js
    // middleware can re-issue the session cookie after a blank clear.
    window.location.assign("/api/auth/logout");
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
      {label}
    </button>
  );
}
