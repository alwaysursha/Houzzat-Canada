"use client";

import { SessionProvider } from "next-auth/react";
import { AuthModalProvider } from "@/components/auth/AuthModalProvider";
import { SiteAlertProvider } from "@/components/feedback/SiteAlertProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus>
      <SiteAlertProvider>
        <AuthModalProvider>{children}</AuthModalProvider>
      </SiteAlertProvider>
    </SessionProvider>
  );
}
