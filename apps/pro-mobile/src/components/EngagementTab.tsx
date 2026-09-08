/**
 * Stage 4.9 / 5.4 — Native Engagement tab (web EngagementMatchboard parity).
 *
 * Matching listings: property detail, shortlist, DOM, multi-select, email to this lead.
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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { PropertyDetailModal } from "./PropertyDetailModal";
import { ShortlistButton } from "./ShortlistButton";
import { mobileApiClient } from "../api/client";
import { engagementMatchToListingCard } from "../lib/engagement-match";
import { unwrapEngagement } from "../lib/engagement-response";
import { isLeadEmailEligible } from "../lib/lead-email-eligibility";
import { unwrapShortlistEmail } from "../lib/property-response";
import { usePropertySavedListings } from "../hooks/usePropertySavedListings";
import {
  engagementCache,
  clearLeadEngagementCache,
} from "../lib/lead-tab-cache";
import { invalidateLeadDetailCacheEntry } from "../screens/LeadDetailScreen";
import type { MobileLeadEngagement } from "../types/lead";
import type { MobileLeadEngagementMatch } from "../types/lead";
import type { MobileListingCard } from "../types/property";
import { MAX_SHORTLIST_SIZE } from "../types/property";

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
  buyerIntent: {
    summary: string;
    chips: string[];
    source: string;
    sourceLabel: string;
    headline: string | null;
  } | null;
};

/** Max remote photos decoded at once — remaining matches are text rows. */
const MATCH_IMAGE_LIMIT = 6;

function formatPrice(value: number | null): string {
  if (value == null) return "—";
  return `$${value.toLocaleString("en-CA")}`;
}

function toProfileSummary(data: MobileLeadEngagement): EngagementProfileSummary {
  const hasIntent =
    data.buyerIntent.summary.trim().length > 0 ||
    data.buyerIntent.chips.length > 0 ||
    Boolean(data.buyerIntent.headline);
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
    buyerIntent: hasIntent ? data.buyerIntent : null,
  };
}

type EngagementTabProps = {
  leadId: string;
  workspaceId: string | undefined;
  customerEmail?: string | null;
  contactConsentAt?: string | null;
  customerCaslConsentAt?: string | null;
  emailAlertsEnabled?: boolean | null;
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
  isSelected,
  isSaved,
  shortlistPending,
  onOpen,
  onToggleSelect,
  onToggleShortlist,
}: {
  match: MobileLeadEngagementMatch;
  showImage: boolean;
  isSelected: boolean;
  isSaved: boolean;
  shortlistPending: boolean;
  onOpen: (match: MobileLeadEngagementMatch) => void;
  onToggleSelect: (mls: string) => void;
  onToggleShortlist: (mls: string) => void;
}) {
  const timing = match.timingLabel?.trim();
  const bathsText = match.baths != null ? `${match.baths} bath` : null;

  if (!showImage) {
    return (
      <TouchableOpacity
        style={[styles.matchRowCompact, isSelected && styles.matchSelected]}
        onPress={() => onOpen(match)}
        activeOpacity={0.85}
      >
        <TouchableOpacity
          style={[styles.checkBadgeInline, isSelected && styles.checkBadgeOn]}
          onPress={() => onToggleSelect(match.mlsNumber)}
          activeOpacity={0.85}
        >
          <Text style={[styles.checkBadgeText, isSelected && styles.checkBadgeTextOn]}>
            {isSelected ? "✓" : ""}
          </Text>
        </TouchableOpacity>
        <View style={styles.matchCompactBody}>
          <Text style={styles.matchPrice}>{formatPrice(match.listPrice)}</Text>
          <Text style={styles.matchAddress} numberOfLines={1}>
            {match.address}
          </Text>
          <Text style={styles.matchMeta}>
            {match.bedsLabel ? `${match.bedsLabel} bed` : null}
            {match.bedsLabel && bathsText ? " · " : ""}
            {bathsText ? bathsText : ""}
            {" · MLS "}
            {match.mlsNumber}
          </Text>
          {timing ? <Text style={styles.matchTiming}>{timing}</Text> : null}
        </View>
        <ShortlistButton
          saved={isSaved}
          pending={shortlistPending}
          compact
          onPress={() => onToggleShortlist(match.mlsNumber)}
        />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.matchCard, isSelected && styles.matchSelected]}
      onPress={() => onOpen(match)}
      activeOpacity={0.85}
    >
      <View style={styles.matchImageWrap}>
        {match.imageUrl ? (
          <Image
            source={{ uri: match.imageUrl }}
            style={styles.matchImage}
            resizeMode="cover"
            fadeDuration={0}
          />
        ) : (
          <View style={[styles.matchImage, styles.matchImagePlaceholder]}>
            <Text style={styles.matchImagePlaceholderText}>No photo</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.checkBadge, isSelected && styles.checkBadgeOn]}
          onPress={() => onToggleSelect(match.mlsNumber)}
          activeOpacity={0.85}
        >
          <Text style={[styles.checkBadgeText, isSelected && styles.checkBadgeTextOn]}>
            {isSelected ? "✓" : ""}
          </Text>
        </TouchableOpacity>
        <View style={styles.shortlistOverlay}>
          <ShortlistButton
            saved={isSaved}
            pending={shortlistPending}
            compact
            onPress={() => onToggleShortlist(match.mlsNumber)}
          />
        </View>
      </View>
      <Text style={styles.matchPrice}>{formatPrice(match.listPrice)}</Text>
      <Text style={styles.matchAddress} numberOfLines={2}>
        {match.address}
      </Text>
      <Text style={styles.matchMeta}>
        {match.bedsLabel ? `${match.bedsLabel} bed` : null}
        {match.bedsLabel && bathsText ? " · " : ""}
        {bathsText ? bathsText : ""}
      </Text>
      {timing ? <Text style={styles.matchTiming}>{timing}</Text> : null}
      <Text style={styles.matchMls}>MLS {match.mlsNumber}</Text>
    </TouchableOpacity>
  );
});

function EngagementTabInner({
  leadId,
  workspaceId,
  customerEmail,
  contactConsentAt,
  customerCaslConsentAt,
  emailAlertsEnabled,
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [sendPending, setSendPending] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [detailMatch, setDetailMatch] = useState<MobileLeadEngagementMatch | null>(
    null,
  );

  const {
    isSaved,
    toggleSaved,
    pendingMls,
    setSavedLocal,
  } = usePropertySavedListings(workspaceId);

  const emailEligibility = isLeadEmailEligible({
    customer: {
      email: customerEmail ?? undefined,
      caslConsentAt: customerCaslConsentAt ?? undefined,
      emailAlertsEnabled: emailAlertsEnabled ?? undefined,
    },
    contactConsentAt,
  });

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
    setSelected(new Set());
    setSendMsg(null);
    setNote("");
    setDetailMatch(null);
    const entry = cacheKey ? engagementCache.get(cacheKey) : undefined;
    if (entry?.engagement) {
      // Profile strip already loaded engagement — reuse cache; skip duplicate GET.
      setEngagement(entry.engagement);
      publishSummary(entry.engagement);
      setLoading(false);
      setError(null);
      return;
    }
    void fetchEngagement();
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

  const toggleMls = useCallback((mls: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(mls)) next.delete(mls);
      else {
        if (next.size >= MAX_SHORTLIST_SIZE) return prev;
        next.add(mls);
      }
      return next;
    });
  }, []);

  const openDetail = useCallback((match: MobileLeadEngagementMatch) => {
    setDetailMatch(match);
  }, []);

  const handleToggleShortlist = useCallback(
    (mls: string) => {
      void toggleSaved(mls);
    },
    [toggleSaved],
  );

  const handleEmailShortlist = useCallback(async () => {
    if (selected.size === 0 || sendPending) return;
    if (!emailEligibility.ok) {
      setSendMsg(emailEligibility.reason || "Cannot email this lead");
      return;
    }
    setSendPending(true);
    setSendMsg(null);
    try {
      const res = await mobileApiClient.post<unknown>(
        "/properties/shortlist-email",
        {
          leadId,
          mlsNumbers: [...selected],
          note: note.trim() || undefined,
        },
      );
      if (!res.ok) {
        setSendMsg(res.message || "Send failed");
        return;
      }
      const parsed = unwrapShortlistEmail(res.data);
      if (!parsed) {
        setSendMsg("Unexpected response");
        return;
      }
      if (workspaceId) {
        invalidateLeadDetailCacheEntry(workspaceId, leadId);
        clearLeadEngagementCache(workspaceId);
      }
      setSelected(new Set());
      setNote("");
      setSendMsg(
        parsed.stubbed
          ? `Shortlist ready (email stubbed in dev). ${parsed.count} homes.`
          : `Emailed ${parsed.count} homes with share link.`,
      );
      void fetchEngagement({ background: true });
    } finally {
      setSendPending(false);
    }
  }, [
    selected,
    sendPending,
    emailEligibility,
    leadId,
    note,
    workspaceId,
    fetchEngagement,
  ]);

  const detailPreview: MobileListingCard | null = detailMatch
    ? engagementMatchToListingCard(detailMatch)
    : null;

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
          <Text style={styles.matchHint}>
            Tap a home for details. Select homes to email a shortlist to this lead.
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
                  <MatchCard
                    key={m.mlsNumber}
                    match={m}
                    showImage
                    isSelected={selected.has(m.mlsNumber)}
                    isSaved={isSaved(m.mlsNumber)}
                    shortlistPending={pendingMls === m.mlsNumber}
                    onOpen={openDetail}
                    onToggleSelect={toggleMls}
                    onToggleShortlist={handleToggleShortlist}
                  />
                ))}
              </View>
              {compactMatches.length > 0 ? (
                <View style={styles.compactList}>
                  {compactMatches.map((m) => (
                    <MatchCard
                      key={m.mlsNumber}
                      match={m}
                      showImage={false}
                      isSelected={selected.has(m.mlsNumber)}
                      isSaved={isSaved(m.mlsNumber)}
                      shortlistPending={pendingMls === m.mlsNumber}
                      onOpen={openDetail}
                      onToggleSelect={toggleMls}
                      onToggleShortlist={handleToggleShortlist}
                    />
                  ))}
                </View>
              ) : null}

              {selected.size > 0 ? (
                <View style={styles.selectionPanel}>
                  <View style={styles.selectionTop}>
                    <Text style={styles.selectionCount}>
                      {selected.size} selected
                    </Text>
                    <TouchableOpacity onPress={() => setSelected(new Set())}>
                      <Text style={styles.clearText}>Clear</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder="Optional note for the lead…"
                    placeholderTextColor="#94A3B8"
                    style={styles.noteInput}
                    multiline
                    maxLength={2000}
                  />
                  <TouchableOpacity
                    style={[
                      styles.emailBtn,
                      (sendPending || !emailEligibility.ok) && styles.emailBtnDisabled,
                    ]}
                    disabled={sendPending || !emailEligibility.ok}
                    onPress={() => void handleEmailShortlist()}
                    activeOpacity={0.85}
                  >
                    {sendPending ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.emailBtnText}>Email shortlist</Text>
                    )}
                  </TouchableOpacity>
                  <Text style={styles.consentHint}>
                    {customerEmail?.trim() || "No email"} ·{" "}
                    {emailEligibility.ok ? "CASL ok" : emailEligibility.reason}
                  </Text>
                  {sendMsg ? <Text style={styles.sendMsg}>{sendMsg}</Text> : null}
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

      <PropertyDetailModal
        visible={detailMatch != null}
        preview={detailPreview}
        workspaceId={workspaceId}
        saved={detailMatch ? isSaved(detailMatch.mlsNumber) : false}
        savedPending={
          detailMatch != null && pendingMls === detailMatch.mlsNumber
        }
        onClose={() => setDetailMatch(null)}
        onToggleShortlist={handleToggleShortlist}
        onSavedChange={(mls, saved) => setSavedLocal(mls, saved)}
      />
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
  matchHint: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 8,
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
  matchSelected: {
    borderColor: "#2B6CB0",
    backgroundColor: "#EFF6FF",
  },
  matchImageWrap: {
    position: "relative",
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
  matchTiming: {
    marginHorizontal: 8,
    marginTop: 2,
    fontSize: 10,
    fontWeight: "600",
    color: "#64748B",
  },
  checkBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  checkBadgeInline: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 2,
  },
  checkBadgeOn: {
    borderColor: "#2B6CB0",
    backgroundColor: "#2B6CB0",
  },
  checkBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "transparent",
  },
  checkBadgeTextOn: {
    color: "#FFFFFF",
  },
  shortlistOverlay: {
    position: "absolute",
    bottom: 6,
    right: 6,
  },
  matchCompactBody: {
    flex: 1,
    minWidth: 0,
  },
  compactList: {
    gap: 6,
  },
  matchRowCompact: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  selectionPanel: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#93C5FD",
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 10,
  },
  selectionTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectionCount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E2A38",
  },
  clearText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  noteInput: {
    borderWidth: 1,
    borderColor: "#D8DEE6",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: "#1E2A38",
    minHeight: 64,
    textAlignVertical: "top",
  },
  emailBtn: {
    backgroundColor: "#2B6CB0",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  emailBtnDisabled: {
    opacity: 0.5,
  },
  emailBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  consentHint: {
    fontSize: 11,
    color: "#94A3B8",
  },
  sendMsg: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0F766E",
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
