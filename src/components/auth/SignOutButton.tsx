"use client";

import { useSession } from "next-auth/react";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { prepareExplicitSignOut } from "@/lib/mobile/biometrics";
import { unregisterCurrentPushDevice } from "@/lib/notifications/push-client";
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
  const { data } = useSession();
  const userId = data?.user?.id;

  async function onSignOut() {
    const ok = await confirm({
      ...SITE_MESSAGES.signOut,
      destructive: true,
    });
    if (!ok) return;

    // Unregister THIS device token while the session cookie still works.
    // Offline → Preferences pending cleanup on next launch. Never blocks logout.
    try {
      await Promise.race([
        unregisterCurrentPushDevice({ userId }),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 2_500);
        }),
      ]);
    } catch {
      // ignore
    }

    // Clear legacy Keystore secrets; keep unlock preference for next login.
    await prepareExplicitSignOut();

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
