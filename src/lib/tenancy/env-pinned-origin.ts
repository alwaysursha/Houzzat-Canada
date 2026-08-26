/**
 * Stage 3K.5.2 — isolate env-pinned site/auth origins (production still houzzat.com).
 *
 * NEXTAUTH_URL / NEXT_PUBLIC_SITE_URL remain set on the Worker until a later deploy
 * unsets them so Auth.js trustHost can derive per-request origins at the edge.
 */
import { SITE_URL } from "@/lib/constants";

function cleanEnv(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/[\u200b-\u200d\ufeff]/g, "");
  return trimmed || null;
}

/** Production Worker pins https://houzzat.com today. */
export function readEnvPinnedSiteUrl(): string {
  return cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) ?? SITE_URL;
}

/** Auth.js env fallback — still houzzat.com in production until deploy cutover. */
export function readEnvPinnedAuthUrl(): string {
  return (
    cleanEnv(process.env.AUTH_URL) ??
    cleanEnv(process.env.NEXTAUTH_URL) ??
    readEnvPinnedSiteUrl()
  );
}

export function readEnvPinnedSiteOrigin(): string {
  try {
    const url = new URL(readEnvPinnedSiteUrl());
    return url.origin;
  } catch {
    return readEnvPinnedSiteUrl();
  }
}

export function readEnvPinnedAuthOrigin(): string {
  try {
    const url = new URL(readEnvPinnedAuthUrl());
    return url.origin;
  } catch {
    return readEnvPinnedSiteOrigin();
  }
}

/** Operator doc — env pins override trustHost until unset on deploy. */
export const ENV_PINNED_ORIGIN_DOC = {
  siteEnvKey: "NEXT_PUBLIC_SITE_URL",
  authEnvKeys: ["AUTH_URL", "NEXTAUTH_URL"] as const,
  productionValueToday: "https://houzzat.com",
  deployStep:
    "Unset NEXTAUTH_URL/AUTH_URL on Worker so Auth.js trustHost uses request Host",
} as const;
