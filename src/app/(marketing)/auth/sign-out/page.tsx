"use client";

import { useEffect } from "react";
import { performHardSignOut } from "@/lib/auth/hard-sign-out";

/** Safe sign-out landing — clears cookies client-side, then redirects home. */
export default function SignOutPage() {
  useEffect(() => {
    void performHardSignOut();
  }, []);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-mist px-6">
      <p className="text-sm text-ink/60">Signing out…</p>
    </div>
  );
}
