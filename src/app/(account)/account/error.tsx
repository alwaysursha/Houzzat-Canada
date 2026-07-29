"use client";

import { RouteError } from "@/components/feedback/RouteError";

export default function AccountError({
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
      title="Your Houzzat couldn’t load"
    />
  );
}
