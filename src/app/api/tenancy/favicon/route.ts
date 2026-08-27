import { NextResponse, type NextRequest } from "next/server";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/platform-hostname";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";
import { absoluteUrlForOrigin } from "@/lib/tenancy/resolve-trusted-request-origin";
import {
  buildGeneratedTenantFaviconSvg,
  faviconResponseCacheControl,
  resolveFaviconPrimaryColor,
  safeFaviconInitial,
} from "@/lib/tenancy/tenant-favicon";

export const dynamic = "force-dynamic";

function notFound() {
  return new NextResponse("Not found", { status: 404 });
}

export async function GET(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0] ?? "";
  if (!host || isHouzzatProPlatformRoot(host)) {
    return notFound();
  }

  const tenancy = await resolveRequestTenancy(request);
  if (!tenancy.ok) {
    return notFound();
  }

  const { brand } = tenancy;
  const customFavicon = brand.faviconUrl?.trim();
  if (customFavicon) {
    const target = customFavicon.startsWith("http")
      ? customFavicon
      : absoluteUrlForOrigin(tenancy.origin, customFavicon) ?? customFavicon;
    return NextResponse.redirect(target, {
      status: 302,
      headers: {
        "Cache-Control": faviconResponseCacheControl(),
        Vary: "Host",
      },
    });
  }

  // Version query is cache-busting only — branding comes from hostname resolution.
  void request.nextUrl.searchParams.get("v");

  const svg = buildGeneratedTenantFaviconSvg({
    primaryColor: resolveFaviconPrimaryColor(brand.colors.primary),
    initial: safeFaviconInitial(brand.displayName),
  });

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": faviconResponseCacheControl(),
      Vary: "Host",
    },
  });
}
