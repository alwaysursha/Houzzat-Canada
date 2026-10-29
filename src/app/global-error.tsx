"use client";

import { RouteError } from "@/components/feedback/RouteError";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-full bg-mist antialiased">
        <RouteError
          error={error}
          reset={reset}
          title="This page hit a snag"
          className="min-h-screen"
        />
      </body>
    </html>
  );
}
