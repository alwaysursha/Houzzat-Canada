"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { performHardSignOut } from "@/lib/auth/hard-sign-out";
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
  const [pending, setPending] = useState(false);

  async function onSignOut() {
    if (pending) return;
    const ok = await confirm({
      ...SITE_MESSAGES.signOut,
      destructive: true,
    });
    if (!ok) return;

    setPending(true);

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
    try {
      await prepareExplicitSignOut();
    } catch {
      // Auth logout is the priority — biometric cleanup must not block it.
    }

    // POST clears cookies (WebView-safe). Avoid next-auth client signOut on
    // Cloudflare Workers (can re-issue the session cookie after a blank clear).
    await performHardSignOut();
    setPending(false);
  }

  return (
    <button
      type="button"
      onClick={() => void onSignOut()}
      disabled={pending}
      aria-busy={pending || undefined}
      className={cn(
        "text-sm font-medium text-ink/55 transition hover:text-canopy disabled:opacity-60",
        className,
      )}
    >
      {pending ? "Signing out…" : label}
    </button>
  );
}
