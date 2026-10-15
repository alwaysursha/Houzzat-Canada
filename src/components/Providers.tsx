"use client";

import { Suspense, useMemo } from "react";
import { SessionProvider } from "next-auth/react";
import { ContactUpdateReminder } from "@/components/account/ContactUpdateReminder";
import { BrowseStateSync } from "@/components/account/BrowseStateSync";
import { RecentViewsSync } from "@/components/account/RecentViewsSync";
import { SavedListingsProvider } from "@/components/account/SavedListingsProvider";
import { PropertyWatchesProvider } from "@/components/account/PropertyWatchesProvider";
import { ActivityBeacon } from "@/components/analytics/ActivityBeacon";
import { isActivityBeaconEnabled } from "@/lib/analytics/activity-beacon-enabled";
import { AuthModalProvider } from "@/components/auth/AuthModalProvider";
import { CaptureIntentResume } from "@/components/auth/CaptureIntentResume";
import { ClientToolsVerificationProvider } from "@/components/auth/ClientToolsVerificationProvider";
import { CustomerWelcomeChatScheduler } from "@/components/auth/CustomerWelcomeChatScheduler";
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
import { CustomerChatProvider } from "@/components/customer-chat/CustomerChatProvider";

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
              <ClientToolsVerificationProvider>
                <CustomerChatProvider>
                  <CapacitorBootstrap />
                  <HouzzatAndroidBootCover />
                  <PushNotificationsBootstrap />
                  <BiometricLockGate />
                  <RememberClientSession />
                  <CaptureIntentResume />
                  <CustomerWelcomeChatScheduler />
                  <SoftNavShield />
                  <NavigationRecovery />
                  <BrowseStateSync />
                  <RecentViewsSync />
                  <Suspense fallback={null}>
                    {isActivityBeaconEnabled() ? <ActivityBeacon /> : null}
                  </Suspense>
                  <ContactUpdateReminder />
                  <HouzzatPullToRefresh>{children}</HouzzatPullToRefresh>
                </CustomerChatProvider>
              </ClientToolsVerificationProvider>
            </AuthModalProvider>
          </SiteAlertProvider>
        </RoutePlannerProvider>
        </PropertyWatchesProvider>
      </SavedListingsProvider>
    </SessionProvider>
  );
}
