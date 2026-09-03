import { auth } from "@/auth.edge";
import { isComingSoonEnabled } from "@/lib/coming-soon";
import {
  APP_SHELL_COOKIE,
  HOUZZATPRO_STAFF_ONLY_PATH,
  HOUZZATPRO_START_PATH,
  OPEN_HOUZZAT_PRO_PATH,
  isStaffAppPath,
  resolveRequestAppShell,
  shouldGateStaffRoutesForConsumerShell,
  shouldRedirectStaffAccountToCrm,
} from "@/lib/mobile/app-shell";
import {
  isPlatformMobileBootstrapHost,
  shouldRedirectUnauthenticatedProToSignIn,
} from "@/lib/mobile/platform-bootstrap";
import { isVowOnlyMlsMode } from "@/lib/proptx/config";
import {
  canAccessSellerTools,
  isAdminRole,
  isAgentRole,
} from "@/lib/roles";
import { NextResponse, type NextRequest } from "next/server";

function isHouzzatProPlatformRootHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().split(":")[0] ?? "";
  return normalized === "houzzatpro.com" || normalized === "www.houzzatpro.com";
}

function redirectToSignIn(
  request: NextRequest,
  callbackPath: string,
  options?: { pro?: boolean },
) {
  const signInUrl = request.nextUrl.clone();
  signInUrl.pathname = options?.pro ? "/pro/sign-in" : "/auth/sign-in";
  signInUrl.search = "";
  signInUrl.searchParams.set("callbackUrl", callbackPath);
  return NextResponse.redirect(signInUrl);
}

function redirectToPath(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

function isComingSoonBypass(pathname: string) {
  if (pathname === "/coming-soon") return true;
  if (pathname === OPEN_HOUZZAT_PRO_PATH) return true;
  if (pathname === "/pro" || pathname.startsWith("/pro/")) return true;
  if (pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/auth/")) return true;
  if (pathname.startsWith("/admin")) return true;
  if (pathname.startsWith("/platform")) return true;
  if (pathname === "/support") return true;
  if (pathname === "/book-a-demo") return true;
  if (pathname.startsWith("/agent")) return true;
  if (pathname.startsWith("/account")) return true;
  if (pathname.startsWith("/owner")) return true;
  if (pathname.startsWith("/images/")) return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname === "/robots.txt") return true;
  if (pathname === "/sitemap.xml") return true;
  if (pathname.startsWith("/sitemap/")) return true;
  return false;
}

function isPublicFsboSearch(request: NextRequest) {
  return request.nextUrl.searchParams.get("dataSource") === "fsbo";
}

/**
 * UX-only shell resolution. Never used for authorization.
 *
 * A native shell must prove itself with the User-Agent marker injected by the
 * Capacitor config; the cookie alone is ignored so a stale or hand-crafted
 * `houzzat_shell` in an ordinary browser cannot gate staff web routes.
 */
function readShellHint(request: NextRequest) {
  return resolveRequestAppShell({
    userAgent: request.headers.get("user-agent"),
    cookieValue: request.cookies.get(APP_SHELL_COOKIE)?.value,
  });
}

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const session = request.auth;
  const shellHint = readShellHint(request);

  if (pathname === "/favicon.ico") {
    const host = request.headers.get("host")?.split(":")[0] ?? "";
    if (host && !isHouzzatProPlatformRootHost(host)) {
      const url = request.nextUrl.clone();
      url.pathname = "/api/tenancy/favicon";
      return NextResponse.rewrite(url);
    }
  }

  if (isComingSoonEnabled() && !isComingSoonBypass(pathname)) {
    return redirectToPath(request, "/coming-soon");
  }

  // IDX mode: /search is public. VOW-only legacy: require a registered client.
  if (
    isVowOnlyMlsMode() &&
    pathname === "/search" &&
    !isPublicFsboSearch(request)
  ) {
    if (!session?.user) {
      const callback = `${pathname}${request.nextUrl.search}`;
      return redirectToSignIn(request, callback, {
        pro: shellHint === "houzzatpro",
      });
    }
  }

  // Consumer / unrecognized native shell: never render Admin/CRM (UX gate only).
  if (
    shouldGateStaffRoutesForConsumerShell(shellHint) &&
    isStaffAppPath(pathname) &&
    pathname !== OPEN_HOUZZAT_PRO_PATH
  ) {
    return redirectToPath(request, OPEN_HOUZZAT_PRO_PATH);
  }

  // Application bootstrap host (app.houzzatpro.com): unauthenticated /pro → sign-in.
  // Browser has no HouzzatPRO UA shell; do not wait for client Capacitor bootstrap.
  // ?diag=1 freezes auto-redirect for on-device diagnostics.
  {
    const host =
      request.headers.get("host")?.split(":")[0]?.trim().toLowerCase() ?? "";
    if (
      shouldRedirectUnauthenticatedProToSignIn({
        pathname,
        hostname: host,
        authenticated: Boolean(session?.user),
        diagParam: request.nextUrl.searchParams.get("diag"),
      })
    ) {
      return redirectToSignIn(request, HOUZZATPRO_START_PATH, { pro: true });
    }
  }

  // HouzzatPro cold-start: workspace bootstrap handles authenticated routing.
  if (
    shellHint === "houzzatpro" &&
    (pathname === HOUZZATPRO_START_PATH || pathname === `${HOUZZATPRO_START_PATH}/`)
  ) {
    if (!session?.user) {
      return redirectToSignIn(request, HOUZZATPRO_START_PATH, { pro: true });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    if (!session?.user) {
      const callback = `${pathname}${request.nextUrl.search}`;
      return redirectToSignIn(request, callback, {
        pro: shellHint === "houzzatpro",
      });
    }
    // Staff only at middleware. Platform vs tenant Command Centre auth is
    // enforced in admin layout (hostname + WorkspaceMember OWNER/ADMIN).
    if (!isAgentRole(session.user.role)) {
      if (shellHint === "houzzatpro") {
        return redirectToPath(request, HOUZZATPRO_STAFF_ONLY_PATH);
      }
      return redirectToPath(request, "/account");
    }

    // Non-platform hosts: only tenant-safe /admin modules (layout enforces membership).
    const host =
      request.headers.get("host")?.split(":")[0]?.trim().toLowerCase() ?? "";
    const isPlatformRoot =
      host === "houzzatpro.com" || host === "www.houzzatpro.com";
    if (host && !isPlatformRoot) {
      const pathOnly = pathname.split("?")[0] || "/";
      const tenantAdminAllowed =
        pathOnly === "/admin" ||
        pathOnly === "/admin/mls" ||
        pathOnly === "/admin/lead-routing" ||
        pathOnly === "/admin/people" ||
        pathOnly === "/admin/analytics" ||
        pathOnly === "/admin/notifications" ||
        pathOnly === "/admin/search";
      if (!tenantAdminAllowed) {
        return redirectToPath(request, "/admin");
      }
    }
  }

  if (pathname.startsWith("/agent")) {
    if (!session?.user) {
      const callback = `${pathname}${request.nextUrl.search}`;
      return redirectToSignIn(request, callback, {
        pro: shellHint === "houzzatpro",
      });
    }
    if (!isAgentRole(session.user.role)) {
      if (shellHint === "houzzatpro") {
        if (isAdminRole(session.user.role)) {
          return redirectToPath(request, "/admin");
        }
        return redirectToPath(request, HOUZZATPRO_STAFF_ONLY_PATH);
      }
      return redirectToPath(request, "/account");
    }
  }

  if (pathname.startsWith("/account")) {
    if (!session?.user) {
      const callback = `${pathname}${request.nextUrl.search}`;
      return redirectToSignIn(request, callback, {
        pro: shellHint === "houzzatpro",
      });
    }
    // Web + HouzzatPro: staff account → CRM. Consumer Houzzat: stay on /account.
    if (shouldRedirectStaffAccountToCrm(shellHint)) {
      if (session.user.role === "AGENT") {
        return redirectToPath(request, "/agent");
      }
      if (session.user.role === "ADMIN") {
        return redirectToPath(request, "/admin");
      }
    }
  }

  if (pathname.startsWith("/owner")) {
    if (!session?.user) {
      const callback = `${pathname}${request.nextUrl.search}`;
      return redirectToSignIn(request, callback, {
        pro: shellHint === "houzzatpro",
      });
    }
    if (session.user.role === "AGENT") {
      // Consumer shell: do not dump agents into CRM via /owner either.
      if (shouldGateStaffRoutesForConsumerShell(shellHint)) {
        return redirectToPath(request, OPEN_HOUZZAT_PRO_PATH);
      }
      return redirectToPath(request, "/agent");
    }
    if (
      !canAccessSellerTools({
        role: session.user.role,
        isSeller: session.user.isSeller,
      })
    ) {
      return redirectToPath(request, "/account");
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-houzzat-request-path", pathname);
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("x-houzzat-request-path", pathname);
  return response;
});

export const config = {
  matcher: [
    /*
     * Match all paths except Next static assets and common image files.
     * Coming-soon gate + role guards run here.
     *
     * Exclude /api/auth/logout — Auth.js middleware re-issues session cookies
     * on Cloudflare Workers, which undoes hard cookie clears on sign-out.
     */
    "/((?!_next/static|_next/image|api/auth/logout|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
