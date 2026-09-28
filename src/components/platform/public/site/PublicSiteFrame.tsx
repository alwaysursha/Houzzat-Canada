import type { ReactNode } from "react";
import { HomePreviewMotion } from "@/components/platform/public/HomePreviewMotion";
import { HomePreviewNav } from "@/components/platform/public/HomePreviewNav";
import { HomePreviewSiteFooter } from "@/components/platform/public/HomePreviewFinalCta";
import {
  PLATFORM_HOME_PRIMARY_CTA_HREF,
  PLATFORM_HOME_SECONDARY_CTA_HREF,
} from "@/lib/platform/public/platform-home-copy";
import "./houzzatpro-public.css";

export function PublicSiteFrame({
  pathname,
  children,
}: {
  pathname: string;
  children: ReactNode;
}) {
  return (
    <HomePreviewMotion>
      <div className="hp-pub">
        <HomePreviewNav
          pathname={pathname}
          loginHref={PLATFORM_HOME_SECONDARY_CTA_HREF}
          demoHref={PLATFORM_HOME_PRIMARY_CTA_HREF}
        />
        <main className="hp-pub-main">{children}</main>
        <HomePreviewSiteFooter />
      </div>
    </HomePreviewMotion>
  );
}
