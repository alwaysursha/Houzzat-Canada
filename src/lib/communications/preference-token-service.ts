import { normalizeIdentityEmail } from "@/lib/auth/workspace-identity";
import { SITE_URL } from "@/lib/constants";
import { hashPreferenceToken } from "@/lib/communications/preference-token-crypto";
import {
  mintPreferenceTokenRecord,
  prismaCommunicationPreferenceTokenStore,
} from "@/lib/communications/preference-token-store";
import type {
  CommunicationPreferenceTokenPurpose,
  CommunicationPreferenceTokenStore,
  PreferenceTokenResolveError,
  ResolvedPreferenceToken,
} from "@/lib/communications/preference-token-types";
import { prisma } from "@/lib/prisma";
import { resolveCanonicalPublicOrigin } from "@/lib/tenancy/canonical-public-origin";

export type PreferenceTokenUserLookup = {
  findById(id: string): Promise<{
    id: string;
    email: string;
    workspaceId: string | null;
    emailAlertsEnabled: boolean;
    disabledAt: Date | null;
  } | null>;
};

const prismaUserLookup: PreferenceTokenUserLookup = {
  async findById(id) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        workspaceId: true,
        emailAlertsEnabled: true,
        disabledAt: true,
      },
    });
  },
};

export async function resolvePreferenceAccessToken(
  rawToken: string,
  input: {
    expectedPurpose: CommunicationPreferenceTokenPurpose;
    store?: CommunicationPreferenceTokenStore;
    users?: PreferenceTokenUserLookup;
    now?: Date;
  },
): Promise<
  | { ok: true; resolved: ResolvedPreferenceToken }
  | { ok: false; error: PreferenceTokenResolveError }
> {
  const trimmed = rawToken.trim();
  if (!trimmed || trimmed.length < 16) {
    return { ok: false, error: "invalid_token" };
  }
  const store = input.store ?? prismaCommunicationPreferenceTokenStore();
  const users = input.users ?? prismaUserLookup;
  const now = input.now ?? new Date();
  const record = await store.findByHash(hashPreferenceToken(trimmed));
  if (!record) return { ok: false, error: "invalid_token" };
  if (record.purpose !== input.expectedPurpose) {
    return { ok: false, error: "purpose_mismatch" };
  }
  if (record.revokedAt) return { ok: false, error: "revoked" };
  if (record.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, error: "expired" };
  }
  const user = await users.findById(record.userId);
  if (!user || user.disabledAt) {
    return { ok: false, error: "user_unavailable" };
  }
  if (!user.workspaceId || user.workspaceId !== record.workspaceId) {
    return { ok: false, error: "workspace_mismatch" };
  }
  if (normalizeIdentityEmail(user.email) !== record.emailNormalized) {
    return { ok: false, error: "email_mismatch" };
  }
  return {
    ok: true,
    resolved: {
      record,
      user: {
        id: user.id,
        email: user.email,
        workspaceId: user.workspaceId,
        emailAlertsEnabled: user.emailAlertsEnabled,
        disabledAt: user.disabledAt,
      },
    },
  };
}

/**
 * Mint a fresh hashed token for one email send. Does not reuse or reconstruct
 * any prior raw token. Older unrevoked tokens stay valid until expiry.
 * Expired rows for this user are deleted as best-effort cleanup.
 *
 * If the subsequent Resend call fails, the hashed row may remain until
 * expiration/cleanup. That is unused credential hash only — not recoverable
 * as a bearer token — and is accepted to avoid a Postgres/Resend transaction.
 */
export async function issuePreferenceAccessToken(input: {
  userId: string;
  workspaceId: string;
  email: string;
  purpose: CommunicationPreferenceTokenPurpose;
  source: string;
  store?: CommunicationPreferenceTokenStore;
  now?: Date;
}): Promise<{ rawToken: string; tokenId: string }> {
  const store = input.store ?? prismaCommunicationPreferenceTokenStore();
  const now = input.now ?? new Date();
  await store.deleteExpiredForUser({ userId: input.userId, now });
  const minted = mintPreferenceTokenRecord({
    purpose: input.purpose,
    userId: input.userId,
    workspaceId: input.workspaceId,
    emailNormalized: normalizeIdentityEmail(input.email),
    source: input.source,
    now,
  });
  const saved = await store.create(minted.record);
  return { rawToken: minted.rawToken, tokenId: saved.id };
}

export async function revokePreferenceTokensForEmailChange(input: {
  userId: string;
  store?: CommunicationPreferenceTokenStore;
  at?: Date;
}): Promise<number> {
  const store = input.store ?? prismaCommunicationPreferenceTokenStore();
  return store.revokeActiveForUser({
    userId: input.userId,
    at: input.at ?? new Date(),
  });
}

function hostnameFromSiteUrl(): string {
  try {
    return new URL(SITE_URL).hostname || "houzzat.com";
  } catch {
    return "houzzat.com";
  }
}

export async function resolvePreferencePublicOrigin(
  workspaceId: string,
): Promise<string> {
  return resolveCanonicalPublicOrigin(workspaceId, hostnameFromSiteUrl());
}

export function preferenceCenterPath(rawToken: string, action?: "unsubscribe") {
  const params = new URLSearchParams({ token: rawToken });
  if (action === "unsubscribe") params.set("action", "unsubscribe");
  return `/preferences/email?${params.toString()}`;
}

export function oneClickUnsubscribePath(rawToken: string) {
  const params = new URLSearchParams({ token: rawToken });
  return `/api/preferences/email/one-click?${params.toString()}`;
}

export function buildPreferenceCenterUrl(origin: string, rawToken: string) {
  return `${origin.replace(/\/$/, "")}${preferenceCenterPath(rawToken)}`;
}

export function buildUnsubscribeIntentUrl(origin: string, rawToken: string) {
  return `${origin.replace(/\/$/, "")}${preferenceCenterPath(rawToken, "unsubscribe")}`;
}

export function buildOneClickUnsubscribeUrl(origin: string, rawToken: string) {
  return `${origin.replace(/\/$/, "")}${oneClickUnsubscribePath(rawToken)}`;
}

export function listUnsubscribeHeaders(oneClickUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${oneClickUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function genericInvalidTokenStatus(
  error: PreferenceTokenResolveError,
): 401 {
  void error;
  return 401;
}
