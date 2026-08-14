import type { Metadata } from "next";
import { HouzzatProStaffOnly } from "@/components/mobile/HouzzatProStaffOnly";

export const metadata: Metadata = {
  title: "HouzzatPro — Staff only",
  robots: { index: false, follow: false },
};

export default function HouzzatProStaffOnlyPage() {
  return <HouzzatProStaffOnly />;
}
