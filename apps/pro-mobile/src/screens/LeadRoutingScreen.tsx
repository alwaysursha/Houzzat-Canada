/**
 * Native Lead Routing — workspace CRM routing settings.
 *
 * Web authority: /admin/lead-routing (LeadRoutingAdminClient).
 * Data: GET/PATCH /api/mobile/v2/lead-routing
 * Reuses CrmRoutingSettings / weights — no duplicate backend.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import { useAuth } from "../state/AuthContext";

type Agent = { id: string; name: string | null; email: string };
type WeightRow = {
  agentId: string;
  percent: number;
  assignedCount: number;
  agent: Agent;
};
type RoutingPayload = {
  agents: Agent[];
  listingAgentId: string | null;
  sellerAssignMode: "LISTING_AGENT" | "PERCENTAGE";
  buyerWeights: WeightRow[];
  sellerWeights: WeightRow[];
};

function unwrapRouting(payload: unknown): RoutingPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const data =
    root.ok === true && root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  if (!Array.isArray(data.agents)) return null;
  return data as unknown as RoutingPayload;
}

export function LeadRoutingScreen() {
  const { activeWorkspace } = useAuth();
  const workspaceId = activeWorkspace?.id;

  const [payload, setPayload] = useState<RoutingPayload | null>(null);
  const [listingAgentId, setListingAgentId] = useState("");
  const [sellerAssignMode, setSellerAssignMode] = useState<
    "LISTING_AGENT" | "PERCENTAGE"
  >("LISTING_AGENT");
  const [buyerPercents, setBuyerPercents] = useState<Record<string, number>>(
    {},
  );
  const [sellerPercents, setSellerPercents] = useState<Record<string, number>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const applyPayload = useCallback((data: RoutingPayload) => {
    setPayload(data);
    setListingAgentId(data.listingAgentId ?? data.agents[0]?.id ?? "");
    setSellerAssignMode(data.sellerAssignMode);
    setBuyerPercents(
      Object.fromEntries(data.buyerWeights.map((w) => [w.agentId, w.percent])),
    );
    setSellerPercents(
      Object.fromEntries(data.sellerWeights.map((w) => [w.agentId, w.percent])),
    );
  }, []);

  const load = useCallback(
    async (soft?: boolean) => {
      if (!workspaceId) {
        setLoading(false);
        return;
      }
      if (soft) setRefreshing(true);
      else {
        setLoading(true);
        setError(null);
      }
      const res = await mobileApiClient.get<unknown>("/lead-routing");
      if (!res.ok) {
        setError(res.message || "Couldn’t load lead routing.");
        setPayload(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const data = unwrapRouting(res.data);
      if (!data) {
        setError("Couldn’t load lead routing.");
        setPayload(null);
      } else {
        applyPayload(data);
        setError(null);
      }
      setLoading(false);
      setRefreshing(false);
    },
    [workspaceId, applyPayload],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const agents = payload?.agents ?? [];
  const buyerSum = useMemo(
    () => agents.reduce((s, a) => s + (buyerPercents[a.id] ?? 0), 0),
    [agents, buyerPercents],
  );
  const sellerSum = useMemo(
    () => agents.reduce((s, a) => s + (sellerPercents[a.id] ?? 0), 0),
    [agents, sellerPercents],
  );

  function splitEven(setter: (v: Record<string, number>) => void) {
    const n = agents.length;
    if (n === 0) return;
    const base = Math.floor(100 / n);
    const rem = 100 - base * n;
    const next: Record<string, number> = {};
    agents.forEach((a, i) => {
      next[a.id] = base + (i === 0 ? rem : 0);
    });
    setter(next);
  }

  async function save() {
    setSaveMessage(null);
    if (agents.length > 1 && buyerSum !== 100) {
      setSaveMessage(`Buyer routing must total 100% (now ${buyerSum}%).`);
      return;
    }
    if (
      sellerAssignMode === "PERCENTAGE" &&
      agents.length > 1 &&
      sellerSum !== 100
    ) {
      setSaveMessage(`Seller routing must total 100% (now ${sellerSum}%).`);
      return;
    }
    setSaving(true);
    const res = await mobileApiClient.patch<unknown>("/lead-routing", {
      listingAgentId: listingAgentId || null,
      sellerAssignMode,
      buyerWeights: agents.map((a) => ({
        agentId: a.id,
        percent: buyerPercents[a.id] ?? 0,
      })),
      sellerWeights: agents.map((a) => ({
        agentId: a.id,
        percent: sellerPercents[a.id] ?? 0,
      })),
    });
    setSaving(false);
    if (!res.ok) {
      setSaveMessage(res.message || "Couldn’t save routing.");
      return;
    }
    const data = unwrapRouting(res.data);
    if (data) applyPayload(data);
    setSaveMessage("Lead routing saved.");
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1E2A38" />
      </View>
    );
  }

  if (error && !payload) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <TouchableOpacity style={styles.retry} onPress={() => void load()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (agents.length === 0) {
    return (
      <View style={styles.root}>
        <View style={styles.topBar}>
          <Text style={styles.title}>Lead Routing</Text>
        </View>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No active agents found. Create an agent before configuring routing.
            New leads stay in the pond until then.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Lead Routing</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor="#1E2A38"
          />
        }
      >
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Listing agent</Text>
          <Text style={styles.hint}>
            Default assignee for seller leads when seller mode is “Listing
            agent”.
          </Text>
          {agents.map((a) => {
            const selected = listingAgentId === a.id;
            return (
              <TouchableOpacity
                key={a.id}
                style={[styles.choice, selected && styles.choiceActive]}
                onPress={() => setListingAgentId(a.id)}
              >
                <Text
                  style={[
                    styles.choiceText,
                    selected && styles.choiceTextActive,
                  ]}
                >
                  {a.name?.trim() || a.email}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Buyer routing %</Text>
          <View style={styles.rowBetween}>
            <Text style={styles.hint}>Total {buyerSum}%</Text>
            <TouchableOpacity onPress={() => splitEven(setBuyerPercents)}>
              <Text style={styles.link}>Split evenly</Text>
            </TouchableOpacity>
          </View>
          {agents.map((a) => (
            <View key={`b-${a.id}`} style={styles.percentRow}>
              <Text style={styles.agentLabel} numberOfLines={1}>
                {a.name?.trim() || a.email}
              </Text>
              <TextInput
                style={styles.percentInput}
                keyboardType="number-pad"
                value={String(buyerPercents[a.id] ?? 0)}
                onChangeText={(t) => {
                  const n = Math.max(0, Math.min(100, Number(t.replace(/\D/g, "")) || 0));
                  setBuyerPercents((prev) => ({ ...prev, [a.id]: n }));
                }}
              />
              <Text style={styles.percentSuffix}>%</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Seller assign mode</Text>
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[
                styles.modeChip,
                sellerAssignMode === "LISTING_AGENT" && styles.modeChipActive,
              ]}
              onPress={() => setSellerAssignMode("LISTING_AGENT")}
            >
              <Text
                style={[
                  styles.modeChipText,
                  sellerAssignMode === "LISTING_AGENT" &&
                    styles.modeChipTextActive,
                ]}
              >
                Listing agent
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeChip,
                sellerAssignMode === "PERCENTAGE" && styles.modeChipActive,
              ]}
              onPress={() => setSellerAssignMode("PERCENTAGE")}
            >
              <Text
                style={[
                  styles.modeChipText,
                  sellerAssignMode === "PERCENTAGE" &&
                    styles.modeChipTextActive,
                ]}
              >
                Percentage
              </Text>
            </TouchableOpacity>
          </View>
          {sellerAssignMode === "PERCENTAGE" ? (
            <>
              <View style={styles.rowBetween}>
                <Text style={styles.hint}>Total {sellerSum}%</Text>
                <TouchableOpacity onPress={() => splitEven(setSellerPercents)}>
                  <Text style={styles.link}>Split evenly</Text>
                </TouchableOpacity>
              </View>
              {agents.map((a) => (
                <View key={`s-${a.id}`} style={styles.percentRow}>
                  <Text style={styles.agentLabel} numberOfLines={1}>
                    {a.name?.trim() || a.email}
                  </Text>
                  <TextInput
                    style={styles.percentInput}
                    keyboardType="number-pad"
                    value={String(sellerPercents[a.id] ?? 0)}
                    onChangeText={(t) => {
                      const n = Math.max(
                        0,
                        Math.min(100, Number(t.replace(/\D/g, "")) || 0),
                      );
                      setSellerPercents((prev) => ({ ...prev, [a.id]: n }));
                    }}
                  />
                  <Text style={styles.percentSuffix}>%</Text>
                </View>
              ))}
            </>
          ) : null}
        </View>

        {saveMessage ? (
          <Text
            style={[
              styles.saveMsg,
              saveMessage.includes("saved")
                ? styles.saveOk
                : styles.saveErr,
            ]}
          >
            {saveMessage}
          </Text>
        ) : null}

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          disabled={saving}
          onPress={() => void save()}
        >
          <Text style={styles.saveBtnText}>
            {saving ? "Saving…" : "Save routing"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F4F7F5" },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  title: { fontSize: 20, fontWeight: "700", color: "#1E2A38" },
  content: { padding: 14, gap: 12, paddingBottom: 32 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
  },
  error: { color: "#B91C1C", textAlign: "center", fontSize: 14 },
  retry: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  retryText: { fontWeight: "600", color: "#1E2A38" },
  emptyCard: {
    margin: 14,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  emptyText: { color: "#78350F", fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#1E2A38" },
  hint: { fontSize: 12, color: "#64748B", lineHeight: 17 },
  choice: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#F8FAFC",
  },
  choiceActive: {
    borderColor: "#1E2A38",
    backgroundColor: "rgba(30, 42, 56, 0.08)",
  },
  choiceText: { fontSize: 14, color: "#334155", fontWeight: "600" },
  choiceTextActive: { color: "#1E2A38" },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  link: { fontSize: 12, fontWeight: "700", color: "#0F766E" },
  percentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  agentLabel: { flex: 1, fontSize: 13, color: "#1E2A38", fontWeight: "600" },
  percentInput: {
    width: 56,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: "center",
    fontSize: 14,
    color: "#1E2A38",
    backgroundColor: "#F8FAFC",
  },
  percentSuffix: { width: 16, fontSize: 13, color: "#64748B" },
  modeRow: { flexDirection: "row", gap: 8 },
  modeChip: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  modeChipActive: {
    borderColor: "#1E2A38",
    backgroundColor: "rgba(30, 42, 56, 0.08)",
  },
  modeChipText: { fontSize: 12, fontWeight: "600", color: "#64748B" },
  modeChipTextActive: { color: "#1E2A38" },
  saveBtn: {
    backgroundColor: "#1E2A38",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  saveMsg: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  saveOk: { color: "#0F766E" },
  saveErr: { color: "#B91C1C" },
});
