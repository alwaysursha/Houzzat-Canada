"use client";

import { SessionProvider } from "next-auth/react";
import { RecentViewsSync } from "@/components/account/RecentViewsSync";
import { SavedListingsProvider } from "@/components/account/SavedListingsProvider";
import { AuthModalProvider } from "@/components/auth/AuthModalProvider";
import { SiteAlertProvider } from "@/components/feedback/SiteAlertProvider";
import { ViewingDayProvider } from "@/components/viewing-day/ViewingDayProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus>
      <SavedListingsProvider>
        <ViewingDayProvider>
          <SiteAlertProvider>
            <AuthModalProvider>
              <RecentViewsSync />
              {children}
            </AuthModalProvider>
          </SiteAlertProvider>
        </ViewingDayProvider>
      </SavedListingsProvider>
    </SessionProvider>
  );
}
