"use client";

import { useState } from "react";
import { performHardSignOut } from "@/lib/auth/hard-sign-out";
import { HOUZZATPRO_APP_BOOTSTRAP_ORIGIN } from "@/lib/mobile/platform-bootstrap";
import { cn } from "@/lib/utils";

/** Master Admin platform shell — hard sign-out (never /auth/sign-out on sales apex). */
export function PlatformSignOutButton({
  className,
  label = "Sign out",
}: {
  className?: string;
  label?: string;
}) {
  const [pending, setPending] = useState(false);

  async function onSignOut() {
    if (pending) return;
    setPending(true);
    const destination = `${HOUZZATPRO_APP_BOOTSTRAP_ORIGIN}/pro/sign-in?signedOut=1&callbackUrl=${encodeURIComponent("/platform")}`;
    await performHardSignOut({
      isStaff: true,
      destination,
    });
    setPending(false);
  }

  return (
    <button
      type="button"
      onClick={() => void onSignOut()}
      disabled={pending}
      aria-busy={pending || undefined}
      className={cn(className)}
    >
      {pending ? "Signing out…" : label}
    </button>
  );
}
