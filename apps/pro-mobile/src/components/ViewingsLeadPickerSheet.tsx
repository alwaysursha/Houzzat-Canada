/**
 * Stage 5.6 — Lead picker for Viewings Planner (from shortlist without a lead).
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
import { withQuery } from "../lib/query-string";
import type { LeadsResponseData, MobileLeadSummary } from "../types/lead";

type ViewingsLeadPickerSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (leadId: string, leadName: string) => void;
};

function leadDisplayName(lead: MobileLeadSummary): string {
  return (
    lead.customer?.name?.trim() ||
    lead.customer?.email?.trim() ||
    lead.customer?.phone?.trim() ||
    "Lead"
  );
}

export function ViewingsLeadPickerSheet({
  visible,
  onClose,
  onSelect,
}: ViewingsLeadPickerSheetProps) {
  const [search, setSearch] = useState("");
  const [leads, setLeads] = useState<MobileLeadSummary[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setSearch("");
    setLeads([]);
    setError(null);
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
              <Text style={styles.eyebrow}>Plan viewings</Text>
              <Text style={styles.title}>Choose a lead</Text>
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
                {leads.map((lead) => (
                  <TouchableOpacity
                    key={lead.id}
                    style={styles.leadRow}
                    onPress={() => onSelect(lead.id, leadDisplayName(lead))}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.leadName}>{leadDisplayName(lead)}</Text>
                    <Text style={styles.leadMeta}>
                      {lead.customer?.email?.trim() || "No email"}
                      {lead.customer?.phone ? ` · ${lead.customer.phone}` : ""}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}
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
    maxHeight: "75%",
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
    color: "#0F766E",
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
});
