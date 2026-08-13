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
    />
  );
}
