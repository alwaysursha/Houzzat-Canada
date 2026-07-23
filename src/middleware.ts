import { auth } from "@/auth.edge";
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

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const session = request.auth;

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
  matcher: ["/admin/:path*", "/agent/:path*", "/account/:path*", "/owner/:path*"],
};
