"use client";

import { SessionProvider } from "next-auth/react";
import { RecentViewsSync } from "@/components/account/RecentViewsSync";
import { SavedListingsProvider } from "@/components/account/SavedListingsProvider";
import { AuthModalProvider } from "@/components/auth/AuthModalProvider";
import { SiteAlertProvider } from "@/components/feedback/SiteAlertProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus>
      <SavedListingsProvider>
        <SiteAlertProvider>
          <AuthModalProvider>
            <RecentViewsSync />
            {children}
          </AuthModalProvider>
        </SiteAlertProvider>
      </SavedListingsProvider>
    </SessionProvider>
  );
}
