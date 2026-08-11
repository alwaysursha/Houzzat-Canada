import NextAuth from "next-auth";
import { cache } from "react";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import type { Adapter } from "next-auth/adapters";
import type { Provider } from "next-auth/providers";
import type { ActiveMode } from "@prisma/client";
import { Role } from "@prisma/client";
import { authConfig } from "@/lib/auth.config";
import { recordActivityEvent } from "@/lib/analytics/record-activity";
import { isAdminRole, isAgentRole, resolveActiveMode } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

const providers: Provider[] = [
  Credentials({
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = credentials?.email?.toString().trim().toLowerCase();
      const password = credentials?.password?.toString() ?? "";

      if (!email || !password) {
        return null;
      }

      try {
        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            role: true,
            isBuyer: true,
            isSeller: true,
            activeMode: true,
            password: true,
            disabledAt: true,
          },
        });

        if (!user?.password) {
          return null;
        }

        if (user.disabledAt) {
          return null;
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          isBuyer: user.isBuyer,
          isSeller: user.isSeller,
          activeMode: user.activeMode,
        };
      } catch (error) {
        console.error("[auth] authorize failed", error);
        throw error;
      }
    },
  }),
];

function cleanEnv(value: string | undefined): string | undefined {
  return value?.trim().replace(/[\u200b-\u200d\ufeff]/g, "") || undefined;
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const googleClientId = cleanEnv(process.env.GOOGLE_CLIENT_ID);
  const googleClientSecret = cleanEnv(process.env.GOOGLE_CLIENT_SECRET);

  if (googleClientId && googleClientSecret) {
    providers.unshift(
      Google({
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        allowDangerousEmailAccountLinking: true,
      }),
    );
  }
}

const profileSelect = {
  id: true,
  role: true,
  name: true,
  isBuyer: true,
  isSeller: true,
  activeMode: true,
} as const;

function applyProfileToToken(
  token: {
    sub?: string;
    email?: string | null;
    name?: string | null;
    role?: Role;
    isBuyer?: boolean;
    isSeller?: boolean;
    activeMode?: ActiveMode;
    subVerifiedAt?: number;
  },
  dbUser: {
    id: string;
    role: Role;
    name: string | null;
    isBuyer: boolean;
    isSeller: boolean;
    activeMode: ActiveMode;
  },
  email: string,
) {
  token.sub = dbUser.id;
  token.email = email;
  token.role = dbUser.role;
  token.isBuyer = dbUser.isBuyer;
  token.isSeller = dbUser.isSeller;
  token.activeMode = resolveActiveMode(dbUser);
  if (dbUser.name) token.name = dbUser.name;
}

function isConsumerRoleSafe(role: Role) {
  return role === "BUYER" || role === "SELLER";
}

export const {
  handlers,
  auth: uncachedAuth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma) as Adapter,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }

      try {
        const parsed = new URL(url);
        if (parsed.origin === new URL(baseUrl).origin) {
          return url;
        }
      } catch {
        return baseUrl;
      }

      return baseUrl;
    },
    async jwt({ token, user, trigger, session }) {
      const emailFromUser =
        typeof user?.email === "string"
          ? user.email.trim().toLowerCase()
          : null;
      const emailFromToken =
        typeof token.email === "string"
          ? token.email.trim().toLowerCase()
          : null;
      const email = emailFromUser ?? emailFromToken;

      if (trigger === "update" && session && typeof session === "object") {
        // Force-reload role / buyer-seller flags (e.g. after team invite accept).
        if (
          "refreshProfile" in session &&
          session.refreshProfile &&
          email
        ) {
          try {
            const dbUser = await prisma.user.findUnique({
              where: { email },
              select: profileSelect,
            });
            if (dbUser) {
              applyProfileToToken(token, dbUser, email);
              token.subVerifiedAt = Date.now();
            }
          } catch (error) {
            console.error("[auth] refreshProfile failed", error);
          }
          return token;
        }

        const nextMode =
          "activeMode" in session && session.activeMode === "SELLER"
            ? "SELLER"
            : "activeMode" in session && session.activeMode === "BUYER"
              ? "BUYER"
              : null;
        if (nextMode && email) {
          try {
            const dbUser = await prisma.user.findUnique({
              where: { email },
              select: profileSelect,
            });
            if (dbUser) {
              const allowed =
                nextMode === "SELLER"
                  ? dbUser.isSeller || dbUser.role === "ADMIN"
                  : dbUser.isBuyer || isConsumerRoleSafe(dbUser.role);
              if (allowed) {
                await prisma.user.update({
                  where: { id: dbUser.id },
                  data: { activeMode: nextMode },
                });
                token.activeMode = nextMode;
              }
            }
          } catch (error) {
            console.error("[auth] activeMode update failed", error);
          }
        }
      }

      if (user && email) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { email },
            select: profileSelect,
          });
          if (dbUser) {
            applyProfileToToken(token, dbUser, email);
            void recordActivityEvent({
              type: "SIGN_IN",
              userId: dbUser.id,
              path: "/auth/sign-in",
              title: "Signed in",
            });
          } else {
            token.sub = user.id;
            token.email = email;
            token.role = user.role ?? Role.BUYER;
            token.isBuyer = user.isBuyer ?? true;
            token.isSeller = user.isSeller ?? false;
            token.activeMode = user.activeMode ?? "BUYER";
            if (user.name) token.name = user.name;
          }
        } catch (error) {
          console.error("[auth] jwt sign-in reconcile failed", error);
          token.sub = user.id;
          token.email = email;
          token.role = user.role ?? Role.BUYER;
          token.isBuyer = user.isBuyer ?? true;
          token.isSeller = user.isSeller ?? false;
          token.activeMode = user.activeMode ?? "BUYER";
        }
        token.subVerifiedAt = Date.now();
        return token;
      }

      if (user) {
        token.sub = user.id;
        token.role = user.role ?? Role.BUYER;
        token.isBuyer = user.isBuyer ?? true;
        token.isSeller = user.isSeller ?? false;
        token.activeMode = user.activeMode ?? "BUYER";
        if (user.name) token.name = user.name;
        token.subVerifiedAt = Date.now();
        return token;
      }

      if (!email) {
        return token;
      }

      const verifiedAt =
        typeof token.subVerifiedAt === "number" ? token.subVerifiedAt : 0;
      const RECHECK_MS = 5 * 60 * 1000;
      const needsRecheck =
        !token.sub ||
        token.isBuyer == null ||
        token.isSeller == null ||
        !token.activeMode ||
        Date.now() - verifiedAt > RECHECK_MS;

      if (!needsRecheck) {
        return token;
      }

      try {
        const dbUser = await prisma.user.findUnique({
          where: { email },
          select: profileSelect,
        });
        if (!dbUser) {
          console.warn("[auth] JWT email missing in DB; clearing session", email);
          return null;
        }
        if (token.sub !== dbUser.id) {
          console.info("[auth] healed stale JWT sub", {
            email,
            from: token.sub,
            to: dbUser.id,
          });
        }
        applyProfileToToken(token, dbUser, email);
        token.subVerifiedAt = Date.now();
      } catch (error) {
        console.error("[auth] jwt reconcile failed", error);
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = (token.role as Role) ?? Role.BUYER;
        session.user.isBuyer = Boolean(token.isBuyer ?? true);
        session.user.isSeller = Boolean(token.isSeller ?? false);
        session.user.activeMode =
          token.activeMode === "SELLER" ? "SELLER" : "BUYER";
        if (typeof token.email === "string" && token.email) {
          session.user.email = token.email;
        }
        if (typeof token.name === "string" && token.name) {
          session.user.name = token.name;
        }
      }
      return session;
    },
  },
});

/**
 * Request-scoped session for RSC / route handlers.
 * React.cache() dedupes repeated auth() within one request (e.g. SiteHeader + page).
 * Does not cache across requests — each request gets a fresh lookup.
 */
export const auth = cache(async () => uncachedAuth());

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();
  if (!isAdminRole(session.user.role)) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function requireAgent() {
  const session = await requireAuth();
  if (!isAgentRole(session.user.role)) {
    throw new Error("Forbidden");
  }
  return session;
}
