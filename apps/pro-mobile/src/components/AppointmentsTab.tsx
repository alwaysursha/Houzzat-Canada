/**
 * Stage 4.7 — Native Appointments tab (web CustomerProfile + AppointmentActions parity).
 *
 * Visual authority: CustomerProfile tab="appointments" cards.
 * Mutations: AppointmentActions Confirm / Mark complete / Cancel (+ startsAt).
 * Create: agent schedule on lead using canonical Appointment fields
 *   (type, startsAt, notes, videoJoinUrl) — same model as valuation/public creates.
 *
 * Data: GET/POST /api/mobile/v2/leads/[leadId]/appointments
 *        PATCH /api/mobile/v2/leads/[leadId]/appointments/[appointmentId]
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import {
  unwrapAppointment,
  unwrapAppointmentsList,
} from "../lib/appointment-response";
import {
  appointmentCache,
  clearLeadAppointmentsCache,
  invalidateGlobalAppointmentsCacheForWorkspace,
} from "../lib/lead-tab-cache";
import type {
  AppointmentStatus,
  AppointmentType,
  MobileLeadAppointment,
} from "../types/api";

export { clearLeadAppointmentsCache };

const APPOINTMENT_TYPES: AppointmentType[] = [
  "SHOWING",
  "VIRTUAL_VIEWING",
  "BUYER_SESSION",
  "VALUATION_CALL",
];

function typeLabel(type: string): string {
  return type.replaceAll("_", " ");
}

function defaultStartsLocalValue(): string {
  const d = new Date();
  d.setHours(d.getHours() + 2);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local datetime → ISO; stores Instant like web `new Date(datetime-local).toISOString()`. */
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
  if (!iso) return "Unscheduled";
  try {
    return new Date(iso).toLocaleString("en-CA");
  } catch {
    return iso;
  }
}

function isShowingUpcoming(a: MobileLeadAppointment, nowMs: number): boolean {
  if (!a.startsAt) return true;
  return new Date(a.startsAt).getTime() >= nowMs;
}

function compareStartsAsc(a: MobileLeadAppointment, b: MobileLeadAppointment): number {
  if (!a.startsAt && !b.startsAt) return 0;
  if (!a.startsAt) return 1;
  if (!b.startsAt) return -1;
  return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
}

function compareStartsDesc(a: MobileLeadAppointment, b: MobileLeadAppointment): number {
  return compareStartsAsc(b, a);
}

function partitionAppointments(appointments: MobileLeadAppointment[]) {
  const nowMs = Date.now();
  const showings = appointments.filter((a) => a.type === "SHOWING");
  const otherAppointments = appointments.filter((a) => a.type !== "SHOWING");
  const upcomingShowings = showings
    .filter((a) => isShowingUpcoming(a, nowMs))
    .sort(compareStartsAsc);
  const pastShowings = showings
    .filter((a) => !isShowingUpcoming(a, nowMs))
    .sort(compareStartsDesc);
  return { upcomingShowings, pastShowings, otherAppointments };
}

type AppointmentsTabProps = {
  leadId: string;
  workspaceId: string | undefined;
  leadName?: string;
  onPlanViewings?: (leadId: string, leadName?: string) => void;
  onAppointmentCountChange?: (totalCount: number) => void;
};

export function AppointmentsTab({
  leadId,
  workspaceId,
  leadName,
  onPlanViewings,
  onAppointmentCountChange,
}: AppointmentsTabProps) {
  const cacheKey = workspaceId ? `${workspaceId}:${leadId}:appointments` : "";
  const cached = cacheKey ? appointmentCache.get(cacheKey) : undefined;

  const [appointments, setAppointments] = useState<MobileLeadAppointment[]>(
    cached?.appointments ?? [],
  );
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const [apptType, setApptType] = useState<AppointmentType>("SHOWING");
  const [startsLocal, setStartsLocal] = useState(defaultStartsLocalValue);
  const [notes, setNotes] = useState("");
  const [videoJoinUrl, setVideoJoinUrl] = useState("");
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [mutatingId, setMutatingId] = useState<string | null>(null);
  /** Per-card schedule datetime for Confirm (AppointmentActions parity). */
  const [confirmStarts, setConfirmStarts] = useState<Record<string, string>>(
    {},
  );

  const publishCount = useCallback(
    (list: MobileLeadAppointment[]) => {
      onAppointmentCountChange?.(list.length);
    },
    [onAppointmentCountChange],
  );

  const persistCache = useCallback(
    (list: MobileLeadAppointment[]) => {
      if (!cacheKey) return;
      appointmentCache.set(cacheKey, {
        appointments: list,
        timestamp: Date.now(),
      });
    },
    [cacheKey],
  );

  const fetchAppointments = useCallback(async () => {
    setError(null);
    try {
      const res = await mobileApiClient.get<unknown>(
        `/leads/${encodeURIComponent(leadId)}/appointments`,
      );

      if (!res.ok) {
        setError(res.message || "Could not load appointments");
        setLoading(false);
        return;
      }

      const list = unwrapAppointmentsList(res.data);
      setAppointments(list);
      persistCache(list);
      publishCount(list);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not load appointments",
      );
    } finally {
      setLoading(false);
    }
  }, [leadId, persistCache, publishCount]);

  useEffect(() => {
    const entry = cacheKey ? appointmentCache.get(cacheKey) : undefined;
    if (entry) {
      setAppointments(entry.appointments);
      setLoading(false);
      publishCount(entry.appointments);
    } else {
      setAppointments([]);
      setLoading(true);
    }
    void fetchAppointments();
  }, [leadId, workspaceId, cacheKey, fetchAppointments, publishCount]);

  const handleCreate = async () => {
    if (createPending) return;
    const startsAt = startsLocal.trim()
      ? localInputToIso(startsLocal)
      : null;
    if (startsLocal.trim() && !startsAt) {
      setCreateError("Enter a valid start time (YYYY-MM-DDTHH:mm)");
      return;
    }
    setCreatePending(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = {
        type: apptType,
        notes: notes.trim() || null,
        startsAt,
      };
      if (apptType === "VIRTUAL_VIEWING" && videoJoinUrl.trim()) {
        body.videoJoinUrl = videoJoinUrl.trim();
      }

      const res = await mobileApiClient.post<unknown>(
        `/leads/${encodeURIComponent(leadId)}/appointments`,
        body,
      );

      if (!res.ok) {
        setCreateError(res.message || "Could not create appointment");
        return;
      }

      const created = unwrapAppointment(res.data);
      if (created) {
        setAppointments((prev) => {
          const next = [
            created,
            ...prev.filter((a) => a.id !== created.id),
          ];
          persistCache(next);
          publishCount(next);
          return next;
        });
        invalidateGlobalAppointmentsCacheForWorkspace(workspaceId);
      } else {
        void fetchAppointments();
      }
      setNotes("");
      setVideoJoinUrl("");
      setStartsLocal(defaultStartsLocalValue());
    } catch (err: unknown) {
      setCreateError(
        err instanceof Error ? err.message : "Could not create appointment",
      );
    } finally {
      setCreatePending(false);
    }
  };

  const handlePatch = async (
    appt: MobileLeadAppointment,
    body: Record<string, unknown>,
  ) => {
    if (mutatingId) return;
    setMutatingId(appt.id);
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
        publishCount(next);
        return next;
      });
    }

    try {
      const res = await mobileApiClient.patch<unknown>(
        `/leads/${encodeURIComponent(leadId)}/appointments/${encodeURIComponent(appt.id)}`,
        body,
      );

      if (!res.ok) {
        setAppointments(previous);
        persistCache(previous);
        publishCount(previous);
        setError(res.message || "Could not update appointment");
        return;
      }

      const updated = unwrapAppointment(res.data);
      if (updated) {
        setAppointments((prev) => {
          const next = prev.map((a) => (a.id === updated.id ? updated : a));
          persistCache(next);
          publishCount(next);
          return next;
        });
      }
      invalidateGlobalAppointmentsCacheForWorkspace(workspaceId);
    } catch (err: unknown) {
      setAppointments(previous);
      persistCache(previous);
      publishCount(previous);
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

  const { upcomingShowings, pastShowings, otherAppointments } =
    partitionAppointments(appointments);

  const renderAppointmentCard = (a: MobileLeadAppointment) => {
    const pending = mutatingId === a.id;
    const confirmLocal = confirmStarts[a.id] ?? "";
    return (
      <View key={a.id} style={styles.card}>
        {/* Web CustomerProfile card hierarchy */}
        <Text style={styles.cardTitle}>
          {typeLabel(a.type)} · {a.status}
        </Text>
        <Text style={styles.cardMeta}>
          {formatStarts(a.startsAt)}
          {a.listingMls ? ` · ${a.listingMls}` : ""}
        </Text>
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

        {/* AppointmentActions — Confirm / Complete / Cancel */}
        {a.status !== "CANCELLED" && a.status !== "COMPLETED" ? (
          <View style={styles.actionsBox}>
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  styles.actionPrimary,
                  (pending || a.status === "CONFIRMED") &&
                    styles.addBtnDisabled,
                ]}
                disabled={pending || a.status === "CONFIRMED"}
                onPress={() => {
                  const startsAtIso = confirmLocal.trim()
                    ? localInputToIso(confirmLocal)
                    : undefined;
                  if (confirmLocal.trim() && !startsAtIso) {
                    setError("Enter a valid confirm time (YYYY-MM-DDTHH:mm)");
                    return;
                  }
                  void handlePatch(a, {
                    status: "CONFIRMED",
                    ...(startsAtIso ? { startsAt: startsAtIso } : {}),
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
              accessibilityLabel="Confirm start date and time"
            />
          </View>
        ) : null}
      </View>
    );
  };

  const renderSection = (
    title: string,
    items: MobileLeadAppointment[],
  ) => {
    if (items.length === 0) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {items.map(renderAppointmentCard)}
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      {onPlanViewings ? (
        <View style={styles.planViewingsPanel} accessibilityLabel="Viewings Planner">
          <Text style={styles.planViewingsTitle}>Viewings Planner</Text>
          <Text style={styles.planViewingsHint}>
            Build a multi-property route with drive times
            {leadName ? ` for ${leadName}` : ""}, save showings, and share with your client.
          </Text>
          <TouchableOpacity
            style={styles.planViewingsBtn}
            onPress={() => onPlanViewings(leadId, leadName)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open Viewings Planner"
          >
            <Text style={styles.planViewingsBtnText}>Open Viewings Planner</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Schedule control — obvious create (canonical Appointment fields) */}
      <View style={styles.panel} accessibilityLabel="Schedule appointment form">
        <Text style={styles.panelTitle}>Schedule appointment</Text>
        <Text style={styles.panelHint}>
          Choose type, optional start time, then tap Schedule.
        </Text>
        <View style={styles.formRow}>
          {APPOINTMENT_TYPES.map((t) => {
            const active = apptType === t;
            return (
              <TouchableOpacity
                key={t}
                style={[styles.typeChip, active && styles.typeChipActive]}
                onPress={() => setApptType(t)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={active ? styles.typeChipTextActive : styles.typeChipText}
                >
                  {typeLabel(t)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TextInput
          style={styles.dueInputFull}
          value={startsLocal}
          onChangeText={setStartsLocal}
          placeholder="YYYY-MM-DDTHH:mm (start)"
          placeholderTextColor="#94A3B8"
          editable={!createPending}
          autoCapitalize="none"
          accessibilityLabel="Appointment start date and time"
        />
        <TextInput
          style={styles.notesInput}
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes (optional)"
          placeholderTextColor="#94A3B8"
          editable={!createPending}
          multiline
          accessibilityLabel="Appointment notes"
        />
        {apptType === "VIRTUAL_VIEWING" ? (
          <TextInput
            style={styles.dueInputFull}
            value={videoJoinUrl}
            onChangeText={setVideoJoinUrl}
            placeholder="Video join URL (Meet / Zoom / FaceTime)"
            placeholderTextColor="#94A3B8"
            editable={!createPending}
            autoCapitalize="none"
            accessibilityLabel="Video join URL"
          />
        ) : null}
        <TouchableOpacity
          style={[styles.addBtn, createPending && styles.addBtnDisabled]}
          disabled={createPending}
          onPress={() => void handleCreate()}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Schedule appointment"
        >
          <Text style={styles.addBtnText}>
            {createPending ? "…" : "Schedule"}
          </Text>
        </TouchableOpacity>
        {createError ? <Text style={styles.errorText}>{createError}</Text> : null}
      </View>

      {loading && appointments.length === 0 ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#1E2A38" />
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
          <Text style={styles.emptyText}>No appointments.</Text>
        </View>
      ) : null}

      {error && appointments.length > 0 ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}

      {renderSection("UPCOMING VIEWINGS", upcomingShowings)}
      {renderSection("PAST VIEWINGS", pastShowings)}
      {renderSection("APPOINTMENTS", otherAppointments)}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  planViewingsPanel: {
    backgroundColor: "#F0FDFA",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#99F6E4",
    padding: 12,
  },
  planViewingsTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F766E",
    marginBottom: 4,
  },
  planViewingsHint: {
    fontSize: 11,
    color: "#64748B",
    marginBottom: 10,
    lineHeight: 16,
  },
  planViewingsBtn: {
    backgroundColor: "#0F766E",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  planViewingsBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
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
    marginBottom: 4,
  },
  panelHint: {
    fontSize: 11,
    color: "#64748B",
    marginBottom: 10,
    lineHeight: 15,
  },
  formRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  typeChip: {
    borderWidth: 1,
    borderColor: "#D8DEE6",
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  typeChipActive: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  typeChipText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748B",
  },
  typeChipTextActive: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1E2A38",
  },
  dueInputFull: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#D8DEE6",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: "#1E2A38",
    backgroundColor: "#FFFFFF",
    marginBottom: 8,
  },
  notesInput: {
    width: "100%",
    minHeight: 56,
    borderWidth: 1,
    borderColor: "#D8DEE6",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: "#1E2A38",
    backgroundColor: "#FFFFFF",
    marginBottom: 8,
    textAlignVertical: "top",
  },
  addBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#0F766E",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  addBtnDisabled: {
    opacity: 0.45,
  },
  addBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
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
    marginTop: 6,
  },
  retryText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: "#0F766E",
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: "#64748B",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E2A38",
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748B",
  },
  joinLink: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: "#2B6CB0",
  },
  cardNotes: {
    marginTop: 8,
    fontSize: 12,
    color: "#475569",
  },
  actionsBox: {
    marginTop: 10,
    borderRadius: 10,
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
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  actionPrimary: {
    backgroundColor: "#0F766E",
  },
  actionPrimaryText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  actionSecondary: {
    backgroundColor: "#E2E8F0",
  },
  actionSecondaryText: {
    color: "#1E2A38",
    fontSize: 11,
    fontWeight: "700",
  },
  actionGhost: {
    backgroundColor: "transparent",
  },
  actionGhostText: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
  },
  confirmTimeInput: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#D8DEE6",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: "#1E2A38",
    backgroundColor: "#FFFFFF",
  },
});
