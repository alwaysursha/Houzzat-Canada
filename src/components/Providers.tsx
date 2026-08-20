"use client";

import { Suspense } from "react";
import { SessionProvider } from "next-auth/react";
import { ContactUpdateReminder } from "@/components/account/ContactUpdateReminder";
import { RecentViewsSync } from "@/components/account/RecentViewsSync";
import { SavedListingsProvider } from "@/components/account/SavedListingsProvider";
import { PropertyWatchesProvider } from "@/components/account/PropertyWatchesProvider";
import { ActivityBeacon } from "@/components/analytics/ActivityBeacon";
import { AuthModalProvider } from "@/components/auth/AuthModalProvider";
import { RememberClientSession } from "@/components/auth/RememberClientSession";
import { NavigationRecovery } from "@/components/feedback/NavigationRecovery";
import { SoftNavShield } from "@/components/feedback/SoftNavShield";
import { SiteAlertProvider } from "@/components/feedback/SiteAlertProvider";
import { BiometricLockGate } from "@/components/mobile/BiometricLockGate";
import { CapacitorBootstrap } from "@/components/mobile/CapacitorBootstrap";
import { HouzzatAndroidBootCover } from "@/components/mobile/HouzzatAndroidBootCover";
import { HouzzatPullToRefresh } from "@/components/mobile/HouzzatPullToRefresh";
import { HouzzatProStartup } from "@/components/mobile/HouzzatProStartup";
import { PushNotificationsBootstrap } from "@/components/mobile/PushNotificationsBootstrap";
import { ListingSheetHostLazy } from "@/components/mobile/ListingSheetHostLazy";
import { RoutePlannerProvider } from "@/components/route-planner/RoutePlannerProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      refetchOnWindowFocus
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
              <HouzzatProStartup />
              <BiometricLockGate />
              <RememberClientSession />
              <SoftNavShield />
              <NavigationRecovery />
              <RecentViewsSync />
              <Suspense fallback={null}>
                <ActivityBeacon />
              </Suspense>
              <ContactUpdateReminder />
              <HouzzatPullToRefresh>{children}</HouzzatPullToRefresh>
              <ListingSheetHostLazy />
            </AuthModalProvider>
          </SiteAlertProvider>
        </RoutePlannerProvider>
        </PropertyWatchesProvider>
      </SavedListingsProvider>
    </SessionProvider>
  );
}
