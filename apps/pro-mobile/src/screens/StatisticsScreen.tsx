/**
 * Stage 5.9 — Native Agent Statistics (web /agent/statistics parity).
 *
 * Reuses canonical loadAgentStatistics metrics only.
 * No invented conversion rates. No inbound email metrics. No Recharts.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import {
  clearStatisticsCache,
  statisticsCache,
  statisticsCacheKey,
} from "../lib/lead-tab-cache";
import {
  emptyAgentStatistics,
  formatResponseMins,
  type MobileAgentStatistics,
  unwrapStatistics,
} from "../lib/statistics-response";
import { useAuth } from "../state/AuthContext";

const RANGES = [7, 30, 90] as const;

type StatisticsScreenProps = {
  onBack: () => void;
};

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      {hint ? <Text style={styles.kpiHint}>{hint}</Text> : null}
    </View>
  );
}

function CountRow({
  label,
  count,
  max,
}: {
  label: string;
  count: number;
  max: number;
}) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <View style={styles.countRow}>
      <View style={styles.countRowHeader}>
        <Text style={styles.countLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.countValue}>{count}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }]} />
      </View>
    </View>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function StatisticsScreen({ onBack }: StatisticsScreenProps) {
  const { activeWorkspace, user } = useAuth();
  const workspaceId = activeWorkspace?.id;
  const userId = user?.id;

  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(30);
  const cacheKey =
    workspaceId && userId
      ? statisticsCacheKey(workspaceId, userId, rangeDays)
      : "";
  const initialCached = cacheKey ? statisticsCache.get(cacheKey) : undefined;

  const [data, setData] = useState<MobileAgentStatistics>(
    initialCached?.statistics ?? emptyAgentStatistics(rangeDays, "…"),
  );
  const [loading, setLoading] = useState(!initialCached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { soft?: boolean; hasCached?: boolean }) => {
      const soft = opts?.soft === true;
      if (!soft) setLoading(true);
      setRefreshError(null);
      try {
        const res = await mobileApiClient.get<unknown>(
          `/statistics?range=${rangeDays}`,
        );
        if (!res.ok) {
          const msg = res.message || "Couldn't load statistics";
          if (opts?.hasCached) setRefreshError(msg);
          else setError(msg);
          return;
        }
        const stats = unwrapStatistics(res.data);
        if (!stats) {
          setError("Invalid statistics response");
          return;
        }
        setData(stats);
        setError(null);
        if (cacheKey) {
          statisticsCache.set(cacheKey, {
            statistics: stats,
            rangeDays,
            timestamp: Date.now(),
          });
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Network error loading statistics";
        if (opts?.hasCached) setRefreshError(msg);
        else setError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [rangeDays, cacheKey],
  );

  useEffect(() => {
    const entry = cacheKey ? statisticsCache.get(cacheKey) : undefined;
    if (entry) {
      setData(entry.statistics);
      setLoading(false);
    } else {
      setLoading(true);
      setData(emptyAgentStatistics(rangeDays, "…"));
    }
    void load({ soft: Boolean(entry), hasCached: Boolean(entry) });
  }, [rangeDays, workspaceId, userId, cacheKey, load]);

  const kpis = data.kpis;
  const maxPipeline = Math.max(...data.pipeline.map((p) => p.count), 1);
  const maxSource = Math.max(...data.sources.map((s) => s.count), 1);
  const maxFunnel = Math.max(...data.funnel.map((f) => f.count), 1);
  const maxBucket = Math.max(...data.responseBuckets.map((b) => b.count), 1);
  const maxIntent = Math.max(...data.intentMix.map((i) => i.count), 1);

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={onBack}
          activeOpacity={0.75}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          Statistics
        </Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              if (workspaceId) clearStatisticsCache(workspaceId);
              void load({ soft: true, hasCached: true });
            }}
            colors={["#0F6B4C"]}
            tintColor="#0F6B4C"
          />
        }
      >
        <Text style={styles.scopeText}>
          {data.scopeLabel} · last {data.rangeDays} days
        </Text>

        <View style={styles.rangeRow}>
          {RANGES.map((days) => {
            const active = rangeDays === days;
            return (
              <TouchableOpacity
                key={days}
                style={[styles.rangeChip, active && styles.rangeChipActive]}
                onPress={() => setRangeDays(days)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.rangeChipText,
                    active && styles.rangeChipTextActive,
                  ]}
                >
                  {days}d
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {refreshError ? (
          <View style={styles.refreshBanner}>
            <Text style={styles.refreshBannerText}>
              Couldn't refresh statistics.
            </Text>
            <TouchableOpacity onPress={() => void load({ soft: true, hasCached: true })}>
              <Text style={styles.refreshRetry}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {loading && data.scopeLabel === "…" ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#0F6B4C" />
            <Text style={styles.muted}>Loading desk statistics…</Text>
          </View>
        ) : error && data.scopeLabel === "…" ? (
          <View style={styles.loadingBox}>
            <Text style={styles.errorTitle}>{error}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => void load()}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.blockTitle}>Overview</Text>
            <View style={styles.kpiGrid}>
              <KpiCard
                label="Leads (period)"
                value={kpis.leadsPeriod}
                hint={`${kpis.leadsToday} today · ${kpis.leadsTotal} all-time`}
              />
              <KpiCard
                label="Response rate"
                value={`${kpis.responseRate}%`}
                hint={`${kpis.newWaiting} still new · not stage conversion`}
              />
              <KpiCard
                label="Avg response"
                value={formatResponseMins(kpis.avgResponseMins)}
                hint={`Median ${formatResponseMins(kpis.medianResponseMins)}`}
              />
              <KpiCard
                label="Hot now"
                value={kpis.hotLeads}
                hint="High-intent working leads"
              />
              <KpiCard
                label="Emails sent"
                value={kpis.emailsPeriod}
                hint="Outbound CRM email"
              />
              <KpiCard
                label="Appointments"
                value={kpis.appointmentsPeriod}
                hint={`${kpis.savesPeriod} homes saved`}
              />
              <KpiCard
                label="Tasks done"
                value={kpis.tasksCompletedPeriod}
                hint="Completed in range"
              />
              <KpiCard
                label="Listing views"
                value={kpis.listingViewsPeriod}
                hint={`${kpis.searchesPeriod} searches`}
              />
            </View>

            <Section
              title="Pipeline"
              subtitle="All-time desk status mix"
            >
              {data.pipeline.length === 0 ? (
                <Text style={styles.muted}>No leads yet.</Text>
              ) : (
                data.pipeline.map((p) => (
                  <CountRow
                    key={p.status}
                    label={p.label}
                    count={p.count}
                    max={maxPipeline}
                  />
                ))
              )}
            </Section>

            <Section
              title="Stage mix"
              subtitle="Concentration vs largest stage — not conversion"
            >
              {data.funnel.length === 0 ? (
                <Text style={styles.muted}>No funnel data.</Text>
              ) : (
                data.funnel.map((f) => (
                  <CountRow
                    key={f.stage}
                    label={`${f.stage} (${f.pct}%)`}
                    count={f.count}
                    max={maxFunnel}
                  />
                ))
              )}
            </Section>

            <Section
              title="Lead sources"
              subtitle={`Created in last ${data.rangeDays} days`}
            >
              {data.sources.length === 0 ? (
                <Text style={styles.muted}>No sources in this range.</Text>
              ) : (
                data.sources.map((s) => (
                  <CountRow
                    key={s.source}
                    label={s.label}
                    count={s.count}
                    max={maxSource}
                  />
                ))
              )}
            </Section>

            <Section title="Buyer vs seller" subtitle="All-time intent mix">
              {data.intentMix.length === 0 ? (
                <Text style={styles.muted}>No intent data.</Text>
              ) : (
                data.intentMix.map((i) => (
                  <CountRow
                    key={i.intent}
                    label={i.label}
                    count={i.count}
                    max={maxIntent}
                  />
                ))
              )}
            </Section>

            <Section
              title="Response time"
              subtitle="First response in range"
            >
              {data.responseBuckets.every((b) => b.count === 0) ? (
                <Text style={styles.muted}>No responses in this range.</Text>
              ) : (
                data.responseBuckets.map((b) => (
                  <CountRow
                    key={b.label}
                    label={b.label}
                    count={b.count}
                    max={maxBucket}
                  />
                ))
              )}
            </Section>

            {data.inquiryTags.length > 0 ? (
              <Section title="Inquiry tags" subtitle={`Last ${data.rangeDays} days`}>
                {data.inquiryTags.map((t) => (
                  <CountRow
                    key={t.tag}
                    label={t.label}
                    count={t.count}
                    max={Math.max(...data.inquiryTags.map((x) => x.count), 1)}
                  />
                ))}
              </Section>
            ) : null}

            {data.activityByType.length > 0 ? (
              <Section
                title="Customer activity"
                subtitle={`Top journey events · last ${data.rangeDays} days`}
              >
                {data.activityByType.map((a) => (
                  <CountRow
                    key={a.type}
                    label={a.label}
                    count={a.count}
                    max={Math.max(
                      ...data.activityByType.map((x) => x.count),
                      1,
                    )}
                  />
                ))}
              </Section>
            ) : null}

            {data.leadsByDay.length > 0 ? (
              <Section
                title="Lead intake"
                subtitle="New leads vs first responses by day"
              >
                <View style={styles.seriesHeader}>
                  <Text style={styles.seriesColDate}>Day</Text>
                  <Text style={styles.seriesColNum}>Leads</Text>
                  <Text style={styles.seriesColNum}>Responses</Text>
                </View>
                {data.leadsByDay
                  .filter((d) => d.leads > 0 || d.responses > 0)
                  .slice(-14)
                  .map((d) => (
                    <View key={d.date} style={styles.seriesRow}>
                      <Text style={styles.seriesColDate}>{d.label}</Text>
                      <Text style={styles.seriesColNum}>{d.leads}</Text>
                      <Text style={styles.seriesColNum}>{d.responses}</Text>
                    </View>
                  ))}
                {data.leadsByDay.every(
                  (d) => d.leads === 0 && d.responses === 0,
                ) ? (
                  <Text style={styles.muted}>No intake in this range.</Text>
                ) : null}
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F4F7F5" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F766E",
    width: 72,
  },
  topTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    color: "#1E2A38",
  },
  topSpacer: { width: 72 },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  scopeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  rangeRow: { flexDirection: "row", gap: 8 },
  rangeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  rangeChipActive: {
    backgroundColor: "#1E2A38",
    borderColor: "#1E2A38",
  },
  rangeChipText: { fontSize: 13, fontWeight: "700", color: "#64748B" },
  rangeChipTextActive: { color: "#FFFFFF" },
  refreshBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshBannerText: { flex: 1, fontSize: 12, color: "#92400E" },
  refreshRetry: { fontSize: 12, fontWeight: "700", color: "#0F6B4C" },
  loadingBox: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 10,
  },
  muted: { fontSize: 13, color: "#64748B", textAlign: "center" },
  errorTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#B91C1C",
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 4,
    backgroundColor: "#0F6B4C",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  blockTitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "800",
    color: "#1E2A38",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  kpiCard: {
    width: "47%",
    flexGrow: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    minWidth: 140,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  kpiValue: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: "800",
    color: "#1E2A38",
  },
  kpiHint: {
    marginTop: 4,
    fontSize: 11,
    color: "#64748B",
    lineHeight: 14,
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1E2A38",
  },
  sectionSubtitle: {
    fontSize: 12,
    color: "#94A3B8",
    marginBottom: 4,
  },
  sectionBody: { gap: 10, marginTop: 4 },
  countRow: { gap: 4 },
  countRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  countLabel: { flex: 1, fontSize: 13, fontWeight: "600", color: "#334155" },
  countValue: { fontSize: 13, fontWeight: "800", color: "#1E2A38" },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F1F5F9",
    overflow: "hidden",
  },
  barFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#0F766E",
  },
  seriesHeader: {
    flexDirection: "row",
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  seriesRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
  },
  seriesColDate: { flex: 1, fontSize: 12, color: "#64748B", fontWeight: "600" },
  seriesColNum: {
    width: 72,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "700",
    color: "#1E2A38",
  },
});
