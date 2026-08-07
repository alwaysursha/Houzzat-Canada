"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { markClientSession } from "@/lib/auth/remembered-login";

/** Marks this browser as a returning client when a session is present (incl. Google). */
export function RememberClientSession() {
  const { data } = useSession();
  const email = data?.user?.email;

  useEffect(() => {
    if (email) markClientSession(email);
  }, [email]);

  return null;
}
