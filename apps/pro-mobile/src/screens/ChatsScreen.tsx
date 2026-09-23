/**
 * Native Chats — workspace-scoped Conversation inbox + thread.
 *
 * Web authority: /agent/chats (AgentChatsInbox) + lead conversation APIs.
 * Data: GET /api/mobile/v2/conversations
 *       GET/POST /api/mobile/v2/leads/[leadId]/conversation[...]
 *
 * Not Communications / sent-email activity.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import {
  buildChatsInboxQuery,
  chatsInboxInitials,
  formatChatsInboxTime,
  unwrapChatPanel,
  unwrapChatSentMessage,
  unwrapChatsInboxList,
  type MobileChatMessage,
  type MobileChatPanel,
  type MobileChatsInboxRow,
} from "../lib/chats-response";
import { useAuth } from "../state/AuthContext";

type Filter = "all" | "unread";

type ChatsScreenProps = {
  onOpenLead?: (leadId: string) => void;
};

export function ChatsScreen({ onOpenLead }: ChatsScreenProps) {
  const { activeWorkspace } = useAuth();
  const workspaceId = activeWorkspace?.id;

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);

  if (selectedLeadId) {
    return (
      <ChatThread
        leadId={selectedLeadId}
        title={selectedTitle ?? "Chat"}
        workspaceId={workspaceId}
        onBack={() => {
          setSelectedLeadId(null);
          setSelectedTitle(null);
        }}
        onOpenLead={onOpenLead}
      />
    );
  }

  return (
    <ChatInboxList
      workspaceId={workspaceId}
      onSelect={(row) => {
        setSelectedLeadId(row.leadId);
        setSelectedTitle(row.lead.displayName || "Chat");
      }}
    />
  );
}

function ChatInboxList({
  workspaceId,
  onSelect,
}: {
  workspaceId?: string;
  onSelect: (row: MobileChatsInboxRow) => void;
}) {
  const [rows, setRows] = useState<MobileChatsInboxRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [queryInput, setQueryInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQ(queryInput.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [queryInput]);

  const loadList = useCallback(
    async (opts?: { cursor?: string | null; soft?: boolean }) => {
      const cursor = opts?.cursor ?? null;
      const isMore = Boolean(cursor);
      const gen = ++fetchGenRef.current;
      if (isMore) setLoadingMore(true);
      else if (!opts?.soft) {
        setLoading(true);
        setError(null);
      } else {
        setRefreshing(true);
      }

      const qs = buildChatsInboxQuery({
        q: debouncedQ || undefined,
        filter,
        cursor,
      });
      const res = await mobileApiClient.get<unknown>(`/conversations${qs}`);
      if (gen !== fetchGenRef.current) return;

      if (!res.ok) {
        if (!isMore) {
          setError(res.message || "Couldn’t load chats.");
          setRows([]);
          setHasMore(false);
          setNextCursor(null);
        }
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        return;
      }

      const data = unwrapChatsInboxList(res.data);
      if (!data) {
        if (!isMore) {
          setError("Couldn’t load chats.");
          setRows([]);
        }
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        return;
      }

      setRows((prev) =>
        isMore ? mergeRows(prev, data.conversations) : data.conversations,
      );
      setHasMore(data.page.hasMore);
      setNextCursor(data.page.nextCursor);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    },
    [debouncedQ, filter],
  );

  useEffect(() => {
    if (!workspaceId) {
      setRows([]);
      setLoading(false);
      return;
    }
    void loadList();
  }, [workspaceId, loadList]);

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Text style={styles.topTitle}>Chats</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, email, or phone"
            placeholderTextColor="#94A3B8"
            value={queryInput}
            onChangeText={setQueryInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {queryInput.length > 0 ? (
            <TouchableOpacity
              onPress={() => setQueryInput("")}
              style={styles.clearBtn}
            >
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.filterRow}>
        <FilterChip
          label="All"
          active={filter === "all"}
          onPress={() => setFilter("all")}
        />
        <FilterChip
          label="Unread"
          active={filter === "unread"}
          onPress={() => setFilter("unread")}
        />
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color="#0F766E" />
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => void loadList()}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={
            rows.length === 0 ? styles.emptyList : styles.listContent
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadList({ soft: true })}
              tintColor="#0F766E"
            />
          }
        >
          {rows.length === 0 ? (
            <View style={styles.centerBox}>
              <Text style={styles.emptyTitle}>
                {filter === "unread" ? "No unread chats" : "No chats yet"}
              </Text>
              <Text style={styles.muted}>
                Customer conversations for this workspace appear here.
              </Text>
            </View>
          ) : (
            rows.map((item) => (
              <TouchableOpacity
                key={item.conversationId}
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => onSelect(item)}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {chatsInboxInitials(item.lead.displayName || "L")}
                  </Text>
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.lead.displayName || "Lead"}
                    </Text>
                    <Text style={styles.rowTime}>
                      {formatChatsInboxTime(item.lastMessageAt)}
                    </Text>
                  </View>
                  <View style={styles.rowBottom}>
                    <Text
                      style={[
                        styles.rowPreview,
                        item.unread.count > 0 && styles.rowPreviewUnread,
                      ]}
                      numberOfLines={1}
                    >
                      {item.latestMessage?.preview?.trim() || "No messages yet"}
                    </Text>
                    {item.unread.count > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>
                          {item.unread.count > 99 ? "99+" : item.unread.count}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
          {hasMore && nextCursor ? (
            <TouchableOpacity
              style={styles.loadMoreBtn}
              disabled={loadingMore}
              onPress={() => void loadList({ cursor: nextCursor })}
            >
              <Text style={styles.loadMoreText}>
                {loadingMore ? "Loading…" : "Load more"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function ChatThread({
  leadId,
  title,
  workspaceId,
  onBack,
  onOpenLead,
}: {
  leadId: string;
  title: string;
  workspaceId?: string;
  onBack: () => void;
  onOpenLead?: (leadId: string) => void;
}) {
  const [panel, setPanel] = useState<MobileChatPanel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [channel, setChannel] = useState<"CHAT" | "SMS">("CHAT");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const markedReadRef = useRef<string | null>(null);

  const loadThread = useCallback(
    async (cursor?: string | null) => {
      const isOlder = Boolean(cursor);
      if (isOlder) setLoadingOlder(true);
      else {
        setLoading(true);
        setError(null);
      }
      const qs = cursor
        ? `?cursor=${encodeURIComponent(cursor)}`
        : "";
      const res = await mobileApiClient.get<unknown>(
        `/leads/${encodeURIComponent(leadId)}/conversation${qs}`,
      );
      if (!res.ok) {
        if (!isOlder) setError(res.message || "Couldn’t load conversation.");
        setLoading(false);
        setLoadingOlder(false);
        return;
      }
      const data = unwrapChatPanel(res.data);
      if (!data) {
        if (!isOlder) setError("Couldn’t load conversation.");
        setLoading(false);
        setLoadingOlder(false);
        return;
      }
      setPanel((prev) => {
        if (isOlder && prev) {
          const seen = new Set(prev.messages.map((m) => m.id));
          const older = data.messages.filter((m) => !seen.has(m.id));
          return {
            ...prev,
            messages: [...older, ...prev.messages],
            page: data.page,
          };
        }
        return data;
      });
      setLoading(false);
      setLoadingOlder(false);
    },
    [leadId],
  );

  useEffect(() => {
    markedReadRef.current = null;
    setPanel(null);
    setDraft("");
    setChannel("CHAT");
    setSendError(null);
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    void loadThread();
  }, [leadId, workspaceId, loadThread]);

  useEffect(() => {
    if (!panel || markedReadRef.current === leadId) return;
    if (!panel.viewer.canMarkRead || panel.unread.count <= 0) return;
    markedReadRef.current = leadId;
    void mobileApiClient
      .post(`/leads/${encodeURIComponent(leadId)}/conversation/read`)
      .then((res) => {
        if (res.ok) {
          setPanel((prev) =>
            prev
              ? {
                  ...prev,
                  unread: {
                    ...prev.unread,
                    count: 0,
                    dividerMessageId: null,
                  },
                }
              : prev,
          );
        }
      });
  }, [panel, leadId]);

  const canSend = Boolean(panel?.viewer.canMarkRead);
  const smsEnabled = panel?.smsSend?.enabled === true;
  const canSubmit =
    canSend &&
    !sending &&
    draft.trim().length > 0 &&
    draft.trim().length <= 4000 &&
    (channel !== "SMS" || smsEnabled);

  async function handleSend() {
    if (!canSubmit) return;
    setSending(true);
    setSendError(null);
    const body = draft.trim();
    const res = await mobileApiClient.post<unknown>(
      `/leads/${encodeURIComponent(leadId)}/conversation/messages`,
      { body, channel },
    );
    setSending(false);
    if (!res.ok) {
      setSendError(res.message || "Failed to send.");
      return;
    }
    const message = unwrapChatSentMessage(res.data);
    setDraft("");
    if (message) {
      setPanel((prev) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === message.id)) return prev;
        return {
          ...prev,
          messages: [...prev.messages, message],
          conversation: {
            ...prev.conversation,
            lastMessageAt: message.createdAt,
          },
          unread: {
            ...prev.unread,
            count: 0,
            dividerMessageId: null,
          },
        };
      });
    } else {
      void loadThread();
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <View style={styles.threadTopBar}>
        <TouchableOpacity
          onPress={onBack}
          activeOpacity={0.75}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.threadTitleWrap}
          activeOpacity={onOpenLead ? 0.7 : 1}
          onPress={() => onOpenLead?.(leadId)}
          disabled={!onOpenLead}
        >
          <Text style={styles.topTitle} numberOfLines={1}>
            {title}
          </Text>
        </TouchableOpacity>
        <View style={styles.topSpacer} />
      </View>

      {loading && !panel ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color="#0F766E" />
        </View>
      ) : error && !panel ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => void loadThread()}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.threadList}
            contentContainerStyle={styles.threadContent}
          >
            {panel?.page.hasMore ? (
              <TouchableOpacity
                style={styles.loadOlderBtn}
                disabled={loadingOlder}
                onPress={() => {
                  if (panel.page.nextCursor) {
                    void loadThread(panel.page.nextCursor);
                  }
                }}
              >
                <Text style={styles.loadOlderText}>
                  {loadingOlder ? "Loading…" : "Load earlier messages"}
                </Text>
              </TouchableOpacity>
            ) : null}

            {(panel?.messages ?? []).length === 0 ? (
              <View style={styles.centerBox}>
                <Text style={styles.muted}>No messages yet.</Text>
              </View>
            ) : (
              (panel?.messages ?? []).map((item) => (
                <MessageBubble key={item.id} message={item} />
              ))
            )}
          </ScrollView>

          {canSend ? (
            <View style={styles.composer}>
              <View style={styles.channelRow}>
                <FilterChip
                  label="Chat"
                  active={channel === "CHAT"}
                  onPress={() => setChannel("CHAT")}
                />
                <FilterChip
                  label="SMS"
                  active={channel === "SMS"}
                  onPress={() => setChannel("SMS")}
                />
              </View>
              {channel === "SMS" && !smsEnabled ? (
                <Text style={styles.smsHint}>
                  SMS unavailable
                  {panel?.smsSend?.reason
                    ? ` · ${panel.smsSend.reason}`
                    : ""}
                </Text>
              ) : null}
              <View style={styles.composerRow}>
                <TextInput
                  style={styles.composerInput}
                  placeholder={
                    channel === "SMS" ? "Write an SMS…" : "Write a message…"
                  }
                  placeholderTextColor="#94A3B8"
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  maxLength={4000}
                />
                <TouchableOpacity
                  style={[
                    styles.sendBtn,
                    !canSubmit && styles.sendBtnDisabled,
                  ]}
                  disabled={!canSubmit}
                  onPress={() => void handleSend()}
                >
                  <Text style={styles.sendBtnText}>
                    {sending
                      ? "…"
                      : channel === "SMS"
                        ? "SMS"
                        : "Send"}
                  </Text>
                </TouchableOpacity>
              </View>
              {sendError ? (
                <Text style={styles.sendError}>{sendError}</Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.composerLocked}>
              <Text style={styles.muted}>
                Only the assigned agent can send in this conversation.
              </Text>
            </View>
          )}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ message }: { message: MobileChatMessage }) {
  const isAgent =
    message.senderKind === "AGENT" || message.senderKind === "SYSTEM";
  const isDeleted = Boolean(message.deletedAt);
  const body = isDeleted
    ? "This message was deleted"
    : message.body?.trim() ||
      (message.kind === "SYSTEM_CARD" ? "Update" : "");

  return (
    <View
      style={[
        styles.bubbleWrap,
        isAgent ? styles.bubbleWrapAgent : styles.bubbleWrapCustomer,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isAgent ? styles.bubbleAgent : styles.bubbleCustomer,
        ]}
      >
        {!isAgent ? (
          <Text style={styles.bubbleSender}>{message.senderName}</Text>
        ) : null}
        <Text
          style={[
            styles.bubbleBody,
            isAgent ? styles.bubbleBodyAgent : styles.bubbleBodyCustomer,
            isDeleted && styles.bubbleDeleted,
          ]}
        >
          {body}
        </Text>
        <Text
          style={[
            styles.bubbleMeta,
            isAgent ? styles.bubbleMetaAgent : styles.bubbleMetaCustomer,
          ]}
        >
          {message.channel === "SMS" ? "SMS · " : ""}
          {formatChatsInboxTime(message.createdAt)}
        </Text>
      </View>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.filterChip, active && styles.filterChipActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text
        style={[
          styles.filterChipText,
          active && styles.filterChipTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function mergeRows(
  prev: MobileChatsInboxRow[],
  next: MobileChatsInboxRow[],
): MobileChatsInboxRow[] {
  const seen = new Set(prev.map((r) => r.conversationId));
  return [...prev, ...next.filter((r) => !seen.has(r.conversationId))];
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  threadTopBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    gap: 8,
  },
  topTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E2A38",
  },
  threadTitleWrap: {
    flex: 1,
  },
  topSpacer: {
    width: 56,
  },
  backText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F766E",
    width: 56,
  },
  searchContainer: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: "#FFFFFF",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 14,
    color: "#1E2A38",
  },
  clearBtn: {
    padding: 6,
  },
  clearBtnText: {
    color: "#94A3B8",
    fontSize: 12,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  filterChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
  },
  filterChipActive: {
    borderColor: "#0F766E",
    backgroundColor: "#ECFDF5",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  filterChipTextActive: {
    color: "#0F766E",
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyList: {
    flexGrow: 1,
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E2A38",
  },
  muted: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
  },
  errorText: {
    fontSize: 14,
    color: "#B91C1C",
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  retryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E2A38",
  },
  row: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
  },
  rowBody: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#1E2A38",
  },
  rowTime: {
    fontSize: 11,
    color: "#94A3B8",
  },
  rowBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowPreview: {
    flex: 1,
    fontSize: 13,
    color: "#64748B",
  },
  rowPreviewUnread: {
    color: "#1E2A38",
    fontWeight: "600",
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  loadMoreBtn: {
    alignItems: "center",
    paddingVertical: 14,
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F766E",
  },
  threadList: {
    flex: 1,
  },
  threadContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  loadOlderBtn: {
    alignItems: "center",
    paddingVertical: 8,
    marginBottom: 8,
  },
  loadOlderText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0F766E",
  },
  bubbleWrap: {
    marginBottom: 8,
    flexDirection: "row",
  },
  bubbleWrapAgent: {
    justifyContent: "flex-end",
  },
  bubbleWrapCustomer: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleAgent: {
    backgroundColor: "#0F766E",
    borderBottomRightRadius: 4,
  },
  bubbleCustomer: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderBottomLeftRadius: 4,
  },
  bubbleSender: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 2,
  },
  bubbleBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleBodyAgent: {
    color: "#FFFFFF",
  },
  bubbleBodyCustomer: {
    color: "#1E2A38",
  },
  bubbleDeleted: {
    fontStyle: "italic",
    opacity: 0.8,
  },
  bubbleMeta: {
    marginTop: 4,
    fontSize: 10,
  },
  bubbleMetaAgent: {
    color: "rgba(255,255,255,0.75)",
    textAlign: "right",
  },
  bubbleMetaCustomer: {
    color: "#94A3B8",
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 12 : 10,
    gap: 8,
  },
  composerLocked: {
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 14,
  },
  channelRow: {
    flexDirection: "row",
    gap: 8,
  },
  smsHint: {
    fontSize: 11,
    color: "#B45309",
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: "#1E2A38",
    backgroundColor: "#F8FAFC",
  },
  sendBtn: {
    backgroundColor: "#0F766E",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  sendBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  sendError: {
    fontSize: 12,
    color: "#B91C1C",
  },
});
