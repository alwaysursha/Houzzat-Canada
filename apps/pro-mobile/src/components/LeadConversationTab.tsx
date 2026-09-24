/**
 * Lead Profile Conversations — canonical Conversation / Message thread.
 *
 * Uses GET/POST /api/mobile/v2/leads/[leadId]/conversation[...]
 * Same architecture as ChatsScreen / desktop chat.
 *
 * Not the plural email-log API — email history stays under the Emails tab.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import {
  formatChatsInboxTime,
  unwrapChatPanel,
  unwrapChatSentMessage,
  type MobileChatMessage,
  type MobileChatPanel,
} from "../lib/chats-response";

type LeadConversationTabProps = {
  leadId: string;
  workspaceId: string | undefined;
};

export function LeadConversationTab({
  leadId,
  workspaceId,
}: LeadConversationTabProps) {
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
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const res = await mobileApiClient.get<unknown>(
        `/leads/${encodeURIComponent(leadId)}/conversation${qs}`,
      );
      if (!res.ok) {
        if (!isOlder) setError(res.message || "Couldn't load conversation.");
        setLoading(false);
        setLoadingOlder(false);
        return;
      }
      const data = unwrapChatPanel(res.data);
      if (!data) {
        if (!isOlder) setError("Couldn't load conversation.");
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

  if (loading && !panel) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#0F766E" />
      </View>
    );
  }

  if (error && !panel) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <TouchableOpacity
          style={styles.retry}
          onPress={() => void loadThread()}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <Text style={styles.hint}>
        Chat with this lead — same conversation as the Chats tab and desktop CRM.
      </Text>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
      >
        {panel?.page.hasMore ? (
          <TouchableOpacity
            style={styles.loadOlder}
            disabled={loadingOlder}
            onPress={() => {
              if (panel.page.nextCursor) void loadThread(panel.page.nextCursor);
            }}
          >
            <Text style={styles.loadOlderText}>
              {loadingOlder ? "Loading…" : "Load earlier messages"}
            </Text>
          </TouchableOpacity>
        ) : null}
        {(panel?.messages ?? []).length === 0 ? (
          <Text style={styles.muted}>No messages yet.</Text>
        ) : (
          (panel?.messages ?? []).map((item) => (
            <MessageBubble key={item.id} message={item} />
          ))
        )}
      </ScrollView>

      {canSend ? (
        <View style={styles.composer}>
          <View style={styles.channelRow}>
            <Chip
              label="Chat"
              active={channel === "CHAT"}
              onPress={() => setChannel("CHAT")}
            />
            <Chip
              label="SMS"
              active={channel === "SMS"}
              onPress={() => setChannel("SMS")}
            />
          </View>
          {channel === "SMS" && !smsEnabled ? (
            <Text style={styles.smsHint}>
              SMS unavailable
              {panel?.smsSend?.reason ? ` · ${panel.smsSend.reason}` : ""}
            </Text>
          ) : null}
          <View style={styles.composerRow}>
            <TextInput
              style={styles.input}
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
              style={[styles.send, !canSubmit && styles.sendDisabled]}
              disabled={!canSubmit}
              onPress={() => void handleSend()}
            >
              <Text style={styles.sendText}>
                {sending ? "…" : channel === "SMS" ? "SMS" : "Send"}
              </Text>
            </TouchableOpacity>
          </View>
          {sendError ? <Text style={styles.error}>{sendError}</Text> : null}
        </View>
      ) : (
        <View style={styles.locked}>
          <Text style={styles.muted}>
            Only the assigned agent can send in this conversation.
          </Text>
        </View>
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

function Chip({
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
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { minHeight: 320 },
  hint: {
    fontSize: 12,
    color: "#64748B",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  center: {
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  list: { maxHeight: 360 },
  listContent: { paddingVertical: 8, gap: 4 },
  loadOlder: { alignItems: "center", paddingVertical: 8 },
  loadOlderText: { fontSize: 12, fontWeight: "600", color: "#0F766E" },
  muted: { fontSize: 13, color: "#64748B", textAlign: "center" },
  error: { fontSize: 13, color: "#B91C1C", textAlign: "center" },
  retry: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryText: { fontSize: 13, fontWeight: "600", color: "#1E2A38" },
  bubbleWrap: { marginBottom: 8, flexDirection: "row" },
  bubbleWrapAgent: { justifyContent: "flex-end" },
  bubbleWrapCustomer: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "82%",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleAgent: { backgroundColor: "#0F766E", borderBottomRightRadius: 4 },
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
  bubbleBody: { fontSize: 14, lineHeight: 20 },
  bubbleBodyAgent: { color: "#FFFFFF" },
  bubbleBodyCustomer: { color: "#1E2A38" },
  bubbleDeleted: { fontStyle: "italic", opacity: 0.8 },
  bubbleMeta: { marginTop: 4, fontSize: 10 },
  bubbleMetaAgent: { color: "rgba(255,255,255,0.75)", textAlign: "right" },
  bubbleMetaCustomer: { color: "#94A3B8" },
  composer: {
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 8,
    gap: 8,
  },
  locked: {
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 12,
    paddingBottom: 4,
  },
  channelRow: { flexDirection: "row", gap: 8 },
  chip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
  },
  chipActive: { borderColor: "#0F766E", backgroundColor: "#ECFDF5" },
  chipText: { fontSize: 12, fontWeight: "600", color: "#64748B" },
  chipTextActive: { color: "#0F766E" },
  smsHint: { fontSize: 11, color: "#B45309" },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
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
  send: {
    backgroundColor: "#0F766E",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sendDisabled: { opacity: 0.45 },
  sendText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
});
