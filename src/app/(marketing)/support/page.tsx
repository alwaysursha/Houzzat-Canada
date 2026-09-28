import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  HouzzatProSupportPage,
  houzzatProSupportPageMetadata,
} from "@/components/platform/status/HouzzatProSupportPage";
import { isHouzzatProPlatformApexRequest } from "@/lib/platform/public/public-site-paths";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  if (!(await isHouzzatProPlatformApexRequest())) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }
  return houzzatProSupportPageMetadata;
}

export default async function HouzzatProSupportRoutePage() {
  if (!(await isHouzzatProPlatformApexRequest())) notFound();
  return <HouzzatProSupportPage />;
}
