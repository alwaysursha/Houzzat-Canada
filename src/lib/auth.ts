import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import type { Adapter } from "next-auth/adapters";
import type { Provider } from "next-auth/providers";
import { Role } from "@prisma/client";
import { authConfig } from "@/lib/auth.config";
import { isAdminRole, isAgentRole } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: Role;
    };
  }

  interface User {
    role: Role;
  }
}

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
        // Select only auth fields so missing optional User columns
        // (e.g. termsAcceptedAt before schema push) cannot break sign-in.
        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            role: true,
            password: true,
          },
        });

        if (!user?.password) {
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // Dual @auth/core versions from next-auth / prisma-adapter need a cast.
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
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role ?? Role.CUSTOMER;
        // Resolve role once at sign-in (JWT carries it afterward — avoid DB on every session).
        if (!user.role && user.email) {
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email },
            select: { role: true, name: true },
          });
          if (dbUser) {
            token.role = dbUser.role;
            if (dbUser.name) token.name = dbUser.name;
          }
        } else if (user.name) {
          token.name = user.name;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = (token.role as Role) ?? Role.CUSTOMER;
        if (typeof token.name === "string" && token.name) {
          session.user.name = token.name;
        }
      }
      return session;
    },
  },
});

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
