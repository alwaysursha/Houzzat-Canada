/**
 * Stage 5.3 — Email property shortlist to a lead (EngagementMatchboard parity).
 */

import React, { useCallback, useEffect, useState } from "react";
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
import { mobileApiClient } from "../api/client";
import { unwrapShortlistEmail } from "../lib/property-response";
import { withQuery } from "../lib/query-string";
import { clearLeadEngagementCache } from "../lib/lead-tab-cache";
import { invalidateLeadDetailCacheEntry } from "../screens/LeadDetailScreen";
import { useAuth } from "../state/AuthContext";
import type { LeadsResponseData, MobileLeadSummary } from "../types/lead";
import type { MobileLeadDetail } from "../types/lead";

type ShortlistEmailSheetProps = {
  visible: boolean;
  mlsNumbers: string[];
  onClose: () => void;
  onSuccess: (result: { shareUrl: string; count: number; leadId: string }) => void;
};

function leadDisplayName(lead: MobileLeadSummary): string {
  return (
    lead.customer?.name?.trim() ||
    lead.customer?.email?.trim() ||
    lead.customer?.phone?.trim() ||
    "Lead"
  );
}

function isLeadEmailEligible(detail: MobileLeadDetail): {
  ok: boolean;
  reason: string | null;
} {
  const email = detail.customer?.email?.trim();
  if (!email) {
    return { ok: false, reason: "No email on file" };
  }
  const consented =
    Boolean(detail.contactConsentAt) ||
    Boolean(detail.customer?.caslConsentAt);
  if (!consented) {
    return { ok: false, reason: "Needs CASL consent" };
  }
  if (detail.customer?.emailAlertsEnabled === false) {
    return { ok: false, reason: "Email alerts are off" };
  }
  return { ok: true, reason: null };
}

export function ShortlistEmailSheet({
  visible,
  mlsNumbers,
  onClose,
  onSuccess,
}: ShortlistEmailSheetProps) {
  const { activeWorkspace } = useAuth();
  const workspaceId = activeWorkspace?.id;

  const [search, setSearch] = useState("");
  const [leads, setLeads] = useState<MobileLeadSummary[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadDetail, setLeadDetail] = useState<MobileLeadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [note, setNote] = useState("");
  const [sendPending, setSendPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const reset = useCallback(() => {
    setSearch("");
    setLeads([]);
    setSelectedLeadId(null);
    setLeadDetail(null);
    setNote("");
    setError(null);
    setSuccessMsg(null);
    setSendPending(false);
  }, []);

  useEffect(() => {
    if (!visible) {
      reset();
    }
  }, [visible, reset]);

  const fetchLeads = useCallback(async (q: string) => {
    setLeadsLoading(true);
    setError(null);
    try {
      const endpoint = withQuery("/leads", {
        limit: "25",
        search: q.trim() || undefined,
      });
      const res = await mobileApiClient.get<unknown>(endpoint);
      if (!res.ok) {
        setError(res.message || "Could not load leads");
        return;
      }
      const raw = res.data as { data?: LeadsResponseData; leads?: MobileLeadSummary[] };
      const list =
        raw?.data?.leads ??
        (raw as LeadsResponseData)?.leads ??
        [];
      setLeads(list);
    } finally {
      setLeadsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      void fetchLeads(search);
    }, search.trim() ? 280 : 0);
    return () => clearTimeout(timer);
  }, [visible, search, fetchLeads]);

  const selectLead = async (leadId: string) => {
    setSelectedLeadId(leadId);
    setLeadDetail(null);
    setDetailLoading(true);
    setError(null);
    try {
      const res = await mobileApiClient.get<unknown>(
        `/leads/${encodeURIComponent(leadId)}`,
      );
      if (!res.ok) {
        setError(res.message || "Could not load lead");
        return;
      }
      const raw = res.data as {
        lead?: MobileLeadDetail;
        data?: { lead?: MobileLeadDetail };
      };
      const detail =
        raw?.lead ?? raw?.data?.lead ?? null;
      if (!detail) {
        setError("Lead not found");
        return;
      }
      setLeadDetail(detail);
    } finally {
      setDetailLoading(false);
    }
  };

  const eligibility = leadDetail ? isLeadEmailEligible(leadDetail) : null;

  const handleSend = async () => {
    if (!selectedLeadId || sendPending || mlsNumbers.length === 0) return;
    if (eligibility && !eligibility.ok) {
      setError(eligibility.reason || "Cannot email this lead");
      return;
    }
    setSendPending(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await mobileApiClient.post<unknown>(
        "/properties/shortlist-email",
        {
          leadId: selectedLeadId,
          mlsNumbers,
          note: note.trim() || undefined,
        },
      );
      if (!res.ok) {
        setError(res.message || "Send failed");
        return;
      }
      const parsed = unwrapShortlistEmail(res.data);
      if (!parsed) {
        setError("Unexpected response");
        return;
      }
      if (workspaceId) {
        invalidateLeadDetailCacheEntry(workspaceId, parsed.leadId);
        clearLeadEngagementCache(workspaceId);
      }
      setSuccessMsg(
        parsed.stubbed
          ? `Shortlist ready (email stubbed in dev). ${parsed.count} homes.`
          : `Emailed ${parsed.count} homes with share link.`,
      );
      onSuccess({
        shareUrl: parsed.shareUrl,
        count: parsed.count,
        leadId: parsed.leadId,
      });
    } finally {
      setSendPending(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>Email shortlist</Text>
              <Text style={styles.title}>
                {mlsNumbers.length} home{mlsNumbers.length === 1 ? "" : "s"} selected
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.label}>Choose lead</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search name, email, phone…"
              placeholderTextColor="#94A3B8"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {leadsLoading ? (
              <View style={styles.loader}>
                <ActivityIndicator color="#0F766E" />
              </View>
            ) : leads.length === 0 ? (
              <Text style={styles.empty}>No leads found.</Text>
            ) : (
              <View style={styles.leadList}>
                {leads.map((lead) => {
                  const active = selectedLeadId === lead.id;
                  return (
                    <TouchableOpacity
                      key={lead.id}
                      style={[styles.leadRow, active && styles.leadRowActive]}
                      onPress={() => void selectLead(lead.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.leadName}>{leadDisplayName(lead)}</Text>
                      <Text style={styles.leadMeta}>
                        {lead.customer?.email?.trim() || "No email"}
                        {lead.customer?.phone ? ` · ${lead.customer.phone}` : ""}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {detailLoading ? (
              <View style={styles.loader}>
                <ActivityIndicator color="#2B6CB0" />
              </View>
            ) : null}

            {leadDetail && eligibility ? (
              <View style={styles.consentBox}>
                <Text style={styles.consentLabel}>
                  {leadDetail.customer?.email?.trim() || "No email"}
                  {" · "}
                  {eligibility.ok ? "CASL ok" : eligibility.reason}
                </Text>
              </View>
            ) : null}

            <Text style={[styles.label, styles.labelSpaced]}>Optional note</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Note for the lead…"
              placeholderTextColor="#94A3B8"
              style={[styles.searchInput, styles.noteInput]}
              multiline
              maxLength={2000}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {successMsg ? <Text style={styles.success}>{successMsg}</Text> : null}

            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!selectedLeadId || sendPending || (eligibility && !eligibility.ok)) &&
                  styles.sendBtnDisabled,
              ]}
              disabled={
                !selectedLeadId ||
                sendPending ||
                Boolean(eligibility && !eligibility.ok)
              }
              onPress={() => void handleSend()}
              activeOpacity={0.85}
            >
              {sendPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.sendBtnText}>Email shortlist</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "88%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerText: {
    flex: 1,
    paddingRight: 12,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: "#0284C7",
  },
  title: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: "700",
    color: "#1E2A38",
  },
  closeBtn: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  closeText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  labelSpaced: {
    marginTop: 8,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#D8DEE6",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1E2A38",
    backgroundColor: "#FFFFFF",
  },
  noteInput: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  leadList: {
    gap: 8,
    marginTop: 4,
  },
  leadRow: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#FFFFFF",
  },
  leadRowActive: {
    borderColor: "#2B6CB0",
    backgroundColor: "#EFF6FF",
  },
  leadName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E2A38",
  },
  leadMeta: {
    marginTop: 2,
    fontSize: 12,
    color: "#64748B",
  },
  consentBox: {
    marginTop: 4,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  consentLabel: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
  },
  loader: {
    marginVertical: 8,
  },
  empty: {
    fontSize: 13,
    color: "#94A3B8",
    paddingVertical: 8,
  },
  error: {
    fontSize: 13,
    color: "#BE123C",
    fontWeight: "600",
  },
  success: {
    fontSize: 13,
    color: "#0F766E",
    fontWeight: "600",
  },
  sendBtn: {
    marginTop: 12,
    backgroundColor: "#2B6CB0",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
