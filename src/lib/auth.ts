import NextAuth from "next-auth";
import { cache } from "react";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { Adapter } from "next-auth/adapters";
import type { Provider } from "next-auth/providers";
import type { ActiveMode } from "@prisma/client";
import { Role } from "@prisma/client";
import { authConfig } from "@/lib/auth.config";
import {
  buildSyntheticRequestFromHeaders,
  resolveAuthBaseOriginForRequest,
  resolveAuthRedirectUrl,
} from "@/lib/tenancy/auth-origin";
import { recordActivityEvent } from "@/lib/analytics/record-activity";
import { mobileWorkspaceHandoffProvider } from "@/lib/auth/mobile-handoff-provider";
import {
  authorizeEmailVerificationToken,
} from "@/lib/auth/verify-email-provider";
import { VERIFY_EMAIL_PROVIDER_ID } from "@/lib/auth/verify-email-constants";
import {
  findNullWorkspaceUserByEmail,
  findTenantUserByEmail,
  normalizeIdentityEmail,
} from "@/lib/auth/workspace-identity";
import {
  assertTokenWorkspaceBinding,
  resolveHostnameWorkspaceForAuth,
} from "@/lib/auth/session-workspace-binding";
import { isAdminRole, isAgentRole, resolveActiveMode } from "@/lib/roles";
import { scheduleNotifyCustomerCameOnlineFromSignIn } from "@/lib/notifications/staff-events";
import { prisma } from "@/lib/prisma";
import { validateTenantCredentialsAuth } from "@/lib/tenancy/tenant-auth-boundary";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import { isPlatformMobileBootstrapHost } from "@/lib/mobile/platform-bootstrap";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";
import {
  AUTH_BUILD_MARKER,
  recordAuthServerDiagnostic,
} from "@/lib/auth/auth-diagnostic-buffer";

const providers: Provider[] = [
  Credentials({
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials, request) {
      const email = normalizeIdentityEmail(
        credentials?.email?.toString() ?? "",
      );
      const password = credentials?.password?.toString() ?? "";

      if (!email || !password) {
        return null;
      }

      const diagId = `auth_diag_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const synthetic =
        (await buildSyntheticRequestFromHeaders().catch(() => null)) ?? request;
      const incomingHost =
        synthetic?.headers.get("host") ?? request?.headers?.get?.("host") ?? null;
      const requestUrlHost = request
        ? (() => {
            try {
              return new URL(request.url).hostname;
            } catch {
              return null;
            }
          })()
        : null;
      const resolvedAuthHostname = synthetic
        ? extractTrustedRequestHostname(synthetic)
        : null;
      const isPlatform = isPlatformMobileBootstrapHost(resolvedAuthHostname);
      const userAgent = synthetic?.headers.get("user-agent") ?? "";
      const isNative =
        userAgent.includes("HouzzatNative/1") ||
        userAgent.includes("com.houzzat.pro");

      try {
        const hostWs = await resolveHostnameWorkspaceForAuth(synthetic);
        if (!hostWs.ok) {
          recordAuthServerDiagnostic({
            diagId,
            timestamp: new Date().toISOString(),
            buildMarker: AUTH_BUILD_MARKER,
            incomingHost,
            requestUrlHost,
            resolvedAuthHostname,
            isPlatformHost: isPlatform,
            nativeShell: isNative,
            userAgentSnippet: userAgent ? `${userAgent.slice(0, 40)}...` : null,
            userFound: false,
            passwordMatch: "SKIPPED",
            tenantValidationInvoked: false,
            tenantValidationReason: "unknown_tenant_workspace",
            authorizeResult: "REJECT",
            signInCallbackResult: "NOT_REACHED",
            userIdMasked: null,
          });
          return null;
        }

        // Phase 3: tenant → (workspaceId, email); platform → NULL workspaceId only.
        const user = hostWs.isPlatform
          ? await findNullWorkspaceUserByEmail(email)
          : await findTenantUserByEmail(hostWs.workspaceId, email);

        if (!user?.password || user.disabledAt) {
          recordAuthServerDiagnostic({
            diagId,
            timestamp: new Date().toISOString(),
            buildMarker: AUTH_BUILD_MARKER,
            incomingHost,
            requestUrlHost,
            resolvedAuthHostname,
            isPlatformHost: isPlatform,
            nativeShell: isNative,
            userAgentSnippet: userAgent ? `${userAgent.slice(0, 40)}...` : null,
            userFound: !!user,
            passwordMatch: "SKIPPED",
            tenantValidationInvoked: false,
            tenantValidationReason: !user ? "user_not_found" : "disabled_or_no_password",
            authorizeResult: "REJECT",
            signInCallbackResult: "NOT_REACHED",
            userIdMasked: user?.id ? `***${user.id.slice(-3)}` : null,
          });
          return null;
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
          recordAuthServerDiagnostic({
            diagId,
            timestamp: new Date().toISOString(),
            buildMarker: AUTH_BUILD_MARKER,
            incomingHost,
            requestUrlHost,
            resolvedAuthHostname,
            isPlatformHost: isPlatform,
            nativeShell: isNative,
            userAgentSnippet: userAgent ? `${userAgent.slice(0, 40)}...` : null,
            userFound: true,
            passwordMatch: "NO_MATCH",
            tenantValidationInvoked: false,
            tenantValidationReason: "password_mismatch",
            authorizeResult: "REJECT",
            signInCallbackResult: "NOT_REACHED",
            userIdMasked: `***${user.id.slice(-3)}`,
          });
          return null;
        }

        const authCheck = await validateTenantCredentialsAuth({
          userId: user.id,
          userRole: user.role,
          request: synthetic,
        });

        recordAuthServerDiagnostic({
          diagId,
          timestamp: new Date().toISOString(),
          buildMarker: AUTH_BUILD_MARKER,
          incomingHost,
          requestUrlHost,
          resolvedAuthHostname,
          isPlatformHost: isPlatform,
          nativeShell: isNative,
          userAgentSnippet: userAgent ? `${userAgent.slice(0, 40)}...` : null,
          userFound: true,
          passwordMatch: "MATCH",
          tenantValidationInvoked: true,
          tenantValidationReason: authCheck.ok ? "AUTHORIZED" : authCheck.reason,
          authorizeResult: authCheck.ok ? "ACCEPT" : "REJECT",
          signInCallbackResult: authCheck.ok ? "ALLOW" : "NOT_REACHED",
          userIdMasked: `***${user.id.slice(-3)}`,
        });

        if (!authCheck.ok) {
          const rawHost = synthetic ? extractTrustedRequestHostname(synthetic) : null;
          console.error("[auth] validateTenantCredentialsAuth denied authorize", {
            diagId,
            host: rawHost,
            nativeShell: isNative ? "yes" : "no",
            userIdMasked: `***${user.id.slice(-3)}`,
            reason: authCheck.reason,
          });
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
          workspaceId: hostWs.isPlatform
            ? null
            : (authCheck.workspaceId ?? user.workspaceId ?? hostWs.workspaceId),
        };
      } catch (error) {
        console.error("[auth] authorize failed", error);
        throw error;
      }
    },
  }),
  Credentials({
    id: VERIFY_EMAIL_PROVIDER_ID,
    name: "Email verification",
    credentials: {
      token: { label: "Token", type: "text" },
    },
    async authorize(credentials, request) {
      const token = credentials?.token?.toString() ?? "";
      const user = await authorizeEmailVerificationToken(token);
      if (!user) {
        return null;
      }

      const synthetic =
        (await buildSyntheticRequestFromHeaders().catch(() => null)) ?? request;
      const authCheck = await validateTenantCredentialsAuth({
        userId: user.id,
        userRole: user.role,
        request: synthetic,
      });
      if (!authCheck.ok) {
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
        workspaceId: authCheck.workspaceId ?? user.workspaceId ?? null,
      };
    },
  }),
  mobileWorkspaceHandoffProvider,
];

/**
 * Phase 3 OAuth decision: DISABLE tenant Google/social OAuth for V1 launch.
 * Do NOT enable allowDangerousEmailAccountLinking — it links by global email
 * and would cross workspace boundaries once duplicate emails exist.
 */
void process.env.GOOGLE_CLIENT_ID;
void process.env.GOOGLE_CLIENT_SECRET;

const profileSelect = {
  id: true,
  role: true,
  name: true,
  isBuyer: true,
  isSeller: true,
  activeMode: true,
  workspaceId: true,
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
    workspaceId?: string | null;
    isPlatformSession?: boolean;
    subVerifiedAt?: number;
  },
  dbUser: {
    id: string;
    role: Role;
    name: string | null;
    isBuyer: boolean;
    isSeller: boolean;
    activeMode: ActiveMode;
    workspaceId: string | null;
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
  token.workspaceId = dbUser.workspaceId;
  token.isPlatformSession = dbUser.workspaceId == null;
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
    async signIn({ user, account }) {
      if (!user?.id) return false;
      if (account?.provider === "mobile-workspace-handoff") {
        return true;
      }
      if (
        account?.provider &&
        account.provider !== "credentials" &&
        account.provider !== VERIFY_EMAIL_PROVIDER_ID
      ) {
        return false;
      }
      const synthetic = await buildSyntheticRequestFromHeaders();
      const authCheck = await validateTenantCredentialsAuth({
        userId: user.id,
        userRole: user.role,
        request: synthetic,
      });

      if (!authCheck.ok) {
        return false;
      }
      return true;
    },
    async redirect({ url, baseUrl }) {
      const synthetic = await buildSyntheticRequestFromHeaders();
      const requestOrigin = await resolveAuthBaseOriginForRequest(synthetic);
      return resolveAuthRedirectUrl(url, requestOrigin || baseUrl);
    },
    async jwt({ token, user, trigger, session }) {
      const emailFromUser =
        typeof user?.email === "string"
          ? normalizeIdentityEmail(user.email)
          : null;
      const emailFromToken =
        typeof token.email === "string"
          ? normalizeIdentityEmail(token.email)
          : null;
      const email = emailFromUser ?? emailFromToken;

      if (user) {
        const ws =
          "workspaceId" in user
            ? (user.workspaceId as string | null | undefined)
            : undefined;
        if (ws !== undefined) {
          token.workspaceId = ws ?? null;
          token.isPlatformSession = ws == null;
        }
      }

      try {
        const synthetic = await buildSyntheticRequestFromHeaders();
        const hostWs = await resolveHostnameWorkspaceForAuth(synthetic);
        if (hostWs.ok && token.sub) {
          let binding = assertTokenWorkspaceBinding({
            tokenWorkspaceId: token.workspaceId as string | null | undefined,
            isPlatformSession: token.isPlatformSession as boolean | undefined,
            hostnameIsPlatform: hostWs.isPlatform,
            hostnameWorkspaceId: hostWs.workspaceId,
          });

          // Phase 3 cutover: legacy JWTs lack workspaceId. Never accept them unbound
          // on a tenant host (cross-tenant bypass). Upgrade in-place ONLY when the
          // DB User.workspaceId exactly matches the hostname workspace.
          if (
            !binding.ok &&
            !hostWs.isPlatform &&
            binding.reason === "missing_token_workspace"
          ) {
            const dbUser = await prisma.user.findUnique({
              where: { id: token.sub as string },
              select: profileSelect,
            });
            if (
              dbUser?.workspaceId &&
              dbUser.workspaceId === hostWs.workspaceId
            ) {
              applyProfileToToken(
                token,
                dbUser,
                email ??
                  (typeof token.email === "string"
                    ? token.email
                    : dbUser.id),
              );
              binding = {
                ok: true,
                isPlatform: false,
                workspaceId: hostWs.workspaceId,
              };
            }
          }

          if (!binding.ok) {
            console.warn(
              "[auth] JWT workspace binding rejected",
              binding.reason,
            );
            return null;
          }
        }
      } catch (error) {
        console.error("[auth] JWT workspace binding check failed", error);
      }

      if (trigger === "update" && session && typeof session === "object") {
        if (
          "refreshProfile" in session &&
          session.refreshProfile &&
          token.sub
        ) {
          try {
            const dbUser = await prisma.user.findUnique({
              where: { id: token.sub as string },
              select: profileSelect,
            });
            if (dbUser && email) {
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
        if (nextMode && token.sub) {
          try {
            const dbUser = await prisma.user.findUnique({
              where: { id: token.sub as string },
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
            where: { id: user.id },
            select: profileSelect,
          });
          if (dbUser) {
            applyProfileToToken(token, dbUser, email);
            await recordActivityEvent({
              type: "SIGN_IN",
              userId: dbUser.id,
              path: "/auth/sign-in",
              title: "Signed in",
            });
            let onlineWorkspaceId: string | null = null;
            const signInRequest = await buildSyntheticRequestFromHeaders();
            if (signInRequest) {
              try {
                const tenancy = await resolveRequestTenancy(signInRequest);
                onlineWorkspaceId = tenancy.ok ? tenancy.workspaceId : null;
              } catch {
                onlineWorkspaceId = null;
              }
            }
            scheduleNotifyCustomerCameOnlineFromSignIn(
              dbUser.id,
              dbUser.role,
              onlineWorkspaceId,
            );
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

      if (!token.sub) {
        return token;
      }

      const verifiedAt =
        typeof token.subVerifiedAt === "number" ? token.subVerifiedAt : 0;
      const RECHECK_MS = 5 * 60 * 1000;
      const needsRecheck =
        token.isBuyer == null ||
        token.isSeller == null ||
        !token.activeMode ||
        Date.now() - verifiedAt > RECHECK_MS;

      if (!needsRecheck) {
        return token;
      }

      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub as string },
          select: profileSelect,
        });
        if (!dbUser) {
          console.warn("[auth] JWT sub missing in DB; clearing session", token.sub);
          return null;
        }
        applyProfileToToken(
          token,
          dbUser,
          email ?? (typeof token.email === "string" ? token.email : dbUser.id),
        );
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
        session.user.workspaceId =
          (token.workspaceId as string | null | undefined) ?? null;
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
