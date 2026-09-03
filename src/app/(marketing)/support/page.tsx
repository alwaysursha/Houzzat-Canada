import type { Metadata } from "next";
import {
  HouzzatProSupportPage,
  houzzatProSupportPageMetadata,
} from "@/components/platform/status/HouzzatProSupportPage";

export const metadata: Metadata = houzzatProSupportPageMetadata;

export default function HouzzatProSupportRoutePage() {
  return <HouzzatProSupportPage />;
}
