import type { NextAuthConfig } from "next-auth";
import type { ActiveMode, Role } from "@prisma/client";
import { canAccessSellerTools, isAgentRole } from "@/lib/roles";

/** VOW-friendly idle timeout: cookie dies after 48h without activity. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 48;
/** Rolling refresh — active use extends the 48h window (at most hourly). */
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60;

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/auth/sign-in",
  },
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  jwt: {
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE_SECONDS,
        secure: process.env.NODE_ENV === "production",
      },
    },
    csrfToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Host-authjs.csrf-token"
          : "authjs.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    callbackUrl: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.callback-url"
          : "authjs.callback-url",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE_SECONDS,
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;
      const role = auth?.user?.role as Role | undefined;
      const isSeller = Boolean(auth?.user?.isSeller);

      if (pathname.startsWith("/admin")) {
        return isLoggedIn && role === "ADMIN";
      }

      if (pathname.startsWith("/agent")) {
        return isLoggedIn && isAgentRole(role);
      }

      if (pathname.startsWith("/account")) {
        return isLoggedIn;
      }

      if (pathname.startsWith("/owner")) {
        if (!isLoggedIn || !role) return false;
        if (role === "AGENT") return false;
        return canAccessSellerTools({ role, isSeller });
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.isBuyer = user.isBuyer ?? true;
        token.isSeller = user.isSeller ?? false;
        token.activeMode = user.activeMode ?? "BUYER";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = (token.role as Role) ?? "BUYER";
        session.user.isBuyer = Boolean(token.isBuyer ?? true);
        session.user.isSeller = Boolean(token.isSeller ?? false);
        session.user.activeMode =
          (token.activeMode as ActiveMode) === "SELLER" ? "SELLER" : "BUYER";
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
