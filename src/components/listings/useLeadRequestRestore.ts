"use client";

import { useEffect, useState } from "react";
import {
  LEAD_REQUEST_RESTORE_EVENT,
  retainLeadRequestIntentHandler,
  takeLeadRequestRestore,
  type LeadRequestRestore,
} from "@/lib/auth/lead-request-intent";

/**
 * When claim is true, this surface is the one the customer can see.
 * It takes the restore once so a refresh does not reopen the form.
 */
export function useLeadRequestRestore(
  mlsNumber: string,
  claim: boolean,
): LeadRequestRestore | null {
  const [restore, setRestore] = useState<LeadRequestRestore | null>(null);

  useEffect(() => {
    const stop = retainLeadRequestIntentHandler();

    function apply() {
      if (!claim) return;
      const next = takeLeadRequestRestore(mlsNumber);
      if (next) setRestore(next);
    }

    window.addEventListener(LEAD_REQUEST_RESTORE_EVENT, apply);
    apply();
    return () => {
      window.removeEventListener(LEAD_REQUEST_RESTORE_EVENT, apply);
      stop();
    };
  }, [mlsNumber, claim]);

  return restore;
}
