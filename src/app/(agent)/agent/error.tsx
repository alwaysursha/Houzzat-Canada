"use client";

import { RouteError } from "@/components/feedback/RouteError";

/**
 * Segment boundary for `/agent/*` — renders inside `agent/layout` (AgentShell
 * chrome stays). Falls back to root `app/error.tsx` only if this file is absent.
 */
export default function AgentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      error={error}
      reset={reset}
      title="Something went wrong"
      description="We couldn't load this CRM view. Your session is still signed in — try again or return to the Agent launchpad."
      secondaryHref="/agent"
      secondaryLabel="Back to CRM"
      hardSecondaryNav
    />
  );
}
