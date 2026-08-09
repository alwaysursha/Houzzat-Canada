"use client";

import { Suspense } from "react";
import { SessionProvider } from "next-auth/react";
import { ContactUpdateReminder } from "@/components/account/ContactUpdateReminder";
import { RecentViewsSync } from "@/components/account/RecentViewsSync";
import { SavedListingsProvider } from "@/components/account/SavedListingsProvider";
import { ActivityBeacon } from "@/components/analytics/ActivityBeacon";
import { AuthModalProvider } from "@/components/auth/AuthModalProvider";
import { RememberClientSession } from "@/components/auth/RememberClientSession";
import { NavigationRecovery } from "@/components/feedback/NavigationRecovery";
import { SiteAlertProvider } from "@/components/feedback/SiteAlertProvider";
import { CapacitorBootstrap } from "@/components/mobile/CapacitorBootstrap";
import { RoutePlannerProvider } from "@/components/route-planner/RoutePlannerProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      refetchOnWindowFocus
      // Keep rolling the 48h idle session while the tab is open.
      refetchInterval={30 * 60}
    >
      <SavedListingsProvider>
        <RoutePlannerProvider>
          <SiteAlertProvider>
            <AuthModalProvider>
              <CapacitorBootstrap />
              <RememberClientSession />
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
