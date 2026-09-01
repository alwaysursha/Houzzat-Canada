/**
 * Stage 4.8 — Native Conversations tab (web CustomerProfile Conversations parity).
 *
 * Visual + data authority: CustomerProfile tab="conversations"
 *   = Panel "Send email" + LeadEmailForm + LeadEmailLog cards.
 *
 * Canonical records: LeadEmailLog (NOT chat/SMS/visitor messaging).
 *
 * Data: GET/POST /api/mobile/v2/leads/[leadId]/conversations
 *        GET /api/mobile/v2/leads/[leadId]/conversations/[emailId] (preview)
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { EmailHtmlPreview } from "./EmailHtmlPreview";
import { mobileApiClient } from "../api/client";
import {
  unwrapComposer,
  unwrapEmail,
  unwrapEmailsList,
  unwrapLeadDetailComposer,
  unwrapLeadDetailEmails,
  unwrapNextCursor,
} from "../lib/conversation-response";
import {
  conversationCache,
  clearLeadConversationsCache,
} from "../lib/lead-tab-cache";
import type { MobileLeadEmail } from "../types/api";

export { clearLeadConversationsCache };

const DEFAULT_SUBJECT = "Following up on your home search";
const DEFAULT_BODY =
  "Hi,\n\nJust checking in on the homes you were viewing. Happy to set up a showing or refine your alerts.\n\n— Houzzat";

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-CA");
  } catch {
    return iso;
  }
}

function kindLabel(kind: string | null): string | null {
  if (!kind) return null;
  return kind.replaceAll("_", " ");
}

type LeadComposerHint = {
  toEmail: string | null;
  consented: boolean;
  alertsEnabled: boolean;
};

function composerFromProps(input: {
  customerEmail?: string | null;
  contactConsentAt?: string | null;
  customerCaslConsentAt?: string | null;
  emailAlertsEnabled?: boolean;
}): LeadComposerHint {
  return {
    toEmail: input.customerEmail?.trim() || null,
    consented: Boolean(
      input.contactConsentAt || input.customerCaslConsentAt,
    ),
    alertsEnabled: input.emailAlertsEnabled !== false,
  };
}

type ConversationsTabProps = {
  leadId: string;
  workspaceId: string | undefined;
  /** From Lead Detail — enables composer before /conversations responds. */
  customerEmail?: string | null;
  contactConsentAt?: string | null;
  customerCaslConsentAt?: string | null;
  emailAlertsEnabled?: boolean;
  /** Seed from Lead Detail emails[] when /conversations is not deployed yet. */
  seedEmails?: MobileLeadEmail[];
};

export function ConversationsTab({
  leadId,
  workspaceId,
  customerEmail,
  contactConsentAt,
  customerCaslConsentAt,
  emailAlertsEnabled,
  seedEmails,
}: ConversationsTabProps) {
  const leadComposer = useMemo(
    () =>
      composerFromProps({
        customerEmail,
        contactConsentAt,
        customerCaslConsentAt,
        emailAlertsEnabled,
      }),
    [
      customerEmail,
      contactConsentAt,
      customerCaslConsentAt,
      emailAlertsEnabled,
    ],
  );

  const cacheKey = workspaceId
    ? `${workspaceId}:${leadId}:conversations`
    : "";
  const cached = cacheKey ? conversationCache.get(cacheKey) : undefined;

  const initialComposer = cached?.composer ?? leadComposer;
  const initialEmails =
    cached?.emails ?? (seedEmails && seedEmails.length > 0 ? seedEmails : []);

  const [emails, setEmails] = useState<MobileLeadEmail[]>(initialEmails);
  const [nextCursor, setNextCursor] = useState<string | null>(
    cached?.nextCursor ?? null,
  );
  const [toEmail, setToEmail] = useState<string | null>(
    initialComposer.toEmail,
  );
  const [consented, setConsented] = useState(initialComposer.consented);
  const [alertsEnabled, setAlertsEnabled] = useState(
    initialComposer.alertsEnabled,
  );
  const [loading, setLoading] = useState(!cached && initialEmails.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingLeadDetailFallback, setUsingLeadDetailFallback] = useState(false);

  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [sendPending, setSendPending] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);

  const [preview, setPreview] = useState<MobileLeadEmail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const persistCache = useCallback(
    (
      list: MobileLeadEmail[],
      cursor: string | null,
      composer: {
        toEmail: string | null;
        consented: boolean;
        alertsEnabled: boolean;
      },
    ) => {
      if (!cacheKey) return;
      conversationCache.set(cacheKey, {
        emails: list,
        nextCursor: cursor,
        composer,
        timestamp: Date.now(),
      });
    },
    [cacheKey],
  );

  const applyComposer = useCallback(
    (composer: LeadComposerHint) => {
      setToEmail(composer.toEmail);
      setConsented(composer.consented);
      setAlertsEnabled(composer.alertsEnabled);
      return composer;
    },
    [],
  );

  const loadFromLeadDetail = useCallback(async (): Promise<boolean> => {
    try {
      const res = await mobileApiClient.get<unknown>(
        `/leads/${encodeURIComponent(leadId)}`,
      );
      if (!res.ok) return false;

      const list = unwrapLeadDetailEmails(res.data);
      const composer =
        unwrapLeadDetailComposer(res.data) ?? leadComposer;
      applyComposer(composer);

      if (list.length > 0) {
        setEmails(list);
        persistCache(list, null, composer);
        setNextCursor(null);
        setUsingLeadDetailFallback(true);
        setError(null);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [applyComposer, leadComposer, leadId, persistCache]);

  const fetchEmails = useCallback(
    async (opts?: { cursor?: string | null; append?: boolean }) => {
      const append = Boolean(opts?.append);
      if (append) setLoadingMore(true);
      else setError(null);

      try {
        const qs =
          opts?.cursor != null && opts.cursor !== ""
            ? `?cursor=${encodeURIComponent(opts.cursor)}`
            : "";
        const res = await mobileApiClient.get<unknown>(
          `/leads/${encodeURIComponent(leadId)}/conversations${qs}`,
        );

        if (!res.ok) {
          if (!append) {
            applyComposer(leadComposer);
            if (seedEmails && seedEmails.length > 0) {
              setEmails(seedEmails);
              persistCache(seedEmails, null, leadComposer);
              setUsingLeadDetailFallback(true);
              setError(null);
            } else {
              const loaded = await loadFromLeadDetail();
              if (!loaded) {
                if (res.code === "NOT_FOUND") {
                  setError(
                    "Email history sync is not live on production yet. Pull to refresh Lead Detail after backend deploy, or use web CRM.",
                  );
                } else {
                  setError(res.message || "Could not load emails");
                }
              }
            }
          }
          return;
        }

        setUsingLeadDetailFallback(false);
        const list = unwrapEmailsList(res.data);
        const cursor = unwrapNextCursor(res.data);
        const composer = unwrapComposer(res.data);
        applyComposer(composer);

        setEmails((prev) => {
          const merged = append
            ? [
                ...prev,
                ...list.filter((e) => !prev.some((p) => p.id === e.id)),
              ]
            : list;
          persistCache(merged, cursor, composer);
          return merged;
        });
        setNextCursor(cursor);
      } catch (err: unknown) {
        if (!append) {
          applyComposer(leadComposer);
          const loaded = await loadFromLeadDetail();
          if (!loaded) {
            setError(
              err instanceof Error ? err.message : "Could not load emails",
            );
          }
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [
      applyComposer,
      leadComposer,
      leadId,
      loadFromLeadDetail,
      persistCache,
      seedEmails,
    ],
  );

  useEffect(() => {
    applyComposer(leadComposer);
    if (seedEmails && seedEmails.length > 0) {
      setEmails(seedEmails);
      persistCache(seedEmails, null, leadComposer);
      setLoading(false);
    }
  }, [
    applyComposer,
    contactConsentAt,
    customerCaslConsentAt,
    customerEmail,
    emailAlertsEnabled,
    leadComposer,
    persistCache,
    seedEmails,
  ]);

  useEffect(() => {
    const entry = cacheKey ? conversationCache.get(cacheKey) : undefined;
    if (entry) {
      setEmails(entry.emails);
      setNextCursor(entry.nextCursor);
      applyComposer(entry.composer);
      setLoading(false);
    } else if (!seedEmails?.length) {
      setLoading(true);
    }
    void fetchEmails();
  }, [leadId, workspaceId, cacheKey, fetchEmails, applyComposer, seedEmails]);

  const canSend =
    Boolean(toEmail) && consented && alertsEnabled && !sendPending;

  const handleSend = async () => {
    if (!canSend) return;
    const trimmedSubject = subject.trim();
    const trimmedBody = body.trim();
    if (!trimmedSubject || !trimmedBody) {
      setSendMessage("Subject and body are required.");
      return;
    }
    setSendPending(true);
    setSendMessage(null);
    try {
      const res = await mobileApiClient.post<unknown>(
        `/leads/${encodeURIComponent(leadId)}/conversations`,
        { subject: trimmedSubject, body: trimmedBody },
      );

      if (!res.ok) {
        if (res.code === "NOT_FOUND") {
          setSendMessage(
            "Send from mobile requires the conversations API on production. Deploy backend update, then retry.",
          );
        } else {
          setSendMessage(res.message || "Send failed.");
        }
        return;
      }

      const created = unwrapEmail(res.data);
      if (created) {
        setEmails((prev) => {
          const next = [created, ...prev.filter((e) => e.id !== created.id)];
          persistCache(next, nextCursor, {
            toEmail,
            consented,
            alertsEnabled,
          });
          return next;
        });
        setSendMessage("Email sent and logged.");
      } else {
        setSendMessage("Email sent and logged.");
        void fetchEmails();
      }
    } catch (err: unknown) {
      setSendMessage(err instanceof Error ? err.message : "Send failed.");
    } finally {
      setSendPending(false);
    }
  };

  const openPreview = async (email: MobileLeadEmail) => {
    setPreview(email);
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const res = await mobileApiClient.get<unknown>(
        `/leads/${encodeURIComponent(leadId)}/conversations/${encodeURIComponent(email.id)}`,
      );
      if (!res.ok) {
        if (res.code === "NOT_FOUND") {
          setPreviewError(
            "Full template preview requires the conversations API on production.",
          );
        } else {
          setPreviewError(res.message || "Failed to load email");
        }
        return;
      }
      const full = unwrapEmail(res.data);
      if (full) setPreview(full);
    } catch (err: unknown) {
      setPreviewError(
        err instanceof Error ? err.message : "Failed to load email",
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      {/* Web Panel title="Send email" + LeadEmailForm */}
      <View style={styles.panel} accessibilityLabel="Send email form">
        <Text style={styles.panelTitle}>Send email</Text>
        <View style={styles.formInner}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>Email lead</Text>
            <Text style={styles.formMeta}>
              {toEmail || "No email"} · {consented ? "CASL ok" : "No consent"}
            </Text>
          </View>
          <TextInput
            style={styles.subjectInput}
            value={subject}
            onChangeText={setSubject}
            placeholder="Subject"
            placeholderTextColor="#94A3B8"
            editable={!sendPending}
            accessibilityLabel="Email subject"
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
            accessibilityLabel="Email body"
          />
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            disabled={!canSend}
            onPress={() => void handleSend()}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Send email"
          >
            <Text style={styles.sendBtnText}>
              {sendPending ? "…" : "Send email"}
            </Text>
          </TouchableOpacity>
          {sendMessage ? (
            <Text style={styles.sendMessage}>{sendMessage}</Text>
          ) : null}
        </View>
      </View>

      {usingLeadDetailFallback && emails.length > 0 ? (
        <Text style={styles.fallbackHint}>
          Showing email history from Lead Detail (conversations sync pending).
        </Text>
      ) : null}

      {loading && emails.length === 0 ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#1E2A38" />
          <Text style={styles.loadingText}>Loading emails…</Text>
        </View>
      ) : null}

      {error && emails.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => void fetchEmails()} activeOpacity={0.8}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!loading && emails.length === 0 && !error ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No emails logged yet.</Text>
        </View>
      ) : null}

      {emails.map((e) => (
        <View key={e.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardSubject} numberOfLines={2}>
              {e.subject}
            </Text>
            <Text style={styles.cardTime}>{formatWhen(e.createdAt)}</Text>
          </View>
          <Text style={styles.cardMeta}>
            To {e.toEmail}
            {kindLabel(e.kind) ? (
              <Text style={styles.cardKind}>
                {" · "}
                {kindLabel(e.kind)}
              </Text>
            ) : null}
          </Text>
          <View style={styles.badgeRow}>
            {e.openedAt ? (
              <View style={[styles.badge, styles.badgeOpened]}>
                <Text style={styles.badgeOpenedText}>
                  Opened
                  {e.openCount > 1 ? ` · ${e.openCount}×` : ""}
                </Text>
              </View>
            ) : (
              <View style={[styles.badge, styles.badgeMuted]}>
                <Text style={styles.badgeMutedText}>Not opened yet</Text>
              </View>
            )}
            {e.clickedAt ? (
              <View style={[styles.badge, styles.badgeClicked]}>
                <Text style={styles.badgeClickedText}>
                  Clicked
                  {e.clickCount > 1 ? ` · ${e.clickCount}×` : ""}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.cardBody} numberOfLines={4}>
            {e.body}
          </Text>
          <TouchableOpacity
            style={styles.previewBtn}
            onPress={() => void openPreview(e)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Preview email"
          >
            <Text style={styles.previewBtnText}>Preview</Text>
          </TouchableOpacity>
        </View>
      ))}

      {nextCursor ? (
        <TouchableOpacity
          style={styles.loadMoreBtn}
          disabled={loadingMore}
          onPress={() => void fetchEmails({ cursor: nextCursor, append: true })}
          activeOpacity={0.85}
        >
          <Text style={styles.loadMoreText}>
            {loadingMore ? "Loading…" : "Load older emails"}
          </Text>
        </TouchableOpacity>
      ) : null}

      <Modal
        visible={Boolean(preview)}
        animationType="slide"
        transparent
        onRequestClose={() => setPreview(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.previewChip}>Client preview</Text>
                <Text style={styles.modalSubject} numberOfLines={2}>
                  {preview?.subject ?? (previewLoading ? "Loading…" : "Email")}
                </Text>
                {preview ? (
                  <Text style={styles.modalMeta}>
                    To {preview.toEmail}
                    {preview.customerName ? ` · ${preview.customerName}` : ""}
                    {" · "}
                    {formatWhen(preview.createdAt)}
                    {preview.sentByName
                      ? ` · by ${preview.sentByName}`
                      : " · automated"}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={() => setPreview(null)}
                style={styles.modalClose}
                accessibilityRole="button"
                accessibilityLabel="Close preview"
              >
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              {previewLoading ? (
                <View style={styles.modalBodyPad}>
                  <Text style={styles.loadingText}>
                    Loading what the client received…
                  </Text>
                </View>
              ) : previewError ? (
                <View style={styles.modalBodyPad}>
                  <Text style={styles.errorText}>{previewError}</Text>
                  {preview?.body ? (
                    <Text style={styles.previewBody}>{preview.body}</Text>
                  ) : null}
                </View>
              ) : preview?.htmlBody?.trim() ? (
                <EmailHtmlPreview htmlBody={preview.htmlBody.trim()} />
              ) : (
                <ScrollView
                  style={styles.modalBodyScroll}
                  contentContainerStyle={styles.modalBodyPad}
                >
                  <Text style={styles.previewBody}>{preview?.body ?? ""}</Text>
                </ScrollView>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
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
  formInner: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 8,
  },
  formHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  formTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E2A38",
  },
  formMeta: {
    fontSize: 11,
    color: "#94A3B8",
  },
  subjectInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: "#1E2A38",
    backgroundColor: "#FFFFFF",
  },
  bodyInput: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: "#1E2A38",
    backgroundColor: "#FFFFFF",
  },
  sendBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#0F766E",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  sendBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  sendMessage: {
    fontSize: 12,
    color: "#64748B",
  },
  fallbackHint: {
    fontSize: 11,
    color: "#64748B",
    fontStyle: "italic",
    marginBottom: 4,
  },
  loadingBox: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: "#94A3B8",
  },
  emptyBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D8DEE6",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingVertical: 36,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
  },
  errorText: {
    fontSize: 12,
    color: "#B91C1C",
    fontWeight: "600",
  },
  retryText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: "#0F766E",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  cardSubject: {
    flex: 1,
    minWidth: 140,
    fontSize: 14,
    fontWeight: "600",
    color: "#1E2A38",
  },
  cardTime: {
    fontSize: 11,
    color: "#94A3B8",
  },
  cardMeta: {
    marginTop: 2,
    fontSize: 12,
    color: "#64748B",
  },
  cardKind: {
    fontSize: 12,
    color: "#94A3B8",
    textTransform: "capitalize",
  },
  badgeRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeOpened: {
    backgroundColor: "#D1FAE5",
    borderWidth: 1,
    borderColor: "#6EE7B7",
  },
  badgeOpenedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
  },
  badgeMuted: {
    backgroundColor: "#F1F5F9",
  },
  badgeMutedText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
  },
  badgeClicked: {
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  badgeClickedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B45309",
  },
  cardBody: {
    marginTop: 8,
    fontSize: 13,
    color: "#475569",
  },
  previewBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: "#0F172A",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  previewBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  loadMoreBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  loadMoreText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F766E",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    flex: 1,
    maxHeight: "88%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F6",
    backgroundColor: "#F8FAFC",
  },
  modalHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  previewChip: {
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "700",
    color: "#0E7490",
    backgroundColor: "#ECFEFF",
    overflow: "hidden",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 6,
  },
  modalSubject: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748B",
  },
  modalClose: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  modalCloseText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  modalBody: {
    flex: 1,
    minHeight: 320,
    backgroundColor: "#F1F5F9",
  },
  modalBodyScroll: {
    flex: 1,
  },
  modalBodyPad: {
    padding: 16,
    minHeight: 200,
  },
  previewBody: {
    fontSize: 14,
    lineHeight: 20,
    color: "#334155",
  },
});
