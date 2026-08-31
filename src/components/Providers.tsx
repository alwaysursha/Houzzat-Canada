"use client";

import { Suspense, useMemo } from "react";
import { SessionProvider } from "next-auth/react";
import { ContactUpdateReminder } from "@/components/account/ContactUpdateReminder";
import { RecentViewsSync } from "@/components/account/RecentViewsSync";
import { SavedListingsProvider } from "@/components/account/SavedListingsProvider";
import { PropertyWatchesProvider } from "@/components/account/PropertyWatchesProvider";
import { ActivityBeacon } from "@/components/analytics/ActivityBeacon";
import { isActivityBeaconEnabled } from "@/lib/analytics/activity-beacon-enabled";
import { AuthModalProvider } from "@/components/auth/AuthModalProvider";
import { RememberClientSession } from "@/components/auth/RememberClientSession";
import { NavigationRecovery } from "@/components/feedback/NavigationRecovery";
import { SoftNavShield } from "@/components/feedback/SoftNavShield";
import { SiteAlertProvider } from "@/components/feedback/SiteAlertProvider";
import { BiometricLockGate } from "@/components/mobile/BiometricLockGate";
import { CapacitorBootstrap } from "@/components/mobile/CapacitorBootstrap";
import { HouzzatAndroidBootCover } from "@/components/mobile/HouzzatAndroidBootCover";
import { HouzzatPullToRefresh } from "@/components/mobile/HouzzatPullToRefresh";
import { PushNotificationsBootstrap } from "@/components/mobile/PushNotificationsBootstrap";
import { shouldRefetchSessionOnWindowFocus } from "@/lib/mobile/session-revalidate-policy";
import { RoutePlannerProvider } from "@/components/route-planner/RoutePlannerProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  const refetchOnWindowFocus = useMemo(() => {
    if (typeof navigator === "undefined") return true;
    return shouldRefetchSessionOnWindowFocus(navigator.userAgent);
  }, []);

  return (
    <SessionProvider
      refetchOnWindowFocus={refetchOnWindowFocus}
      // Keep rolling the 48h idle session while the tab is open.
      refetchInterval={30 * 60}
    >
      <SavedListingsProvider>
        <PropertyWatchesProvider>
        <RoutePlannerProvider>
          <SiteAlertProvider>
            <AuthModalProvider>
              <CapacitorBootstrap />
              <HouzzatAndroidBootCover />
              <PushNotificationsBootstrap />
              <BiometricLockGate />
              <RememberClientSession />
              <SoftNavShield />
              <NavigationRecovery />
              <RecentViewsSync />
              <Suspense fallback={null}>
                {isActivityBeaconEnabled() ? <ActivityBeacon /> : null}
              </Suspense>
              <ContactUpdateReminder />
              <HouzzatPullToRefresh>{children}</HouzzatPullToRefresh>
            </AuthModalProvider>
          </SiteAlertProvider>
        </RoutePlannerProvider>
        </PropertyWatchesProvider>
      </SavedListingsProvider>
    </SessionProvider>
  );
}
