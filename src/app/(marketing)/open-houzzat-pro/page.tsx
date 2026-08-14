import type { Metadata } from "next";
import { OpenHouzzatProInterstitial } from "@/components/mobile/OpenHouzzatProInterstitial";

export const metadata: Metadata = {
  title: "HouzzatPro",
  robots: { index: false, follow: false },
};

/** Consumer-app gate for staff routes — no data fetching. */
export default function OpenHouzzatProPage() {
  return <OpenHouzzatProInterstitial />;
}
