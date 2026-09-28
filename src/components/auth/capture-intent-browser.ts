"use client";

import {
  CAPTURE_INTENT_STORAGE_KEY,
  type CaptureIntentStore,
} from "@/lib/auth/capture-intent";

/** Same-tab storage. Origin-scoped, so another tenant hostname cannot read it. */
export function browserCaptureIntentStore(): CaptureIntentStore {
  return {
    get() {
      try {
        return sessionStorage.getItem(CAPTURE_INTENT_STORAGE_KEY);
      } catch {
        return null;
      }
    },
    set(value) {
      try {
        sessionStorage.setItem(CAPTURE_INTENT_STORAGE_KEY, value);
      } catch {
        // Private mode or a full quota must not break sign-in.
      }
    },
    remove() {
      try {
        sessionStorage.removeItem(CAPTURE_INTENT_STORAGE_KEY);
      } catch {
        // Same as set.
      }
    },
  };
}
