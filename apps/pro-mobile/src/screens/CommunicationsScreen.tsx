/**
 * Stage 5.8 — Native Communications (global outbound email activity).
 *
 * Web authority: /agent/inbox — LeadEmailLog across scoped leads.
 * Same records as Lead Profile → Conversations.
 *
 * INBOUND EMAIL NOT CURRENTLY CANONICAL — UI is Sent Email Activity,
 * not a two-way inbox. No SMS/chat tabs.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import { EmailHtmlPreview } from "../components/EmailHtmlPreview";
import { isEmailHtmlPreviewSupported } from "../components/email-html-preview-support";
import {
  buildCommunicationsQuery,
  unwrapCommunicationDetail,
  unwrapCommunicationsList,
} from "../lib/communications-response";
import {
  communicationsCache,
  invalidateCommunicationsCachesAfterSend,
} from "../lib/lead-tab-cache";
import { useAuth } from "../state/AuthContext";
import type {
  MobileCommunicationDetail,
  MobileCommunicationItem,
} from "../types/lead";

const DEFAULT_SUBJECT = "Following up on your home search";
const DEFAULT_BODY =
  "Hi,\n\nJust checking in. Happy to set up a showing or refine your search.\n\nBest regards";

type CommunicationsScreenProps = {
  onBack: () => void;
  onOpenLead: (leadId: string) => void;
};

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (
      d.getFullYear() === yesterday.getFullYear() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getDate() === yesterday.getDate()
    ) {
      return "Yesterday";
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function formatFullWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-CA");
  } catch {
    return iso;
  }
}

function engagementLabel(item: {
  openedAt: string | null;
  openCount: number;
  clickedAt: string | null;
  clickCount: number;
}): string | null {
  if (item.clickedAt) {
    return item.clickCount > 1
      ? `Link clicked ${item.clickCount}×`
      : "Link clicked";
  }
  if (item.openedAt) {
    return item.openCount > 1 ? `Opened ${item.openCount}×` : "Opened";
  }
  return null;
}

function kindLabel(kind: string | null | undefined): string {
  if (!kind) return "Email";
  return kind.replaceAll("_", " ");
}

export function CommunicationsScreen({
  onBack,
  onOpenLead,
}: CommunicationsScreenProps) {
  const { activeWorkspace } = useAuth();
  const workspaceId = activeWorkspace?.id;

  const cacheKey = workspaceId ? `${workspaceId}:communications` : "";
  const cached = cacheKey ? communicationsCache.get(cacheKey) : undefined;

  const [items, setItems] = useState<MobileCommunicationItem[]>(
    cached?.items ?? [],
  );
  const [nextCursor, setNextCursor] = useState<string | null>(
    cached?.nextCursor ?? null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MobileCommunicationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [composer, setComposer] = useState({
    toEmail: null as string | null,
    consented: false,
    alertsEnabled: true,
  });
  const [composerOpen, setComposerOpen] = useState(false);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [sendPending, setSendPending] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery]);

  const queryKey = useMemo(
    () => `q=${debouncedSearch}`,
    [debouncedSearch],
  );

  const persistCache = useCallback(
    (
      list: MobileCommunicationItem[],
      cursor: string | null,
      key: string,
    ) => {
      if (!cacheKey) return;
      // Only cache the default (no search) feed for cold start.
      if (key !== "q=") return;
      communicationsCache.set(cacheKey, {
        items: list,
        nextCursor: cursor,
        queryKey: key,
        timestamp: Date.now(),
      });
    },
    [cacheKey],
  );

  const fetchPage = useCallback(
    async (opts?: {
      cursor?: string | null;
      soft?: boolean;
      replace?: boolean;
    }) => {
      const soft = opts?.soft === true;
      const replace = opts?.replace !== false && !opts?.cursor;
      const isMore = Boolean(opts?.cursor);
      if (isMore) setLoadingMore(true);
      else if (!soft) setLoading(true);
      setRefreshError(null);

      try {
        const qs = buildCommunicationsQuery({
          q: debouncedSearch || undefined,
          cursor: opts?.cursor ?? null,
          limit: 30,
          channel: "email",
        });
        const res = await mobileApiClient.get<unknown>(
          `/communications${qs}`,
        );
        if (!res.ok) {
          const msg = res.message || "Couldn't load communications";
          setItems((prev) => {
            if (prev.length > 0) setRefreshError(msg);
            else setError(msg);
            return prev;
          });
          return;
        }
        const unwrapped = unwrapCommunicationsList(res.data);
        setItems((prev) => {
          const nextList = isMore
            ? [...prev, ...unwrapped.items]
            : unwrapped.items;
          persistCache(nextList, unwrapped.nextCursor, queryKey);
          return nextList;
        });
        setNextCursor(unwrapped.nextCursor);
        setError(null);
        void replace;
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Network error loading communications";
        setItems((prev) => {
          if (prev.length > 0) setRefreshError(msg);
          else setError(msg);
          return prev;
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [debouncedSearch, persistCache, queryKey],
  );

  useEffect(() => {
    void fetchPage({ replace: true });
  }, [fetchPage, workspaceId]);

  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    setComposerOpen(false);
    setSendMessage(null);
    try {
      const res = await mobileApiClient.get<unknown>(
        `/communications/${encodeURIComponent(id)}`,
      );
      if (!res.ok) {
        setDetailError(res.message || "Couldn't load email");
        return;
      }
      const unwrapped = unwrapCommunicationDetail(res.data);
      if (!unwrapped.communication) {
        setDetailError("Couldn't load email");
        return;
      }
      setDetail(unwrapped.communication);
      setComposer(unwrapped.composer);
    } catch (err: unknown) {
      setDetailError(
        err instanceof Error ? err.message : "Network error",
      );
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setComposerOpen(false);
    setSendMessage(null);
  }, []);

  const canSend =
    Boolean(composer.toEmail) &&
    composer.consented &&
    composer.alertsEnabled &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    !sendPending &&
    Boolean(detail?.leadId);

  const handleSend = useCallback(async () => {
    if (!detail?.leadId || !canSend) return;
    setSendPending(true);
    setSendMessage(null);
    try {
      const res = await mobileApiClient.post<unknown>(
        `/leads/${encodeURIComponent(detail.leadId)}/conversations`,
        { subject: subject.trim(), body: body.trim() },
      );
      if (!res.ok) {
        setSendMessage(res.message || "Send failed");
        return;
      }
      setSendMessage("Email sent");
      setComposerOpen(false);
      setSubject(DEFAULT_SUBJECT);
      setBody(DEFAULT_BODY);
      invalidateCommunicationsCachesAfterSend(workspaceId, detail.leadId);
      void fetchPage({ soft: true });
      // Refresh detail list context by reloading first page after send.
    } catch (err: unknown) {
      setSendMessage(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSendPending(false);
    }
  }, [canSend, detail?.leadId, subject, body, workspaceId, fetchPage]);

  const renderRow = ({ item }: { item: MobileCommunicationItem }) => {
    const name =
      item.customerName?.trim() ||
      item.customerEmail?.trim() ||
      "Lead";
    const engagement = engagementLabel(item);
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.8}
        onPress={() => void openDetail(item.id)}
      >
        <View style={styles.rowTop}>
          <Text style={styles.rowName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.rowTime}>{formatWhen(item.createdAt)}</Text>
        </View>
        <Text style={styles.rowChannel} numberOfLines={1}>
          Sent email · {kindLabel(item.kind)}
        </Text>
        <Text style={styles.rowSubject} numberOfLines={1}>
          {item.subject}
        </Text>
        {item.snippet ? (
          <Text style={styles.rowSnippet} numberOfLines={2}>
            {item.snippet}
          </Text>
        ) : null}
        {engagement ? (
          <Text style={styles.rowEngagement}>{engagement}</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  const listEmpty = () => {
    if (loading) {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator color="#0F6B4C" />
          <Text style={styles.muted}>Loading sent emails…</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.centerBox}>
          <Text style={styles.errorTitle}>Couldn't load communications</Text>
          <Text style={styles.muted}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => void fetchPage()}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.centerBox}>
        <Text style={styles.emptyTitle}>No emails sent yet</Text>
        <Text style={styles.muted}>
          Communications shows outbound CRM email activity for your leads.
          Inbound customer replies are not stored here yet.
        </Text>
      </View>
    );
  };

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
          Communications
        </Text>
        <View style={styles.topSpacer} />
      </View>

      <View style={styles.subtitleBar}>
        <Text style={styles.subtitle}>
          Sent email activity · inbound not available yet
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, email, subject…"
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              style={styles.clearBtn}
            >
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.filterRow}>
        <View style={[styles.filterChip, styles.filterChipActive]}>
          <Text style={styles.filterChipTextActive}>Email</Text>
        </View>
      </View>

      {refreshError ? (
        <View style={styles.refreshBanner}>
          <Text style={styles.refreshBannerText}>
            Couldn't refresh communications.
          </Text>
          <TouchableOpacity onPress={() => void fetchPage({ soft: true })}>
            <Text style={styles.refreshRetry}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {items.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyScroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void fetchPage({ soft: true });
              }}
              colors={["#0F6B4C"]}
              tintColor="#0F6B4C"
            />
          }
        >
          {listEmpty()}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void fetchPage({ soft: true });
              }}
              colors={["#0F6B4C"]}
              tintColor="#0F6B4C"
            />
          }
        >
          {items.map((item) => (
            <React.Fragment key={item.id}>{renderRow({ item })}</React.Fragment>
          ))}
          {nextCursor ? (
            <TouchableOpacity
              style={styles.loadMoreBtn}
              disabled={loadingMore}
              onPress={() => void fetchPage({ cursor: nextCursor, soft: true })}
              activeOpacity={0.8}
            >
              {loadingMore ? (
                <ActivityIndicator color="#0F6B4C" />
              ) : (
                <Text style={styles.loadMoreText}>Load more</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      )}

      <Modal
        visible={Boolean(selectedId)}
        animationType="slide"
        onRequestClose={closeDetail}
      >
        <View style={styles.detailRoot}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={closeDetail} activeOpacity={0.75}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.topTitle} numberOfLines={1}>
              Sent email
            </Text>
            <View style={styles.topSpacer} />
          </View>

          {detailLoading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color="#0F6B4C" />
            </View>
          ) : detailError ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorTitle}>{detailError}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => selectedId && void openDetail(selectedId)}
              >
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : detail ? (
            <ScrollView contentContainerStyle={styles.detailContent}>
              <Text style={styles.detailName}>
                {detail.customerName?.trim() ||
                  detail.customerEmail?.trim() ||
                  "Lead"}
              </Text>
              <Text style={styles.detailMeta}>
                Sent email · {formatFullWhen(detail.createdAt)}
              </Text>
              <Text style={styles.detailSubject}>{detail.subject}</Text>
              <Text style={styles.detailMeta}>
                To {detail.toEmail}
                {detail.sentByName ? ` · from ${detail.sentByName}` : ""}
              </Text>
              {engagementLabel(detail) ? (
                <Text style={styles.rowEngagement}>
                  {engagementLabel(detail)}
                </Text>
              ) : null}

              <View style={styles.detailActions}>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => onOpenLead(detail.leadId)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>Open Lead</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => setComposerOpen((v) => !v)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryBtnText}>Send Email</Text>
                </TouchableOpacity>
              </View>

              {composerOpen ? (
                <View style={styles.composer}>
                  <Text style={styles.composerLabel}>
                    To: {composer.toEmail || "No email"}
                    {!composer.consented
                      ? " · Needs CASL consent"
                      : !composer.alertsEnabled
                        ? " · Alerts off"
                        : " · CASL ok"}
                  </Text>
                  <TextInput
                    style={styles.subjectInput}
                    value={subject}
                    onChangeText={setSubject}
                    placeholder="Subject"
                    placeholderTextColor="#94A3B8"
                    editable={!sendPending}
                  />
                  <TextInput
                    style={styles.bodyInput}
                    value={body}
                    onChangeText={setBody}
                    placeholder="Message"
                    placeholderTextColor="#94A3B8"
                    editable={!sendPending}
                    multiline
                    textAlignVertical="top"
                  />
                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      !canSend && styles.primaryBtnDisabled,
                    ]}
                    disabled={!canSend}
                    onPress={() => void handleSend()}
                  >
                    <Text style={styles.primaryBtnText}>
                      {sendPending ? "Sending…" : "Send Email"}
                    </Text>
                  </TouchableOpacity>
                  {sendMessage ? (
                    <Text style={styles.sendMessage}>{sendMessage}</Text>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.bodyPanel}>
                <Text style={styles.bodyPanelTitle}>Message</Text>
                <Text style={styles.bodyText}>{detail.body}</Text>
              </View>

              {detail.htmlBody && isEmailHtmlPreviewSupported() ? (
                <View style={styles.htmlPanel}>
                  <Text style={styles.bodyPanelTitle}>Preview</Text>
                  <EmailHtmlPreview htmlBody={detail.htmlBody} />
                </View>
              ) : null}
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F4F7F5",
  },
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
  subtitleBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: "#FFFFFF",
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#1E2A38",
    paddingVertical: 0,
  },
  clearBtn: { padding: 4 },
  clearBtnText: { fontSize: 12, color: "#94A3B8", fontWeight: "700" },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D8DEE6",
  },
  filterChipActive: {
    backgroundColor: "#1E2A38",
    borderColor: "#1E2A38",
  },
  filterChipTextActive: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  refreshBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#FEF3C7",
  },
  refreshBannerText: { fontSize: 12, color: "#92400E", flex: 1 },
  refreshRetry: { fontSize: 12, fontWeight: "700", color: "#0F6B4C" },
  listContent: { padding: 14, paddingBottom: 40 },
  emptyScroll: { flexGrow: 1 },
  row: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 10,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  rowName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#1E2A38",
  },
  rowTime: { fontSize: 11, color: "#94A3B8", fontWeight: "600" },
  rowChannel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    textTransform: "capitalize",
  },
  rowSubject: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
  },
  rowSnippet: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748B",
    lineHeight: 18,
  },
  rowEngagement: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "700",
    color: "#0F766E",
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 8,
  },
  muted: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E2A38",
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#B91C1C",
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: "#0F6B4C",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  footerLoading: { paddingVertical: 16 },
  loadMoreBtn: {
    marginTop: 4,
    marginBottom: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F6B4C",
  },
  detailRoot: { flex: 1, backgroundColor: "#F4F7F5" },
  detailContent: { padding: 16, paddingBottom: 48, gap: 8 },
  detailName: { fontSize: 20, fontWeight: "800", color: "#1E2A38" },
  detailMeta: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  detailSubject: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: "700",
    color: "#1E2A38",
  },
  detailActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  primaryBtn: {
    flex: 1,
    backgroundColor: "#0F6B4C",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  secondaryBtnText: { color: "#0F6B4C", fontWeight: "700", fontSize: 14 },
  composer: {
    marginTop: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 10,
  },
  composerLabel: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  subjectInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1E2A38",
    backgroundColor: "#F8FAFC",
  },
  bodyInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1E2A38",
    backgroundColor: "#F8FAFC",
    minHeight: 120,
  },
  sendMessage: { fontSize: 12, fontWeight: "600", color: "#0F6B4C" },
  bodyPanel: {
    marginTop: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
  },
  bodyPanelTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  bodyText: { fontSize: 14, color: "#334155", lineHeight: 20 },
  htmlPanel: {
    marginTop: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    minHeight: 200,
  },
});
