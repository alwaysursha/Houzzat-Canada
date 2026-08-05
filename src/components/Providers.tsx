"use client";

import { Suspense } from "react";
import { SessionProvider } from "next-auth/react";
import { ContactUpdateReminder } from "@/components/account/ContactUpdateReminder";
import { RecentViewsSync } from "@/components/account/RecentViewsSync";
import { SavedListingsProvider } from "@/components/account/SavedListingsProvider";
import { ActivityBeacon } from "@/components/analytics/ActivityBeacon";
import { AuthModalProvider } from "@/components/auth/AuthModalProvider";
import { NavigationRecovery } from "@/components/feedback/NavigationRecovery";
import { SiteAlertProvider } from "@/components/feedback/SiteAlertProvider";
import { RoutePlannerProvider } from "@/components/route-planner/RoutePlannerProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      <SavedListingsProvider>
        <RoutePlannerProvider>
          <SiteAlertProvider>
            <AuthModalProvider>
              <NavigationRecovery />
              <RecentViewsSync />
              <Suspense fallback={null}>
                <ActivityBeacon />
              </Suspense>
              <ContactUpdateReminder />
              {children}
            </AuthModalProvider>
          </SiteAlertProvider>
        </RoutePlannerProvider>
      </SavedListingsProvider>
    </SessionProvider>
  );
}
