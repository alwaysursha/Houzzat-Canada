/**
 * Stage 4.9 — Native Engagement tab (web CustomerProfile tab="engagement" parity).
 *
 * Observational read-only — same canonical data as web loadLeadSummary engagement fields.
 * Data: GET /api/mobile/v2/leads/[leadId]/engagement
 *
 * Performance:
 * - No nested ScrollView (parent LeadDetail ScrollView owns scrolling)
 * - Cap remote listing images (decode cost); remaining matches render as compact rows
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import { unwrapEngagement } from "../lib/engagement-response";
import {
  engagementCache,
  clearLeadEngagementCache,
} from "../lib/lead-tab-cache";
import type { MobileLeadEngagement, MobileLeadEngagementMatch } from "../types/api";

export { clearLeadEngagementCache };

/** Keep Lead Detail profile strip lightweight — not the full engagement payload. */
export type EngagementProfileSummary = {
  views24h: number;
  saves: number;
  alerts: number;
  emails: number;
  savedSearchCount: number;
  lastTouchAt: string;
  lastSeenAt: string | null;
  isOnline: boolean;
  rings: {
    emailOpens: number;
    emailClicks: number;
    alertOpens: number;
  };
};

/** Max remote photos decoded at once — remaining matches are text rows. */
const MATCH_IMAGE_LIMIT = 6;

function formatPrice(value: number | null): string {
  if (value == null) return "—";
  return `$${value.toLocaleString("en-CA")}`;
}

function toProfileSummary(data: MobileLeadEngagement): EngagementProfileSummary {
  return {
    views24h: data.hot.views24h,
    saves: data.stats.saves,
    alerts: data.stats.alerts,
    emails: data.stats.emails,
    savedSearchCount: data.stats.savedSearchCount,
    lastTouchAt: data.lastTouchAt,
    lastSeenAt: data.hot.lastSeenAt,
    isOnline: data.hot.isOnline,
    rings: data.rings,
  };
}

type EngagementTabProps = {
  leadId: string;
  workspaceId: string | undefined;
  onEngagementLoaded?: (summary: EngagementProfileSummary) => void;
};

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      {children}
    </View>
  );
}

function MlsChip({ mlsNumber }: { mlsNumber: string }) {
  return (
    <View style={styles.mlsChip}>
      <Text style={styles.mlsChipText}>{mlsNumber}</Text>
    </View>
  );
}

const MatchCard = memo(function MatchCard({
  match,
  showImage,
}: {
  match: MobileLeadEngagementMatch;
  showImage: boolean;
}) {
  if (!showImage) {
    return (
      <View style={styles.matchRowCompact}>
        <Text style={styles.matchPrice}>{formatPrice(match.listPrice)}</Text>
        <Text style={styles.matchAddress} numberOfLines={1}>
          {match.address}
        </Text>
        <Text style={styles.matchMls}>MLS {match.mlsNumber}</Text>
      </View>
    );
  }

  return (
    <View style={styles.matchCard}>
      {match.imageUrl ? (
        <Image
          source={{ uri: match.imageUrl }}
          style={styles.matchImage}
          resizeMode="cover"
          // Avoid blocking first paint with huge decode work.
          fadeDuration={0}
        />
      ) : (
        <View style={[styles.matchImage, styles.matchImagePlaceholder]}>
          <Text style={styles.matchImagePlaceholderText}>No photo</Text>
        </View>
      )}
      <Text style={styles.matchPrice}>{formatPrice(match.listPrice)}</Text>
      <Text style={styles.matchAddress} numberOfLines={2}>
        {match.address}
      </Text>
      {match.bedsLabel ? (
        <Text style={styles.matchMeta}>{match.bedsLabel}</Text>
      ) : null}
      <Text style={styles.matchMls}>MLS {match.mlsNumber}</Text>
    </View>
  );
});

function EngagementTabInner({
  leadId,
  workspaceId,
  onEngagementLoaded,
}: EngagementTabProps) {
  const cacheKey = workspaceId ? `${workspaceId}:${leadId}:engagement` : "";
  const cached = cacheKey ? engagementCache.get(cacheKey) : undefined;

  const [engagement, setEngagement] = useState<MobileLeadEngagement | null>(
    cached?.engagement ?? null,
  );
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persistCache = useCallback(
    (data: MobileLeadEngagement) => {
      if (!cacheKey) return;
      engagementCache.set(cacheKey, {
        engagement: data,
        timestamp: Date.now(),
      });
    },
    [cacheKey],
  );

  const publishSummary = useCallback(
    (data: MobileLeadEngagement) => {
      onEngagementLoaded?.(toProfileSummary(data));
    },
    [onEngagementLoaded],
  );

  const fetchEngagement = useCallback(
    async (opts?: { background?: boolean }) => {
      if (!opts?.background) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const res = await mobileApiClient.get<unknown>(
          `/leads/${encodeURIComponent(leadId)}/engagement`,
        );
        if (!res.ok) {
          setError(res.message || "Could not load engagement");
          return;
        }
        const parsed = unwrapEngagement(res.data);
        if (parsed) {
          setEngagement(parsed);
          persistCache(parsed);
          publishSummary(parsed);
        } else {
          setError("Invalid engagement response");
        }
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Could not load engagement",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [leadId, persistCache, publishSummary],
  );

  useEffect(() => {
    const entry = cacheKey ? engagementCache.get(cacheKey) : undefined;
    if (entry?.engagement) {
      setEngagement(entry.engagement);
      publishSummary(entry.engagement);
    }
    void fetchEngagement({ background: Boolean(entry) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tab mount / lead change
  }, [leadId, workspaceId]);

  const photoMatches = useMemo(
    () => (engagement?.matches ?? []).slice(0, MATCH_IMAGE_LIMIT),
    [engagement?.matches],
  );
  const compactMatches = useMemo(
    () => (engagement?.matches ?? []).slice(MATCH_IMAGE_LIMIT),
    [engagement?.matches],
  );

  if (loading && !engagement) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color="#1E2A38" />
        <Text style={styles.loadingText}>Loading engagement…</Text>
      </View>
    );
  }

  if (error && !engagement) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={() => void fetchEngagement()} activeOpacity={0.8}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!engagement) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>No engagement data.</Text>
      </View>
    );
  }

  const hasBuyerIntent =
    engagement.buyerIntent.summary.trim().length > 0 ||
    engagement.buyerIntent.chips.length > 0;

  const alertsInboxText =
    engagement.alerts.length === 0
      ? "None"
      : `${engagement.alerts.length} recent · latest: ${
          engagement.alerts[0]?.title || engagement.alerts[0]?.kind
        }`;

  const areaMonitorText =
    engagement.areaMonitors.length === 0
      ? "None"
      : engagement.areaMonitors
          .map((a) => a.name || a.city || a.id.slice(0, 8))
          .join(" · ");

  return (
    <View style={styles.wrap}>
      {refreshing ? (
        <Text style={styles.refreshHint}>Refreshing engagement…</Text>
      ) : null}

      <View style={styles.statGrid}>
        {(
          [
            ["Views (24h)", engagement.hot.views24h],
            ["Saved homes", engagement.stats.saves],
            ["Alerts", engagement.stats.alerts],
            ["Emails sent", engagement.stats.emails],
          ] as const
        ).map(([label, value]) => (
          <View key={label} style={styles.statCard}>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {hasBuyerIntent ? (
        <Panel title="Criteria · matches · shortlist">
          <Text style={styles.matchSectionTitle}>Match criteria</Text>
          {engagement.buyerIntent.sourceLabel ? (
            <Text style={styles.sourceLabel}>{engagement.buyerIntent.sourceLabel}</Text>
          ) : null}
          {engagement.buyerIntent.headline ? (
            <Text style={styles.headline}>{engagement.buyerIntent.headline}</Text>
          ) : null}
          <Text style={styles.summaryText}>{engagement.buyerIntent.summary}</Text>
          {engagement.buyerIntent.chips.length > 0 ? (
            <View style={styles.chipRow}>
              {engagement.buyerIntent.chips.map((chip) => (
                <View key={chip} style={styles.chip}>
                  <Text style={styles.chipText}>{chip}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <Text style={[styles.matchSectionTitle, styles.matchListTitle]}>
            Matching listings
          </Text>
          {!engagement.matchesLoaded ? (
            <Text style={styles.mutedText}>Loading matches…</Text>
          ) : engagement.matches.length === 0 ? (
            <Text style={styles.mutedText}>
              {hasBuyerIntent
                ? "No active listings match this criteria right now."
                : "Not enough browsing signal yet."}
            </Text>
          ) : (
            <View style={styles.matchSection}>
              <View style={styles.matchGrid}>
                {photoMatches.map((m) => (
                  <MatchCard key={m.mlsNumber} match={m} showImage />
                ))}
              </View>
              {compactMatches.length > 0 ? (
                <View style={styles.compactList}>
                  {compactMatches.map((m) => (
                    <MatchCard key={m.mlsNumber} match={m} showImage={false} />
                  ))}
                </View>
              ) : null}
            </View>
          )}
        </Panel>
      ) : null}

      <Panel title="Saved searches / homepage">
        {engagement.savedSearches.length === 0 ? (
          <Text style={styles.mutedText}>
            No saved searches yet — use “Save as search” above to create one from
            Looking for, or the customer can personalize their homepage.
          </Text>
        ) : (
          <View style={styles.stackGap}>
            {engagement.savedSearches.map((s) => (
              <View key={s.id} style={styles.savedSearchCard}>
                {s.isHomepageActive ? (
                  <Text style={styles.homepageBadge}>Active homepage search</Text>
                ) : null}
                <Text style={styles.savedSearchName}>{s.name}</Text>
                <Text style={styles.savedSearchMeta}>
                  Email alerts: {s.emailAlerts ? "On" : "Off"} · SMS alerts:{" "}
                  {s.smsAlerts ? "On" : "Off"}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Panel>

      <Panel title="Saved homes">
        {engagement.savedListings.length === 0 ? (
          <Text style={styles.mutedText}>None</Text>
        ) : (
          <View style={styles.chipWrap}>
            {engagement.savedListings.map((s) => (
              <MlsChip key={s.id} mlsNumber={s.mlsNumber} />
            ))}
          </View>
        )}
      </Panel>

      <Panel title="Property watches">
        {engagement.propertyMonitors.length === 0 ? (
          <Text style={styles.mutedText}>None</Text>
        ) : (
          <View style={styles.chipWrap}>
            {engagement.propertyMonitors.map((m) => (
              <MlsChip key={m.id} mlsNumber={m.mlsNumber} />
            ))}
          </View>
        )}
      </Panel>

      <Panel title="Area monitors">
        <Text style={styles.bodyText}>{areaMonitorText}</Text>
      </Panel>

      <Panel title="Route planner">
        {engagement.tours.length === 0 ? (
          <Text style={styles.mutedText}>No tours</Text>
        ) : (
          <View style={styles.stackGap}>
            {engagement.tours.map((t) => (
              <Text key={t.id} style={styles.bodyText}>
                {t.name} · {t.status} · {t.stops.length} stops
                {t.stops.length
                  ? ` (${t.stops.map((s) => s.mlsNumber).join(", ")})`
                  : ""}
              </Text>
            ))}
          </View>
        )}
      </Panel>

      <Panel title="Customer listing notes">
        {engagement.listingNotes.length === 0 ? (
          <Text style={styles.mutedText}>None</Text>
        ) : (
          <View style={styles.stackGap}>
            {engagement.listingNotes.map((n) => (
              <Text key={n.id} style={styles.bodyText}>
                <Text style={styles.noteMls}>{n.mlsNumber}</Text>:{" "}
                {n.body.slice(0, 120)}
              </Text>
            ))}
          </View>
        )}
      </Panel>

      <Panel title="Alerts inbox">
        <Text style={styles.bodyText}>{alertsInboxText}</Text>
      </Panel>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TouchableOpacity
        style={styles.refreshBtn}
        onPress={() => void fetchEngagement({ background: true })}
        activeOpacity={0.85}
        disabled={refreshing}
      >
        <Text style={styles.refreshBtnText}>
          {refreshing ? "Refreshing…" : "Refresh engagement"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export const EngagementTab = memo(EngagementTabInner);

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
    paddingBottom: 8,
  },
  loadingBox: {
    paddingVertical: 32,
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: "#64748B",
  },
  emptyBox: {
    paddingVertical: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: "#94A3B8",
  },
  errorText: {
    fontSize: 13,
    color: "#DC2626",
    textAlign: "center",
  },
  retryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2B6CB0",
  },
  refreshHint: {
    fontSize: 11,
    color: "#64748B",
    textAlign: "center",
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: "45%",
    backgroundColor: "#E0F2FE",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BAE6FD",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0C4A6E",
  },
  statLabel: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
    color: "#0284C7",
  },
  panel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
  },
  panelTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E2A38",
    marginBottom: 10,
  },
  matchSectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E2A38",
    marginBottom: 6,
  },
  matchListTitle: {
    marginTop: 12,
  },
  sourceLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 4,
  },
  headline: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F766E",
    marginBottom: 4,
  },
  summaryText: {
    fontSize: 13,
    color: "#475569",
    lineHeight: 18,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  chip: {
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#C7E0D4",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0F766E",
  },
  matchSection: {
    gap: 8,
  },
  matchGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  matchCard: {
    width: "48%",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    paddingBottom: 8,
  },
  matchImage: {
    width: "100%",
    height: 88,
    backgroundColor: "#F1F5F9",
  },
  matchImagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  matchImagePlaceholderText: {
    fontSize: 10,
    color: "#94A3B8",
  },
  matchPrice: {
    marginTop: 6,
    marginHorizontal: 8,
    fontSize: 13,
    fontWeight: "700",
    color: "#1E2A38",
  },
  matchAddress: {
    marginHorizontal: 8,
    fontSize: 11,
    color: "#475569",
  },
  matchMeta: {
    marginHorizontal: 8,
    marginTop: 2,
    fontSize: 11,
    color: "#64748B",
  },
  matchMls: {
    marginHorizontal: 8,
    marginTop: 2,
    fontSize: 10,
    fontWeight: "600",
    color: "#2B6CB0",
  },
  compactList: {
    gap: 6,
  },
  matchRowCompact: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  stackGap: {
    gap: 8,
  },
  savedSearchCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
    gap: 4,
  },
  homepageBadge: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#047857",
  },
  savedSearchName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E2A38",
  },
  savedSearchMeta: {
    fontSize: 11,
    color: "#64748B",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  mlsChip: {
    borderRadius: 6,
    backgroundColor: "#EEF2F6",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mlsChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2B6CB0",
  },
  bodyText: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 17,
  },
  noteMls: {
    fontWeight: "700",
    color: "#2B6CB0",
  },
  mutedText: {
    fontSize: 13,
    color: "#94A3B8",
  },
  refreshBtn: {
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  refreshBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2B6CB0",
  },
});
