/**
 * Stage 5.12A — Native Advanced CMA library + create/review flow.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  arrayBufferToBase64,
  saveCmaPdfToDevice,
  shareCmaPdf,
} from "../lib/cma-pdf-native";


type Props = { onBack: () => void };

type CmaListItem = {
  id: string;
  subjectAddress: string | null;
  subjectMls: string | null;
  city: string;
  summary: string;
  confidence: string | null;
  recommendedListPrice: number | null;
  updatedAt: string;
  revoked: boolean;
};

type CmaDetail = {
  id: string;
  token: string;
  shareUrl: string;
  subjectAddress?: string | null;
  summary: string;
  recommendedListPrice: number | null;
  recommendationNote: string | null;
  narrative: string | null;
  leadId: string | null;
  analysis: {
    confidence: string;
    soldCompCount: number;
    medianSoldPrice: number | null;
    limitedInventory: boolean;
    weightedIndicatedLow: number | null;
    weightedIndicatedHigh: number | null;
    marketContext: string;
  } | null;
  selectedComps: {
    items: Array<{
      mlsNumber: string;
      source: string;
      role: string;
      score: number;
      outlier: boolean;
      distanceKm: number;
      reasons: string[];
      property: {
        addressLine: string;
        soldPrice: number | null;
        listPrice: number;
        beds: number;
        baths: number;
        sqft: number | null;
      };
    }>;
  } | null;
};

function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

export function CmaScreen({ onBack }: Props) {
  const [items, setItems] = useState<CmaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subjectMls, setSubjectMls] = useState("");
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<CmaDetail | null>(null);
  const [recPrice, setRecPrice] = useState("");
  const [recNote, setRecNote] = useState("");
  const [savingRec, setSavingRec] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const pdfInFlight = useRef(false);
  const [leadId, setLeadId] = useState("");

  const loadList = useCallback(async (soft?: boolean) => {
    if (!soft) setLoading(true);
    setError(null);
    try {
      const res = await mobileApiClient.get<{ items?: CmaListItem[] }>("/cma");
      if (!res.ok) {
        setError(res.message || "Couldn't load CMAs");
        return;
      }
      const payload = res.data as { data?: { items?: CmaListItem[] }; items?: CmaListItem[] };
      const list =
        payload?.data?.items ??
        (res.data as { items?: CmaListItem[] })?.items ??
        [];
      setItems(Array.isArray(list) ? list : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openDetail = async (id: string) => {
    setLoading(true);
    try {
      const res = await mobileApiClient.get<unknown>(`/cma/${id}`);
      if (!res.ok) {
        Alert.alert("Couldn't open CMA", res.message || "Try again");
        return;
      }
      const body = res.data as { data?: CmaDetail };
      const d = body.data ?? (res.data as CmaDetail);
      setDetail(d);
      setRecPrice(
        d.recommendedListPrice != null ? String(d.recommendedListPrice) : "",
      );
      setRecNote(d.recommendationNote ?? "");
      setLeadId(d.leadId ?? "");
    } finally {
      setLoading(false);
    }
  };

  const createCma = async () => {
    const mls = subjectMls.trim();
    if (!mls) {
      Alert.alert("Subject required", "Enter a subject MLS number.");
      return;
    }
    setCreating(true);
    try {
      const res = await mobileApiClient.post<{ id?: string }>("/cma", {
        subjectMls: mls,
        ...(leadId.trim() ? { leadId: leadId.trim() } : {}),
      });
      if (!res.ok) {
        Alert.alert("Couldn't create CMA", res.message || "Try again");
        return;
      }
      const body = res.data as { data?: { id?: string }; id?: string };
      const id = body.data?.id ?? body.id;
      setSubjectMls("");
      await loadList(true);
      if (id) await openDetail(id);
    } finally {
      setCreating(false);
    }
  };

  const saveRecommendation = async () => {
    if (!detail) return;
    setSavingRec(true);
    try {
      const price = recPrice.trim() ? Number(recPrice.trim()) : null;
      if (recPrice.trim() && (!Number.isFinite(price) || (price ?? 0) <= 0)) {
        Alert.alert("Invalid price", "Enter a positive whole-dollar amount.");
        return;
      }
      const res = await mobileApiClient.patch(`/cma/${detail.id}`, {
        recommendedListPrice: price,
        recommendationNote: recNote.trim() || null,
        ...(leadId.trim() ? { leadId: leadId.trim() } : {}),
      });
      if (!res.ok) {
        Alert.alert("Couldn't save", res.message || "Try again");
        return;
      }
      await openDetail(detail.id);
      Alert.alert("Saved", "Recommendation updated.");
    } finally {
      setSavingRec(false);
    }
  };

  const emailCma = async () => {
    if (!detail) return;
    if (!leadId.trim() && !detail.leadId) {
      Alert.alert(
        "Lead required",
        "Attach a lead ID, save, then email the CMA.",
      );
      return;
    }
    Alert.alert(
      "Email CMA?",
      "This sends a tenant-branded email with the secure CMA link. CASL consent is required.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: () => {
            void (async () => {
              setEmailing(true);
              try {
                if (leadId.trim() && leadId.trim() !== detail.leadId) {
                  const patch = await mobileApiClient.patch(`/cma/${detail.id}`, {
                    leadId: leadId.trim(),
                  });
                  if (!patch.ok) {
                    Alert.alert("Couldn't attach lead", patch.message || "");
                    return;
                  }
                }
                const res = await mobileApiClient.post(`/cma/${detail.id}/email`, {});
                if (!res.ok) {
                  Alert.alert("Couldn't email", res.message || "Try again");
                  return;
                }
                Alert.alert("Sent", "CMA email queued / logged.");
              } finally {
                setEmailing(false);
              }
            })();
          },
        },
      ],
    );
  };

  const fetchPdfBytes = async (): Promise<
    | { ok: true; base64: string; filename: string }
    | { ok: false; message: string }
  > => {
    if (!detail) return { ok: false, message: "No CMA open" };
    if (pdfInFlight.current) {
      return { ok: false, message: "PDF already preparing…" };
    }
    pdfInFlight.current = true;
    setPdfBusy(true);
    try {
      const res = await mobileApiClient.getPdf(`/cma/${detail.id}/pdf`, {
        timeoutMs: 90000,
      });
      if (!res.ok) {
        return {
          ok: false,
          message: res.message || "Couldn't generate PDF",
        };
      }
      const filename =
        res.filename ||
        `CMA-${(detail.subjectAddress ?? "Property").replace(/\s+/g, "-")}.pdf`;
      return {
        ok: true,
        base64: arrayBufferToBase64(res.bytes),
        filename,
      };
    } finally {
      pdfInFlight.current = false;
      setPdfBusy(false);
    }
  };

  const downloadPdf = async () => {
    const pdf = await fetchPdfBytes();
    if (!pdf.ok) {
      Alert.alert("Couldn't generate PDF", pdf.message, [
        { text: "OK" },
        { text: "Retry", onPress: () => void downloadPdf() },
      ]);
      return;
    }
    const saved = await saveCmaPdfToDevice(pdf.filename, pdf.base64);
    if (!saved.ok) {
      Alert.alert("Couldn't generate PDF", saved.message, [
        { text: "Retry", onPress: () => void downloadPdf() },
      ]);
      return;
    }
    Alert.alert("PDF ready", `Saved for sharing: ${pdf.filename}`);
  };

  const sharePdf = async () => {
    const pdf = await fetchPdfBytes();
    if (!pdf.ok) {
      Alert.alert("Couldn't generate PDF", pdf.message, [
        { text: "OK" },
        { text: "Retry", onPress: () => void sharePdf() },
      ]);
      return;
    }
    const shared = await shareCmaPdf(pdf.filename, pdf.base64);
    if (!shared.ok) {
      Alert.alert("Couldn't generate PDF", shared.message, [
        { text: "Retry", onPress: () => void sharePdf() },
      ]);
    }
  };

  const removeComp = async (mlsNumber: string) => {
    if (!detail?.selectedComps) return;
    const next = detail.selectedComps.items.filter(
      (c) => c.mlsNumber !== mlsNumber,
    );
    const res = await mobileApiClient.patch(`/cma/${detail.id}`, {
      selectedComps: next,
    });
    if (!res.ok) {
      Alert.alert("Couldn't update", res.message || "");
      return;
    }
    await openDetail(detail.id);
  };

  if (detail) {
    const sold =
      detail.selectedComps?.items.filter((c) => c.role === "SOLD") ?? [];
    const competition =
      detail.selectedComps?.items.filter(
        (c) => c.role === "ACTIVE" || c.role === "CONDITIONAL",
      ) ?? [];

    return (
      <View style={styles.root}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => {
              setDetail(null);
              void loadList(true);
            }}
          >
            <Text style={styles.backText}>← Library</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle}>CMA</Text>
          <View style={styles.topSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.h1}>{detail.summary}</Text>
          {detail.analysis ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                Analysis · {detail.analysis.confidence}
              </Text>
              <Text style={styles.meta}>
                Sold comps: {detail.analysis.soldCompCount} · Median sold{" "}
                {money(detail.analysis.medianSoldPrice)}
              </Text>
              <Text style={styles.meta}>
                Indicated{" "}
                {money(detail.analysis.weightedIndicatedLow)} –{" "}
                {money(detail.analysis.weightedIndicatedHigh)}
              </Text>
              {detail.analysis.limitedInventory ? (
                <Text style={styles.warn}>LIMITED COMPARABLE INVENTORY</Text>
              ) : null}
              <Text style={styles.meta}>{detail.analysis.marketContext}</Text>
            </View>
          ) : null}

          <Text style={styles.section}>Sold comparables</Text>
          {sold.map((c) => (
            <View key={c.mlsNumber} style={styles.compCard}>
              <View style={styles.compRow}>
                <Text style={styles.compAddr}>{c.property.addressLine}</Text>
                <Text style={styles.score}>{c.score}</Text>
              </View>
              <Text style={styles.meta}>
                {c.source === "AGENT" ? "AGENT SELECTED · " : ""}
                {c.role} · {c.distanceKm} km ·{" "}
                {c.property.soldPrice
                  ? money(c.property.soldPrice)
                  : money(c.property.listPrice)}
                {c.outlier ? " · POSSIBLE OUTLIER" : ""}
              </Text>
              <Text style={styles.meta}>{c.reasons.slice(0, 3).join(" · ")}</Text>
              <TouchableOpacity onPress={() => void removeComp(c.mlsNumber)}>
                <Text style={styles.linkDanger}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}

          <Text style={styles.section}>Competition</Text>
          {competition.length === 0 ? (
            <Text style={styles.meta}>No competition comps selected.</Text>
          ) : (
            competition.map((c) => (
              <View key={c.mlsNumber} style={styles.compCard}>
                <Text style={styles.compAddr}>{c.property.addressLine}</Text>
                <Text style={styles.meta}>
                  {c.role} · {money(c.property.listPrice)} · score {c.score}
                </Text>
              </View>
            ))
          )}

          <Text style={styles.section}>Agent recommendation</Text>
          <TextInput
            style={styles.input}
            placeholder="Recommended list price"
            keyboardType="numeric"
            value={recPrice}
            onChangeText={setRecPrice}
            placeholderTextColor="#94A3B8"
          />
          <TextInput
            style={[styles.input, styles.inputMulti]}
            placeholder="Recommendation note"
            value={recNote}
            onChangeText={setRecNote}
            multiline
            placeholderTextColor="#94A3B8"
          />
          <TextInput
            style={styles.input}
            placeholder="Lead ID (optional, required to email)"
            value={leadId}
            onChangeText={setLeadId}
            autoCapitalize="none"
            placeholderTextColor="#94A3B8"
          />
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => void saveRecommendation()}
            disabled={savingRec}
          >
            <Text style={styles.primaryBtnText}>
              {savingRec ? "Saving…" : "Save recommendation"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => void emailCma()}
            disabled={emailing || pdfBusy}
          >
            <Text style={styles.secondaryBtnText}>
              {emailing ? "Sending…" : "Email CMA"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => void downloadPdf()}
            disabled={pdfBusy || emailing}
          >
            <Text style={styles.secondaryBtnText}>
              {pdfBusy ? "Preparing PDF…" : "Download PDF"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => void sharePdf()}
            disabled={pdfBusy || emailing}
          >
            <Text style={styles.secondaryBtnText}>
              {pdfBusy ? "Preparing PDF…" : "Share PDF"}
            </Text>
          </TouchableOpacity>
          <Text style={styles.disclaimer}>
            Market analysis for discussion — not a formal appraisal. PDF uses
            the saved CMA (not live re-scoring).
          </Text>
          <Text style={styles.meta} selectable>
            Share: {detail.shareUrl}
          </Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>CMA</Text>
        <View style={styles.topSpacer} />
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0F6B4C" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadList(true);
              }}
              colors={["#0F6B4C"]}
            />
          }
        >
          <Text style={styles.intro}>
            Find best sold comparables, review competition, set your recommended
            list price, then email a tenant-branded CMA link.
          </Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>+ New CMA</Text>
            <TextInput
              style={styles.input}
              placeholder="Subject MLS number"
              value={subjectMls}
              onChangeText={setSubjectMls}
              autoCapitalize="characters"
              placeholderTextColor="#94A3B8"
            />
            <TextInput
              style={styles.input}
              placeholder="Lead ID (optional)"
              value={leadId}
              onChangeText={setLeadId}
              autoCapitalize="none"
              placeholderTextColor="#94A3B8"
            />
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => void createCma()}
              disabled={creating}
            >
              <Text style={styles.primaryBtnText}>
                {creating ? "Finding comps…" : "Find Best Comparables"}
              </Text>
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.warn}>{error}</Text> : null}

          <Text style={styles.section}>Saved CMAs</Text>
          {items.length === 0 ? (
            <Text style={styles.meta}>No workspace CMAs yet.</Text>
          ) : (
            items.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.listCard}
                onPress={() => void openDetail(item.id)}
              >
                <Text style={styles.compAddr}>
                  {item.subjectAddress ?? item.city}
                </Text>
                <Text style={styles.meta}>
                  {item.subjectMls ?? ""} · {item.confidence ?? "—"}
                  {item.revoked ? " · revoked" : ""}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#1E2A38",
  },
  backText: { color: "#A7F3D0", fontWeight: "600", width: 80 },
  topTitle: {
    flex: 1,
    textAlign: "center",
    color: "#F8FAFC",
    fontWeight: "700",
    fontSize: 16,
  },
  topSpacer: { width: 80 },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  intro: { color: "#475569", marginBottom: 14, lineHeight: 20 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  cardTitle: { fontWeight: "700", color: "#0F172A", marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    color: "#0F172A",
    backgroundColor: "#fff",
  },
  inputMulti: { minHeight: 72, textAlignVertical: "top" },
  primaryBtn: {
    backgroundColor: "#0F766E",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  primaryBtnText: { color: "#ECFDF5", fontWeight: "700" },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#0F766E",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 10,
  },
  secondaryBtnText: { color: "#0F766E", fontWeight: "700" },
  section: {
    marginTop: 8,
    marginBottom: 8,
    fontWeight: "700",
    color: "#0F172A",
    fontSize: 16,
  },
  listCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  compCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  compRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  compAddr: { fontWeight: "600", color: "#0F172A", flex: 1 },
  score: { fontWeight: "800", color: "#0F766E" },
  meta: { color: "#64748B", fontSize: 12, marginTop: 4, lineHeight: 17 },
  warn: { color: "#B45309", fontWeight: "600", marginTop: 6 },
  linkDanger: { color: "#B91C1C", marginTop: 8, fontWeight: "600" },
  disclaimer: {
    marginTop: 16,
    color: "#64748B",
    fontSize: 12,
    lineHeight: 17,
  },
  h1: { fontWeight: "600", color: "#0F172A", marginBottom: 12, lineHeight: 20 },
});
