"use client";

import { RouteError } from "@/components/feedback/RouteError";

export default function AdminError({
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
      title="Admin HQ hit a snag"
      description="We couldn't load this Admin view. Your session is still signed in — try again or return to Admin HQ."
      secondaryHref="/admin"
      secondaryLabel="Back to Admin"
      hardSecondaryNav
    />
  );
}
