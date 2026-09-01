/**
 * Stage 5.1 — Native Global Calendar (web /agent/appointments).
 *
 * Visual authority: SSR Appointments page flat list + AppointmentActions.
 * Not a month grid — agenda/list of canonical Appointment rows.
 *
 * Data: GET /api/mobile/v2/appointments
 *        PATCH /api/mobile/v2/appointments/[appointmentId]
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
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
  unwrapGlobalAppointment,
  unwrapGlobalAppointmentsList,
} from "../lib/appointment-response";
import {
  clearGlobalAppointmentsCache,
  globalAppointmentCache,
  invalidateLeadAppointmentsCacheForLead,
} from "../lib/lead-tab-cache";
import { useAuth } from "../state/AuthContext";
import type { AppointmentStatus, MobileGlobalAppointment } from "../types/api";

export { clearGlobalAppointmentsCache };

function typeLabel(type: string): string {
  return type.replaceAll("_", " ");
}

function localInputToIso(local: string): string | null {
  const trimmed = local.trim();
  if (!trimmed) return null;
  const normalized =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed) ? `${trimmed}:00` : trimmed;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatStarts(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-CA");
  } catch {
    return iso;
  }
}

function customerLabel(appt: MobileGlobalAppointment): string {
  return (
    appt.customer?.name?.trim() ||
    appt.customer?.email?.trim() ||
    appt.lead?.customer?.name?.trim() ||
    appt.lead?.customer?.email?.trim() ||
    "Guest"
  );
}

type GlobalCalendarScreenProps = {
  onOpenLead?: (leadId: string) => void;
};

export function GlobalCalendarScreen({ onOpenLead }: GlobalCalendarScreenProps) {
  const { activeWorkspace } = useAuth();
  const workspaceId = activeWorkspace?.id;
  const cacheKey = workspaceId ? `${workspaceId}:calendar` : "";
  const cached = cacheKey ? globalAppointmentCache.get(cacheKey) : undefined;

  const [appointments, setAppointments] = useState<MobileGlobalAppointment[]>(
    cached?.appointments ?? [],
  );
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [confirmStarts, setConfirmStarts] = useState<Record<string, string>>({});
  const [confirmJoinUrl, setConfirmJoinUrl] = useState<Record<string, string>>(
    {},
  );

  const fetchGenRef = useRef(0);

  const persistCache = useCallback(
    (list: MobileGlobalAppointment[], from?: string, to?: string) => {
      if (!cacheKey) return;
      globalAppointmentCache.set(cacheKey, {
        appointments: list,
        from: from ?? cached?.from ?? "",
        to: to ?? cached?.to ?? "",
        timestamp: Date.now(),
      });
    },
    [cacheKey, cached?.from, cached?.to],
  );

  const fetchAppointments = useCallback(
    async (opts?: { background?: boolean }) => {
      const gen = ++fetchGenRef.current;
      if (!opts?.background) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const res = await mobileApiClient.get<unknown>("/appointments");
        if (gen !== fetchGenRef.current) return;
        if (!res.ok) {
          setError(res.message || "Could not load appointments");
          return;
        }
        const payload = res.data as Record<string, unknown>;
        const list = unwrapGlobalAppointmentsList(payload);
        const from =
          typeof payload.from === "string" ? payload.from : undefined;
        const to = typeof payload.to === "string" ? payload.to : undefined;
        setAppointments(list);
        persistCache(list, from, to);
      } catch (err: unknown) {
        if (gen !== fetchGenRef.current) return;
        setError(
          err instanceof Error ? err.message : "Could not load appointments",
        );
      } finally {
        if (gen === fetchGenRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [persistCache],
  );

  useEffect(() => {
    const entry = cacheKey ? globalAppointmentCache.get(cacheKey) : undefined;
    if (entry?.appointments) {
      setAppointments(entry.appointments);
      setLoading(false);
    }
    void fetchAppointments({ background: Boolean(entry) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- workspace change
  }, [workspaceId]);

  const handlePatch = async (
    appt: MobileGlobalAppointment,
    body: Record<string, unknown>,
  ) => {
    if (mutatingId) return;
    setMutatingId(appt.id);
    setError(null);
    fetchGenRef.current += 1;
    const previous = appointments;

    if (typeof body.status === "string") {
      setAppointments((prev) => {
        const next = prev.map((a) =>
          a.id === appt.id
            ? {
                ...a,
                status: body.status as AppointmentStatus,
                startsAt:
                  typeof body.startsAt === "string"
                    ? body.startsAt
                    : a.startsAt,
                videoJoinUrl:
                  typeof body.videoJoinUrl === "string"
                    ? body.videoJoinUrl
                    : a.videoJoinUrl,
              }
            : a,
        );
        persistCache(next);
        return next;
      });
    }

    try {
      const endpoint = appt.leadId
        ? `/leads/${encodeURIComponent(appt.leadId)}/appointments/${encodeURIComponent(appt.id)}`
        : `/appointments/${encodeURIComponent(appt.id)}`;
      const res = await mobileApiClient.patch<unknown>(endpoint, body);

      if (!res.ok) {
        setAppointments(previous);
        persistCache(previous);
        setError(res.message || "Could not update appointment");
        return;
      }

      const updated = unwrapGlobalAppointment(res.data);
      if (updated) {
        setAppointments((prev) => {
          const next = prev.map((a) =>
            a.id === updated.id ? { ...a, ...updated } : a,
          );
          persistCache(next);
          return next;
        });
      }
      invalidateLeadAppointmentsCacheForLead(workspaceId, appt.leadId);
    } catch (err: unknown) {
      setAppointments(previous);
      persistCache(previous);
      setError(
        err instanceof Error ? err.message : "Could not update appointment",
      );
    } finally {
      setMutatingId(null);
    }
  };

  const openJoinUrl = (url: string) => {
    void Linking.openURL(url).catch(() => {
      setError("Could not open join link");
    });
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void fetchAppointments({ background: true })}
          tintColor="#0F766E"
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Appointments</Text>
        <Text style={styles.subtitle}>
          Showings, Virtual Viewings, and consults.
        </Text>
      </View>

      {loading && appointments.length === 0 ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#0F766E" />
          <Text style={styles.loadingText}>Loading appointments…</Text>
        </View>
      ) : null}

      {error && appointments.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            onPress={() => void fetchAppointments()}
            activeOpacity={0.8}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!loading && appointments.length === 0 && !error ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No appointments in your book.</Text>
        </View>
      ) : null}

      {appointments.map((a) => {
        const pending = mutatingId === a.id;
        const confirmLocal = confirmStarts[a.id] ?? "";
        const joinLocal =
          confirmJoinUrl[a.id] ?? a.videoJoinUrl ?? "";
        return (
          <View key={a.id} style={styles.card}>
            <Text style={styles.cardTitle}>
              {typeLabel(a.type)} · {a.status}
            </Text>
            <Text style={styles.cardMeta}>
              {customerLabel(a)}
              {a.listingMls ? ` · ${a.listingMls}` : ""}
            </Text>
            {a.leadId && a.lead ? (
              <TouchableOpacity
                onPress={() => onOpenLead?.(a.leadId!)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Open lead"
              >
                <Text style={styles.leadLink}>Lead</Text>
              </TouchableOpacity>
            ) : null}
            {a.startsAt ? (
              <Text style={styles.cardTime}>{formatStarts(a.startsAt)}</Text>
            ) : null}
            {a.videoJoinUrl ? (
              <TouchableOpacity
                onPress={() => openJoinUrl(a.videoJoinUrl!)}
                activeOpacity={0.75}
              >
                <Text style={styles.joinLink}>Join link</Text>
              </TouchableOpacity>
            ) : null}
            {a.notes ? (
              <Text style={styles.cardNotes} numberOfLines={4}>
                {a.notes}
              </Text>
            ) : null}

            {a.status !== "CANCELLED" && a.status !== "COMPLETED" ? (
              <View style={styles.actionsBox}>
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      styles.actionPrimary,
                      (pending || a.status === "CONFIRMED") &&
                        styles.actionDisabled,
                    ]}
                    disabled={pending || a.status === "CONFIRMED"}
                    onPress={() => {
                      const startsAtIso = confirmLocal.trim()
                        ? localInputToIso(confirmLocal)
                        : undefined;
                      if (confirmLocal.trim() && !startsAtIso) {
                        setError(
                          "Enter a valid confirm time (YYYY-MM-DDTHH:mm)",
                        );
                        return;
                      }
                      void handlePatch(a, {
                        status: "CONFIRMED",
                        ...(startsAtIso ? { startsAt: startsAtIso } : {}),
                        ...(joinLocal.trim()
                          ? { videoJoinUrl: joinLocal.trim() }
                          : {}),
                      });
                    }}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Confirm appointment"
                  >
                    <Text style={styles.actionPrimaryText}>
                      {pending ? "…" : "Confirm"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionSecondary]}
                    disabled={pending}
                    onPress={() =>
                      void handlePatch(a, { status: "COMPLETED" })
                    }
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Mark appointment complete"
                  >
                    <Text style={styles.actionSecondaryText}>
                      Mark complete
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionGhost]}
                    disabled={pending}
                    onPress={() =>
                      void handlePatch(a, { status: "CANCELLED" })
                    }
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel appointment"
                  >
                    <Text style={styles.actionGhostText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.confirmTimeInput}
                  value={confirmLocal}
                  onChangeText={(v) =>
                    setConfirmStarts((prev) => ({ ...prev, [a.id]: v }))
                  }
                  placeholder="YYYY-MM-DDTHH:mm (optional for Confirm)"
                  placeholderTextColor="#94A3B8"
                  editable={!pending}
                  autoCapitalize="none"
                  accessibilityLabel="Confirm start time"
                />
                {a.type === "VIRTUAL_VIEWING" ? (
                  <TextInput
                    style={styles.confirmTimeInput}
                    value={joinLocal}
                    onChangeText={(v) =>
                      setConfirmJoinUrl((prev) => ({ ...prev, [a.id]: v }))
                    }
                    placeholder="Video join URL (Meet / Zoom / FaceTime)"
                    placeholderTextColor="#94A3B8"
                    editable={!pending}
                    autoCapitalize="none"
                    accessibilityLabel="Video join URL"
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}

      {error && appointments.length > 0 ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: "#F4F7F5",
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  header: {
    gap: 4,
    marginBottom: 4,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1E2A38",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748B",
  },
  loadingBox: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: "#64748B",
  },
  emptyBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#CBD5E1",
    borderRadius: 16,
    paddingVertical: 40,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
  },
  errorText: {
    fontSize: 13,
    color: "#B45309",
    textAlign: "center",
  },
  retryText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "600",
    color: "#0F766E",
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 16,
    gap: 6,
    shadowColor: "#14201C",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E2A38",
  },
  cardMeta: {
    fontSize: 14,
    color: "#64748B",
  },
  leadLink: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F766E",
  },
  cardTime: {
    fontSize: 12,
    color: "#94A3B8",
  },
  joinLink: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F766E",
  },
  cardNotes: {
    fontSize: 13,
    color: "#475569",
    marginTop: 2,
  },
  actionsBox: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    padding: 10,
    gap: 8,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionPrimary: {
    backgroundColor: "#0F766E",
  },
  actionSecondary: {
    backgroundColor: "#E2E8F0",
  },
  actionGhost: {
    backgroundColor: "transparent",
  },
  actionDisabled: {
    opacity: 0.5,
  },
  actionPrimaryText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  actionSecondaryText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1E2A38",
  },
  actionGhostText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  confirmTimeInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: "#1E2A38",
    backgroundColor: "#FFFFFF",
  },
});
