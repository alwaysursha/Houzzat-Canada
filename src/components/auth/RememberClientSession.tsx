"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { markClientSession } from "@/lib/auth/remembered-login";
import { clearIntentionalSignOut } from "@/lib/mobile/biometrics";

/**
 * Marks this browser as a returning client when a session is present (incl. Google).
 * Also clears intentional-logout after ANY successful Auth.js login so biometric
 * unlock can resume when the device preference remains enabled.
 */
export function RememberClientSession() {
  const { status, data } = useSession();
  const email = data?.user?.email;
  const userId = data?.user?.id;

  useEffect(() => {
    if (email) markClientSession(email);
  }, [email]);

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    void clearIntentionalSignOut({ userId });
  }, [status, userId]);

  return null;
}
