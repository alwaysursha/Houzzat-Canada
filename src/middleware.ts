import { auth } from "@/auth.edge";
import { isComingSoonEnabled } from "@/lib/coming-soon";
import { isVowOnlyMlsMode } from "@/lib/proptx/config";
import { NextResponse, type NextRequest } from "next/server";

function redirectToSignIn(request: NextRequest, callbackPath: string) {
  const signInUrl = request.nextUrl.clone();
  signInUrl.pathname = "/auth/sign-in";
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
  if (pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/auth/")) return true;
  if (pathname.startsWith("/admin")) return true;
  if (pathname.startsWith("/agent")) return true;
  if (pathname.startsWith("/account")) return true;
  if (pathname.startsWith("/owner")) return true;
  if (pathname.startsWith("/images/")) return true;
  if (pathname === "/favicon.ico") return true;
  if (pathname === "/robots.txt") return true;
  return false;
}

function isPublicFsboSearch(request: NextRequest) {
  return request.nextUrl.searchParams.get("dataSource") === "fsbo";
}

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const session = request.auth;

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
      return redirectToSignIn(request, callback);
    }
  }

  if (pathname.startsWith("/admin")) {
    if (!session?.user) {
      return redirectToSignIn(request, pathname);
    }
    if (session.user.role !== "ADMIN") {
      return redirectToPath(request, "/account");
    }
  }

  if (pathname.startsWith("/agent")) {
    if (!session?.user) {
      return redirectToSignIn(request, pathname);
    }
    if (session.user.role !== "AGENT" && session.user.role !== "ADMIN") {
      return redirectToPath(request, "/account");
    }
  }

  if (pathname.startsWith("/account")) {
    if (!session?.user) {
      return redirectToSignIn(request, pathname);
    }
    if (session.user.role === "AGENT") {
      return redirectToPath(request, "/agent");
    }
    if (session.user.role === "ADMIN") {
      return redirectToPath(request, "/admin");
    }
  }

  if (pathname.startsWith("/owner")) {
    if (!session?.user) {
      return redirectToSignIn(request, pathname);
    }
    if (session.user.role === "AGENT") {
      return redirectToPath(request, "/agent");
    }
  }

  return NextResponse.next();
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
    "/((?!_next/static|_next/image|api/auth/logout|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
