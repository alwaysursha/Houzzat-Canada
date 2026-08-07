"use client";

import { useSyncExternalStore } from "react";
import { hadClientSession } from "@/lib/auth/remembered-login";

function subscribe() {
  return () => undefined;
}

function getSnapshot() {
  return hadClientSession();
}

function getServerSnapshot() {
  return false;
}

/** True when this browser previously had a Houzzat client session. */
export function useHadClientSession() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Guest lock CTA — “Login again” after a prior session, else “Sign in”. */
export function useLoginAgainLabel(fallback = "Sign in") {
  return useHadClientSession() ? "Login again" : fallback;
}
