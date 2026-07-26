"use client";

import { SessionProvider } from "next-auth/react";
import { RecentViewsSync } from "@/components/account/RecentViewsSync";
import { SavedListingsProvider } from "@/components/account/SavedListingsProvider";
import { AuthModalProvider } from "@/components/auth/AuthModalProvider";
import { SiteAlertProvider } from "@/components/feedback/SiteAlertProvider";
import { RoutePlannerProvider } from "@/components/route-planner/RoutePlannerProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus>
      <SavedListingsProvider>
        <RoutePlannerProvider>
          <SiteAlertProvider>
            <AuthModalProvider>
              <RecentViewsSync />
              {children}
            </AuthModalProvider>
          </SiteAlertProvider>
        </RoutePlannerProvider>
      </SavedListingsProvider>
    </SessionProvider>
  );
}
