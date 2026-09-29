import { prisma as defaultPrisma } from "@/lib/prisma";

/** Public tag IDs for the workspace website already resolved by tenancy. */
export type WorkspaceTrackingIds = {
  ga4MeasurementId: string | null;
  googleAdsId: string | null;
  metaPixelId: string | null;
};

export const EMPTY_WORKSPACE_TRACKING: WorkspaceTrackingIds = {
  ga4MeasurementId: null,
  googleAdsId: null,
  metaPixelId: null,
};

const GA4_MEASUREMENT_ID = /^G-[A-Z0-9]+$/;
const GOOGLE_ADS_ID = /^AW-\d+$/;
const META_PIXEL_ID = /^\d{5,20}$/;

type TrackingRow = {
  ga4MeasurementId: string | null;
  googleAdsId: string | null;
  metaPixelId: string | null;
};

type TrackingLookup = {
  workspaceTracking: {
    findUnique(args: {
      where: { workspaceId: string };
      select: {
        ga4MeasurementId: true;
        googleAdsId: true;
        metaPixelId: true;
      };
    }): Promise<TrackingRow | null>;
  };
};

function acceptedId(value: string | null | undefined, pattern: RegExp): string | null {
  const trimmed = value?.trim() ?? "";
  return pattern.test(trimmed) ? trimmed : null;
}

/** Drops blank and malformed IDs so they cannot be written into a script tag. */
export function workspaceTrackingIds(
  row: Partial<TrackingRow> | null | undefined,
): WorkspaceTrackingIds {
  return {
    ga4MeasurementId: acceptedId(row?.ga4MeasurementId, GA4_MEASUREMENT_ID),
    googleAdsId: acceptedId(row?.googleAdsId, GOOGLE_ADS_ID),
    metaPixelId: acceptedId(row?.metaPixelId, META_PIXEL_ID),
  };
}

export type GoogleTagInstall = {
  src: string;
  config: string;
};

/**
 * GA4 config is only the workspace measurement ID.
 * An Ads tag may load gtag.js without configuring GA4.
 */
export function googleTagInstall(ids: WorkspaceTrackingIds): GoogleTagInstall | null {
  const configs = [
    ids.ga4MeasurementId ? `gtag('config','${ids.ga4MeasurementId}');` : null,
    ids.googleAdsId ? `gtag('config','${ids.googleAdsId}');` : null,
  ].filter((line): line is string => line !== null);
  if (configs.length === 0) return null;
  const loaderId = ids.ga4MeasurementId ?? ids.googleAdsId;
  if (!loaderId) return null;
  return {
    src: `https://www.googletagmanager.com/gtag/js?id=${loaderId}`,
    config: configs.join(""),
  };
}

function isMissingTrackingTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "P2021") return true;
  const message = error instanceof Error ? error.message : "";
  return message.includes("WorkspaceTracking") && message.includes("does not exist");
}

/**
 * Tracking for the workspace the marketing shell already resolved.
 * A missing table or row loads no tags. Unexpected database errors still throw.
 */
export async function resolveWorkspaceTracking(
  workspaceId: string,
  db: TrackingLookup = defaultPrisma,
): Promise<WorkspaceTrackingIds> {
  try {
    const row = await db.workspaceTracking.findUnique({
      where: { workspaceId },
      select: {
        ga4MeasurementId: true,
        googleAdsId: true,
        metaPixelId: true,
      },
    });
    return workspaceTrackingIds(row);
  } catch (error) {
    if (isMissingTrackingTable(error)) return EMPTY_WORKSPACE_TRACKING;
    throw error;
  }
}
