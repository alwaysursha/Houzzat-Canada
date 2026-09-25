/**
 * HouzzatPRO profile control for the signed-in agent's service areas.
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
import { mobileApiClient } from "../api/client";

type CatalogItem = { label: string; kind: "city" | "region" };

type ServiceAreasPayload = {
  serviceAreas?: string[];
  catalog?: CatalogItem[];
};

function unwrapServiceAreas(data: unknown): ServiceAreasPayload {
  if (!data || typeof data !== "object") return {};
  const body = data as {
    ok?: boolean;
    data?: ServiceAreasPayload;
    serviceAreas?: string[];
    catalog?: CatalogItem[];
  };
  if (body.data && typeof body.data === "object") return body.data;
  return body;
}

export function ServiceAreasCard() {
  const [areas, setAreas] = useState<string[]>([]);
  const [savedAreas, setSavedAreas] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await mobileApiClient.get<unknown>("/profile/service-areas");
    if (!res.ok) {
      setError(res.message || "Could not load service areas");
      setLoading(false);
      return;
    }
    const payload = unwrapServiceAreas(res.data);
    const next = payload.serviceAreas ?? [];
    setAreas(next);
    setSavedAreas(next);
    setCatalog(payload.catalog ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = areas.join("|") !== savedAreas.join("|");

  const choices = useMemo(() => {
    const selected = new Set(areas);
    const q = pickerQuery.trim().toLowerCase();
    return catalog.filter((item) => {
      if (selected.has(item.label)) return false;
      if (!q) return true;
      return item.label.toLowerCase().includes(q);
    });
  }, [areas, catalog, pickerQuery]);

  const save = async (next: string[]) => {
    setSaving(true);
    setError(null);
    const res = await mobileApiClient.patch<unknown>("/profile/service-areas", {
      serviceAreas: next,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.message || "Could not save service areas");
      return;
    }
    const payload = unwrapServiceAreas(res.data);
    const stored = payload.serviceAreas ?? next;
    setAreas(stored);
    setSavedAreas(stored);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Service Areas</Text>
      <Text style={styles.hint}>
        Listings on Properties start in these cities and regions. Search can still look anywhere.
      </Text>
      {loading ? (
        <ActivityIndicator color="#0F766E" />
      ) : (
        <View style={styles.chips}>
          {areas.length === 0 ? (
            <Text style={styles.empty}>None saved. Properties uses the GTA until you add an area.</Text>
          ) : (
            areas.map((area) => (
              <TouchableOpacity
                key={area}
                style={styles.chip}
                onPress={() => setAreas((current) => current.filter((item) => item !== area))}
                accessibilityLabel={`Remove ${area}`}
              >
                <Text style={styles.chipText}>{area}  ×</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.secondary}
          onPress={() => {
            setPickerQuery("");
            setPickerOpen(true);
          }}
          disabled={loading || saving}
        >
          <Text style={styles.secondaryText}>Add area</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primary, (!dirty || saving) && styles.disabled]}
          disabled={!dirty || saving}
          onPress={() => void save(areas)}
        >
          <Text style={styles.primaryText}>{saving ? "Saving…" : "Save"}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.title}>Add a city or region</Text>
            <TouchableOpacity onPress={() => setPickerOpen(false)}>
              <Text style={styles.secondaryText}>Close</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            value={pickerQuery}
            onChangeText={setPickerQuery}
            placeholder="Mississauga, Halton Region…"
            placeholderTextColor="#94A3B8"
            style={styles.input}
            autoCorrect={false}
          />
          <ScrollView keyboardShouldPersistTaps="handled">
            {choices.map((item) => (
              <TouchableOpacity
                key={`${item.kind}:${item.label}`}
                style={styles.row}
                onPress={() => {
                  setAreas((current) =>
                    current.includes(item.label) ? current : [...current, item.label],
                  );
                  setPickerOpen(false);
                }}
              >
                <Text style={styles.rowLabel}>{item.label}</Text>
                <Text style={styles.rowKind}>{item.kind === "region" ? "Region" : "City"}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    gap: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1E2A38",
  },
  hint: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 17,
  },
  empty: {
    fontSize: 13,
    color: "#64748B",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#99F6E4",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    color: "#0F766E",
    fontSize: 13,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    color: "#1E2A38",
    fontWeight: "700",
    fontSize: 14,
  },
  primary: {
    flex: 1,
    backgroundColor: "#0F766E",
    borderRadius: 10,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  disabled: {
    opacity: 0.45,
  },
  error: {
    color: "#B91C1C",
    fontSize: 12,
  },
  modal: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    padding: 16,
    paddingTop: 24,
    gap: 12,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    fontSize: 15,
    color: "#1E2A38",
  },
  row: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingVertical: 12,
    paddingHorizontal: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rowLabel: {
    fontSize: 15,
    color: "#1E2A38",
    fontWeight: "600",
  },
  rowKind: {
    fontSize: 12,
    color: "#64748B",
  },
});
