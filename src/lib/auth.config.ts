import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

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

      if (pathname.startsWith("/admin")) {
        return isLoggedIn && role === "ADMIN";
      }

      if (pathname.startsWith("/agent")) {
        return isLoggedIn && (role === "AGENT" || role === "ADMIN");
      }

      if (pathname.startsWith("/account")) {
        return isLoggedIn;
      }

      if (pathname.startsWith("/owner")) {
        return isLoggedIn;
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = (token.role as Role) ?? "CUSTOMER";
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
