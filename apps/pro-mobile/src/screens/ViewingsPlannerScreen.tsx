/**
 * Stage 5.6 — Native Viewings Planner (HouzzatPRO route planner parity).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Clipboard,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import { NativeDateTimeField } from "../components/NativeDateTimeField";
import { PropertyDetailModal } from "../components/PropertyDetailModal";
import {
  buildShortlistListQuery,
  formatListingPrice,
  unwrapShortlistList,
} from "../lib/property-response";
import { unwrapViewingsPlannerTour } from "../lib/viewings-planner-response";
import { useAuth } from "../state/AuthContext";
import type { MobileListingCard } from "../types/property";
import type {
  MobileViewingsPlannerStop,
  MobileViewingsPlannerStopListing,
  MobileViewingsPlannerTour,
  ViewingShareChannel,
} from "../types/viewings-planner";

const SHARE_BASE_URL = "https://app.houzzatpro.com";

type ViewingsPlannerScreenProps = {
  leadId: string;
  leadName?: string;
  initialMlsNumbers?: string[];
  onBack: () => void;
};

type StopTimeDraft = {
  startsAt: string;
  endsAt: string;
};

function combineDateAndTime(date: Date | null, time: Date | null): Date | null {
  if (!date) return null;
  const combined = new Date(date);
  if (time) {
    combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
  } else {
    combined.setHours(9, 0, 0, 0);
  }
  return combined;
}

function stopListingToCard(listing: MobileViewingsPlannerStopListing): MobileListingCard {
  return {
    mlsNumber: listing.mlsNumber,
    status: listing.status,
    transactionType: "SALE",
    propertyType: "",
    listPrice: listing.listPrice,
    soldPrice: null,
    beds: listing.beds,
    bedsLabel: listing.bedsLabel,
    baths: listing.baths,
    sqft: null,
    addressLine: listing.addressLine,
    unitNumber: listing.unitNumber,
    city: listing.city,
    community: null,
    primaryImageUrl: listing.primaryImageUrl,
    daysOnMarket: 0,
    listedAt: "",
    soldAt: null,
  };
}

function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateInputToIso(dateStr: string): string | null {
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(`${trimmed}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

function datetimeLocalToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatKm(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDriveDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function formatViewingDateLabel(iso: string | null): string {
  if (!iso) return "your viewing day";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "your viewing day";
  return d.toLocaleDateString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function firstNameFromLabel(name: string | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] || "there";
}

function agentFirstName(agentName: string | null | undefined): string {
  const trimmed = agentName?.trim();
  if (!trimmed) return "Your agent";
  return trimmed.split(/\s+/)[0] || trimmed;
}

function buildViewingShareMessage(input: {
  tenantDisplayName: string;
  agentFirstName: string;
  clientFirstName: string;
  viewingDateLabel: string;
  stopCount: number;
  shareUrl: string;
}): string {
  return [
    `Hi ${input.clientFirstName},`,
    "",
    `I've prepared your viewing schedule for ${input.viewingDateLabel} with ${input.stopCount} ${input.stopCount === 1 ? "property" : "properties"}.`,
    "",
    "View your schedule:",
    input.shareUrl,
    "",
    input.agentFirstName,
    input.tenantDisplayName,
  ].join("\n");
}

function stopTimesFromTour(stops: MobileViewingsPlannerStop[]): Record<string, StopTimeDraft> {
  const map: Record<string, StopTimeDraft> = {};
  for (const stop of stops) {
    map[stop.id] = {
      startsAt: isoToDatetimeLocal(stop.suggestedArriveAt),
      endsAt: isoToDatetimeLocal(stop.suggestedLeaveAt),
    };
  }
  return map;
}

function formatStopAddress(stop: MobileViewingsPlannerStop): string {
  const listing = stop.listing;
  if (!listing) return stop.mlsNumber;
  const unit = listing.unitNumber ? `#${listing.unitNumber} ` : "";
  return `${unit}${listing.addressLine}, ${listing.city}`.trim();
}

export function ViewingsPlannerScreen({
  leadId,
  leadName,
  initialMlsNumbers,
  onBack,
}: ViewingsPlannerScreenProps) {
  const { activeWorkspace } = useAuth();
  const workspaceId = activeWorkspace?.id;

  const [tour, setTour] = useState<MobileViewingsPlannerTour | null>(null);
  const [loading, setLoading] = useState(true);
  const [routePending, setRoutePending] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingDate, setViewingDate] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [stopTimes, setStopTimes] = useState<Record<string, StopTimeDraft>>({});
  const [detailListing, setDetailListing] = useState<MobileListingCard | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [shortlistPickerOpen, setShortlistPickerOpen] = useState(false);
  const [shortlistItems, setShortlistItems] = useState<MobileListingCard[]>([]);
  const [shortlistLoading, setShortlistLoading] = useState(false);
  const [shortlistSelected, setShortlistSelected] = useState<Set<string>>(
    () => new Set(),
  );
  const [addingStops, setAddingStops] = useState(false);

  const manualReorderRef = useRef(false);
  const hasOptimizedRef = useRef(false);
  const initGenRef = useRef(0);

  const applyTour = useCallback((next: MobileViewingsPlannerTour) => {
    setTour(next);
    if (next.viewingDate) {
      setViewingDate(new Date(next.viewingDate));
    }
    if (next.startAt) {
      const start = new Date(next.startAt);
      setStartTime(start);
      if (!next.viewingDate) {
        setViewingDate(start);
      }
    }
    setStopTimes(stopTimesFromTour(next.stops));
    if (next.sharePath) {
      setSaved(true);
    }
  }, []);

  const initTour = useCallback(async () => {
    const gen = ++initGenRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await mobileApiClient.post<unknown>(
        `/leads/${encodeURIComponent(leadId)}/viewings-planner`,
        { mlsNumbers: initialMlsNumbers ?? [] },
      );
      if (gen !== initGenRef.current) return;
      if (!res.ok) {
        setError(res.message || "Could not load viewing plan");
        return;
      }
      const parsed = unwrapViewingsPlannerTour(res.data);
      if (!parsed) {
        setError("Unexpected response from server");
        return;
      }
      applyTour(parsed);
    } finally {
      if (gen === initGenRef.current) {
        setLoading(false);
      }
    }
  }, [leadId, initialMlsNumbers, applyTour]);

  useEffect(() => {
    manualReorderRef.current = false;
    hasOptimizedRef.current = false;
    setSaved(false);
    void initTour();
  }, [initTour]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (shortlistPickerOpen) {
        setShortlistPickerOpen(false);
        return true;
      }
      if (shareMenuOpen) {
        setShareMenuOpen(false);
        return true;
      }
      if (detailOpen) {
        setDetailOpen(false);
        return true;
      }
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [shortlistPickerOpen, shareMenuOpen, detailOpen, onBack]);

  useEffect(() => {
    if (detailOpen) return;
    const timer = setTimeout(() => setDetailListing(null), 450);
    return () => clearTimeout(timer);
  }, [detailOpen]);

  const patchTour = useCallback(
    async (body: Record<string, unknown>) => {
      if (!tour) return null;
      const res = await mobileApiClient.patch<unknown>(
        `/leads/${encodeURIComponent(leadId)}/viewings-planner`,
        { tourId: tour.id, ...body },
      );
      if (!res.ok) {
        setError(res.message || "Could not update plan");
        return null;
      }
      const parsed = unwrapViewingsPlannerTour(res.data);
      if (parsed) {
        applyTour(parsed);
      }
      return parsed;
    },
    [tour, leadId, applyTour],
  );

  const handleViewingDateChange = useCallback(
    async (date: Date | null) => {
      setViewingDate(date);
      setError(null);
      const startAt = combineDateAndTime(date, startTime);
      await patchTour({
        viewingDate: date ? date.toISOString() : null,
        startAt: startAt ? startAt.toISOString() : null,
      });
    },
    [startTime, patchTour],
  );

  const handleStartTimeChange = useCallback(
    async (time: Date | null) => {
      setStartTime(time);
      setError(null);
      const startAt = combineDateAndTime(viewingDate, time);
      await patchTour({
        startAt: startAt ? startAt.toISOString() : null,
      });
    },
    [viewingDate, patchTour],
  );

  const handleStopTimeBlur = useCallback(
    async (stopId: string) => {
      const draft = stopTimes[stopId];
      if (!draft) return;
      setError(null);
      await patchTour({
        stopTimes: [
          {
            stopId,
            startsAt: datetimeLocalToIso(draft.startsAt),
            endsAt: datetimeLocalToIso(draft.endsAt),
          },
        ],
      });
    },
    [stopTimes, patchTour],
  );

  const moveStop = useCallback(
    async (index: number, direction: -1 | 1) => {
      if (!tour) return;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= tour.stops.length) return;

      const reordered = [...tour.stops];
      const [item] = reordered.splice(index, 1);
      reordered.splice(nextIndex, 0, item);
      manualReorderRef.current = true;

      setTour({ ...tour, stops: reordered });
      setError(null);
      await patchTour({ stopOrder: reordered.map((s) => s.id) });
    },
    [tour, patchTour],
  );

  const handleRecalculateRoute = useCallback(async () => {
    if (!tour) return;
    if (tour.stops.length === 0) {
      Alert.alert(
        "Add properties first",
        "Add at least one property from Shortlist before recalculating the route.",
      );
      return;
    }
    if (!tour.startAt && !combineDateAndTime(viewingDate, startTime)) {
      Alert.alert(
        "Set viewing time",
        "Choose a viewing date and first viewing start time, then recalculate.",
      );
      return;
    }
    setRoutePending(true);
    setError(null);
    try {
      const reorder = !hasOptimizedRef.current && !manualReorderRef.current;
      const res = await mobileApiClient.post<unknown>(
        `/leads/${encodeURIComponent(leadId)}/viewings-planner/optimize`,
        { tourId: tour.id, reorder },
      );
      if (!res.ok) {
        setError(res.message || "Route calculation failed");
        Alert.alert("Route failed", res.message || "Could not recalculate route");
        return;
      }
      const parsed = unwrapViewingsPlannerTour(res.data);
      if (parsed) {
        applyTour(parsed);
        hasOptimizedRef.current = true;
        setStatusMsg("Route updated");
      } else {
        setError("Unexpected response from server");
      }
    } finally {
      setRoutePending(false);
    }
  }, [tour, leadId, applyTour, viewingDate, startTime]);

  const handleSave = useCallback(async () => {
    if (!tour) return;
    if (tour.stops.length === 0) {
      Alert.alert(
        "Add properties first",
        "Add at least one property from Shortlist before saving viewings.",
      );
      return;
    }
    setSavePending(true);
    setError(null);
    try {
      const res = await mobileApiClient.post<unknown>(
        `/leads/${encodeURIComponent(leadId)}/viewings-planner/save`,
        { tourId: tour.id },
      );
      if (!res.ok) {
        setError(res.message || "Could not save viewing plan");
        Alert.alert("Save failed", res.message || "Could not save viewing plan");
        return;
      }
      const parsed = unwrapViewingsPlannerTour(res.data);
      if (parsed) {
        applyTour(parsed);
        setSaved(true);
        setShareMenuOpen(true);
        setStatusMsg("Viewing plan saved");
      } else {
        setError("Unexpected response from server");
      }
    } finally {
      setSavePending(false);
    }
  }, [tour, leadId, applyTour]);

  const openShortlistPicker = useCallback(async () => {
    setShortlistPickerOpen(true);
    setShortlistSelected(new Set());
    setShortlistLoading(true);
    try {
      const res = await mobileApiClient.get<unknown>(
        buildShortlistListQuery({ limit: 40 }),
      );
      if (!res.ok) {
        setError(res.message || "Could not load shortlist");
        return;
      }
      const list = unwrapShortlistList(res.data);
      setShortlistItems(list.listings);
      // Pre-select stops already on the tour
      const already = new Set((tour?.stops ?? []).map((s) => s.mlsNumber));
      setShortlistSelected(already);
    } finally {
      setShortlistLoading(false);
    }
  }, [tour]);

  const addStopsFromShortlist = useCallback(async () => {
    const mlsNumbers = [...shortlistSelected];
    if (mlsNumbers.length === 0) {
      Alert.alert("Select properties", "Choose at least one shortlisted property.");
      return;
    }
    setAddingStops(true);
    setError(null);
    try {
      const res = await mobileApiClient.post<unknown>(
        `/leads/${encodeURIComponent(leadId)}/viewings-planner`,
        { mlsNumbers },
      );
      if (!res.ok) {
        setError(res.message || "Could not add properties");
        Alert.alert("Add failed", res.message || "Could not add properties");
        return;
      }
      const parsed = unwrapViewingsPlannerTour(res.data);
      if (parsed) {
        applyTour(parsed);
        setShortlistPickerOpen(false);
        setStatusMsg(`Added ${parsed.stops.length} stop${parsed.stops.length === 1 ? "" : "s"}`);
      }
    } finally {
      setAddingStops(false);
    }
  }, [shortlistSelected, leadId, applyTour]);

  const shareUrl = useMemo(() => {
    if (!tour?.sharePath) return null;
    return `${SHARE_BASE_URL}${tour.sharePath}`;
  }, [tour?.sharePath]);

  const shareMessage = useMemo(() => {
    if (!tour || !shareUrl) return "";
    return buildViewingShareMessage({
      tenantDisplayName: tour.brand?.displayName ?? activeWorkspace?.displayName ?? "HouzzatPRO",
      agentFirstName: agentFirstName(tour.agent?.name),
      clientFirstName: firstNameFromLabel(leadName),
      viewingDateLabel: formatViewingDateLabel(tour.viewingDate),
      stopCount: tour.summary.stopCount,
      shareUrl,
    });
  }, [tour, shareUrl, leadName, activeWorkspace?.displayName]);

  const logShareActivity = useCallback(
    async (channel: ViewingShareChannel) => {
      await mobileApiClient.post<unknown>(
        `/leads/${encodeURIComponent(leadId)}/viewings-planner/share-activity`,
        { channel },
      );
    },
    [leadId],
  );

  const handleShare = useCallback(
    async (channel: ViewingShareChannel) => {
      if (!shareUrl || !shareMessage) return;
      setShareMenuOpen(false);

      try {
        switch (channel) {
          case "email": {
            const subject = encodeURIComponent("Your viewing schedule");
            const body = encodeURIComponent(shareMessage);
            await Linking.openURL(`mailto:?subject=${subject}&body=${body}`);
            break;
          }
          case "whatsapp": {
            const text = encodeURIComponent(shareMessage);
            await Linking.openURL(`https://wa.me/?text=${text}`);
            break;
          }
          case "sms": {
            const body = encodeURIComponent(shareMessage);
            await Linking.openURL(`sms:?body=${body}`);
            break;
          }
          case "copy_link":
            Clipboard.setString(shareUrl);
            setStatusMsg("Link copied to clipboard");
            break;
          case "native_share":
            await Share.share({ message: shareMessage, url: shareUrl });
            break;
          default: {
            const _exhaustive: never = channel;
            return _exhaustive;
          }
        }
        void logShareActivity(channel);
      } catch {
        setError("Could not open share option");
      }
    },
    [shareUrl, shareMessage, logShareActivity],
  );

  const travelWarnings = useMemo(() => {
    if (!tour) return new Set<string>();
    const warnings = new Set<string>();
    for (let i = 1; i < tour.stops.length; i += 1) {
      const prev = tour.stops[i - 1];
      const curr = tour.stops[i];
      const prevEnd = prev.suggestedLeaveAt ? new Date(prev.suggestedLeaveAt).getTime() : NaN;
      const currStart = curr.suggestedArriveAt ? new Date(curr.suggestedArriveAt).getTime() : NaN;
      const driveMs = (curr.driveFromPrevSeconds ?? 0) * 1000;
      if (
        Number.isFinite(prevEnd) &&
        Number.isFinite(currStart) &&
        prevEnd + driveMs > currStart
      ) {
        warnings.add(curr.id);
      }
    }
    return warnings;
  }, [tour]);

  const routeSummaryLabel = useMemo(() => {
    if (!tour) return "";
    const { stopCount, totalMeters, totalDriveSeconds } = tour.summary;
    return `${stopCount} viewing${stopCount === 1 ? "" : "s"} · ${formatKm(totalMeters)} · ${formatDriveDuration(totalDriveSeconds)} drive`;
  }, [tour]);

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.75} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          Viewings Planner
        </Text>
        <View style={styles.topSpacer} />
      </View>

      {leadName ? (
        <View style={styles.leadBanner}>
          <Text style={styles.leadBannerLabel}>Planning for</Text>
          <Text style={styles.leadBannerName}>{leadName}</Text>
        </View>
      ) : null}

      {statusMsg ? (
        <View style={styles.statusBanner}>
          <Text style={styles.statusText}>{statusMsg}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading && !tour ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color="#0F766E" size="large" />
          <Text style={styles.centerText}>Loading viewing plan…</Text>
        </View>
      ) : (
        <View style={styles.body}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.section}>
              <NativeDateTimeField
                label="Viewing date"
                mode="date"
                value={viewingDate}
                placeholder="Select viewing date"
                onChange={(d) => void handleViewingDateChange(d)}
              />
            </View>

            <View style={styles.section}>
              <NativeDateTimeField
                label="First viewing starts"
                mode="time"
                value={startTime}
                placeholder="Select start time"
                onChange={(d) => void handleStartTimeChange(d)}
              />
              <Text style={styles.fieldHint}>
                Arrive time at the first property. Drive times continue to the next stops.
              </Text>
            </View>

            {tour ? (
              <>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryTitle}>Route summary</Text>
                  <Text style={styles.summaryValue}>{routeSummaryLabel}</Text>
                  {routePending ? (
                    <View style={styles.routeOverlay}>
                      <ActivityIndicator color="#0F766E" />
                      <Text style={styles.routeOverlayText}>Recalculating route…</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.section}>
                  <View style={styles.stopsHeaderRow}>
                    <Text style={styles.sectionLabel}>Stops</Text>
                    <TouchableOpacity
                      onPress={() => void openShortlistPicker()}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.addStopsLink}>+ Add from Shortlist</Text>
                    </TouchableOpacity>
                  </View>
                {tour.stops.length === 0 ? (
                  <View style={styles.emptyStopsBox}>
                    <Text style={styles.emptyStops}>
                      No properties on this route yet. Add homes from your Shortlist
                      to enable Recalculate and Save.
                    </Text>
                    <TouchableOpacity
                      style={styles.addStopsBtn}
                      onPress={() => void openShortlistPicker()}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.addStopsBtnText}>Add from Shortlist</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  tour.stops.map((stop, index) => {
                    const times = stopTimes[stop.id] ?? { startsAt: "", endsAt: "" };
                    const hasWarning = travelWarnings.has(stop.id);
                    return (
                      <View key={stop.id} style={styles.stopCard}>
                        {index > 0 && stop.driveFromPrevSeconds != null ? (
                          <View style={styles.driveRow}>
                            <Text style={styles.driveText}>
                              ↓ {formatDriveDuration(stop.driveFromPrevSeconds)}
                              {stop.driveFromPrevMeters != null
                                ? ` · ${formatKm(stop.driveFromPrevMeters)}`
                                : ""}
                            </Text>
                          </View>
                        ) : null}

                        <TouchableOpacity
                          onPress={() => {
                            if (stop.listing) {
                              setDetailListing(stopListingToCard(stop.listing));
                              setDetailOpen(true);
                            }
                          }}
                          activeOpacity={stop.listing ? 0.8 : 1}
                        >
                          <View style={styles.stopHeader}>
                            <Text style={styles.stopIndex}>{index + 1}</Text>
                            <View style={styles.stopHeaderText}>
                              <Text style={styles.stopAddress}>{formatStopAddress(stop)}</Text>
                              {stop.listing ? (
                                <Text style={styles.stopPrice}>
                                  {formatListingPrice(stop.listing.listPrice, "SALE")}
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        </TouchableOpacity>

                        <View style={styles.timeRow}>
                          <View style={styles.timeField}>
                            <Text style={styles.timeLabel}>Arrive</Text>
                            <TextInput
                              value={times.startsAt}
                              onChangeText={(v) =>
                                setStopTimes((prev) => ({
                                  ...prev,
                                  [stop.id]: {
                                    startsAt: v,
                                    endsAt: prev[stop.id]?.endsAt ?? "",
                                  },
                                }))
                              }
                              onBlur={() => void handleStopTimeBlur(stop.id)}
                              placeholder="YYYY-MM-DDTHH:mm"
                              placeholderTextColor="#94A3B8"
                              style={styles.timeInput}
                              autoCapitalize="none"
                            />
                          </View>
                          <View style={styles.timeField}>
                            <Text style={styles.timeLabel}>Leave</Text>
                            <TextInput
                              value={times.endsAt}
                              onChangeText={(v) =>
                                setStopTimes((prev) => ({
                                  ...prev,
                                  [stop.id]: {
                                    startsAt: prev[stop.id]?.startsAt ?? "",
                                    endsAt: v,
                                  },
                                }))
                              }
                              onBlur={() => void handleStopTimeBlur(stop.id)}
                              placeholder="YYYY-MM-DDTHH:mm"
                              placeholderTextColor="#94A3B8"
                              style={styles.timeInput}
                              autoCapitalize="none"
                            />
                          </View>
                        </View>

                        {hasWarning ? (
                          <Text style={styles.travelWarning}>
                            Travel time may not fit before this stop starts.
                          </Text>
                        ) : null}

                        <View style={styles.reorderRow}>
                          <TouchableOpacity
                            style={[styles.reorderBtn, index === 0 && styles.reorderBtnDisabled]}
                            disabled={index === 0}
                            onPress={() => void moveStop(index, -1)}
                          >
                            <Text style={styles.reorderBtnText}>↑ Move up</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.reorderBtn,
                              index === tour.stops.length - 1 && styles.reorderBtnDisabled,
                            ]}
                            disabled={index === tour.stops.length - 1}
                            onPress={() => void moveStop(index, 1)}
                          >
                            <Text style={styles.reorderBtnText}>↓ Move down</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
              </>
            ) : null}
          </ScrollView>

          {tour ? (
            <View style={styles.footer}>
              {tour.stops.length === 0 ? (
                <Text style={styles.footerHint}>
                  Add properties from Shortlist to recalculate and save.
                </Text>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  (routePending || tour.stops.length === 0) && styles.btnDisabled,
                ]}
                disabled={routePending}
                onPress={() => void handleRecalculateRoute()}
                activeOpacity={0.85}
              >
                {routePending ? (
                  <ActivityIndicator color="#2B6CB0" />
                ) : (
                  <Text style={styles.secondaryBtnText}>Recalculate Route</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  (savePending || tour.stops.length === 0) && styles.btnDisabled,
                ]}
                disabled={savePending}
                onPress={() => void handleSave()}
                activeOpacity={0.85}
              >
                {savePending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {saved ? "Update Viewings" : "Save Viewings"}
                  </Text>
                )}
              </TouchableOpacity>

              {saved && shareUrl ? (
                <TouchableOpacity
                  style={styles.shareBtn}
                  onPress={() => setShareMenuOpen(true)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.shareBtnText}>Share with Client</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      )}

      <Modal
        visible={shareMenuOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setShareMenuOpen(false)}
      >
        <View style={styles.shareBackdrop}>
          <TouchableOpacity
            style={styles.shareBackdropTap}
            activeOpacity={1}
            onPress={() => setShareMenuOpen(false)}
          />
          <View style={styles.shareSheet}>
            <Text style={styles.shareTitle}>Share with client</Text>
            {(
              [
                { channel: "email" as const, label: "Email" },
                { channel: "whatsapp" as const, label: "WhatsApp" },
                { channel: "sms" as const, label: "SMS" },
                { channel: "copy_link" as const, label: "Copy link" },
                { channel: "native_share" as const, label: "More options…" },
              ] as const
            ).map((opt) => (
              <TouchableOpacity
                key={opt.channel}
                style={styles.shareOption}
                onPress={() => void handleShare(opt.channel)}
              >
                <Text style={styles.shareOptionText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.shareCancel}
              onPress={() => setShareMenuOpen(false)}
            >
              <Text style={styles.shareCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={shortlistPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setShortlistPickerOpen(false)}
      >
        <View style={styles.shareBackdrop}>
          <View style={styles.shortlistSheet}>
            <View style={styles.shortlistSheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareEyebrow}>Viewings Planner</Text>
                <Text style={styles.shareTitle}>Add from Shortlist</Text>
              </View>
              <TouchableOpacity onPress={() => setShortlistPickerOpen(false)}>
                <Text style={styles.shareCancelText}>Close</Text>
              </TouchableOpacity>
            </View>
            {shortlistLoading ? (
              <View style={styles.shortlistLoader}>
                <ActivityIndicator color="#0F766E" />
              </View>
            ) : shortlistItems.length === 0 ? (
              <Text style={styles.emptyStops}>
                No shortlisted properties yet. Save homes from Property Search first.
              </Text>
            ) : (
              <ScrollView
                style={styles.shortlistScroll}
                contentContainerStyle={styles.shortlistScrollContent}
              >
                {shortlistItems.map((item) => {
                  const selected = shortlistSelected.has(item.mlsNumber);
                  return (
                    <TouchableOpacity
                      key={item.mlsNumber}
                      style={[
                        styles.shortlistRow,
                        selected && styles.shortlistRowSelected,
                      ]}
                      onPress={() => {
                        setShortlistSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(item.mlsNumber)) next.delete(item.mlsNumber);
                          else next.add(item.mlsNumber);
                          return next;
                        });
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.shortlistCheck}>
                        {selected ? "✓" : "○"}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.shortlistAddress} numberOfLines={2}>
                          {item.addressLine}
                          {item.city ? `, ${item.city}` : ""}
                        </Text>
                        <Text style={styles.shortlistMeta}>
                          {formatListingPrice(item.listPrice, item.transactionType)} ·{" "}
                          {item.mlsNumber}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            <TouchableOpacity
              style={[styles.primaryBtn, addingStops && styles.btnDisabled]}
              disabled={addingStops || shortlistLoading}
              onPress={() => void addStopsFromShortlist()}
              activeOpacity={0.85}
            >
              {addingStops ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  Add {shortlistSelected.size || ""} to route
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <PropertyDetailModal
        visible={detailOpen}
        preview={detailListing}
        workspaceId={workspaceId}
        saved={false}
        savedPending={false}
        onClose={() => setDetailOpen(false)}
        onToggleShortlist={() => {
          Alert.alert("Shortlist", "Open property search to manage shortlist.");
        }}
      />
    </View>
  );
}

/** Match AgentShell insets — RN SafeAreaView does not pad Android status/nav bars. */
const topBarPadding =
  Platform.OS === "android"
    ? Math.max(StatusBar.currentHeight || 0, 28) + 8
    : 12;
const footerBottomPadding = Platform.OS === "android" ? 54 : 20;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F4F7F5",
  },
  body: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: topBarPadding,
    paddingBottom: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F766E",
    width: 72,
  },
  topTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    color: "#1E2A38",
  },
  topSpacer: {
    width: 72,
  },
  leadBanner: {
    backgroundColor: "#EFF6FF",
    borderBottomWidth: 1,
    borderBottomColor: "#BFDBFE",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  leadBannerLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  leadBannerName: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: "700",
    color: "#1E2A38",
  },
  statusBanner: {
    backgroundColor: "#ECFDF5",
    borderBottomWidth: 1,
    borderBottomColor: "#A7F3D0",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F766E",
  },
  errorBanner: {
    backgroundColor: "#FFF1F2",
    borderBottomWidth: 1,
    borderBottomColor: "#FECDD3",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#BE123C",
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 24,
  },
  centerText: {
    fontSize: 14,
    color: "#64748B",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 16,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 2,
  },
  fieldHint: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 16,
    paddingHorizontal: 2,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: "#D8DEE6",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: "#1E2A38",
    backgroundColor: "#FFFFFF",
    minHeight: 48,
  },
  startLocationList: {
    gap: 8,
  },
  startLocationChip: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  startLocationChipActive: {
    borderColor: "#0F766E",
    backgroundColor: "#ECFDF5",
  },
  startLocationText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#475569",
  },
  startLocationTextActive: {
    color: "#1E2A38",
    fontWeight: "600",
  },
  startLocationBadge: {
    fontSize: 10,
    fontWeight: "800",
    color: "#0F766E",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  addAddressBtn: {
    marginTop: 4,
    paddingVertical: 10,
    alignItems: "center",
  },
  addAddressBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2B6CB0",
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: footerBottomPadding,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    position: "relative",
    overflow: "hidden",
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryValue: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: "700",
    color: "#1E2A38",
  },
  routeOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.82)",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  routeOverlayText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  emptyStops: {
    fontSize: 13,
    color: "#94A3B8",
    paddingVertical: 8,
    paddingHorizontal: 2,
    lineHeight: 18,
  },
  emptyStopsBox: {
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  stopsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  addStopsLink: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2B6CB0",
  },
  addStopsBtn: {
    backgroundColor: "#0F766E",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  addStopsBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  footerHint: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 2,
  },
  shortlistSheet: {
    maxHeight: "78%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    paddingBottom: 28,
    gap: 12,
  },
  shortlistSheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  shareEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#0F766E",
  },
  shortlistLoader: {
    paddingVertical: 24,
    alignItems: "center",
  },
  shortlistScroll: {
    maxHeight: 360,
  },
  shortlistScrollContent: {
    gap: 8,
    paddingBottom: 8,
  },
  shortlistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#FFFFFF",
  },
  shortlistRowSelected: {
    borderColor: "#0F766E",
    backgroundColor: "#ECFDF5",
  },
  shortlistCheck: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F766E",
    width: 22,
  },
  shortlistAddress: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E2A38",
  },
  shortlistMeta: {
    marginTop: 2,
    fontSize: 12,
    color: "#64748B",
  },
  stopCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: 8,
  },
  driveRow: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  driveText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  stopHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stopIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#0F766E",
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 24,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
  },
  stopHeaderText: {
    flex: 1,
    gap: 2,
  },
  stopAddress: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E2A38",
  },
  stopPrice: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F766E",
  },
  timeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  timeField: {
    flex: 1,
    gap: 4,
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
  },
  timeInput: {
    borderWidth: 1,
    borderColor: "#D8DEE6",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 12,
    color: "#1E2A38",
    backgroundColor: "#F8FAFC",
  },
  travelWarning: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
    color: "#B45309",
  },
  reorderRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  reorderBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  reorderBtnDisabled: {
    opacity: 0.4,
  },
  reorderBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#93C5FD",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2B6CB0",
  },
  primaryBtn: {
    backgroundColor: "#0F766E",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  shareBtn: {
    backgroundColor: "#2B6CB0",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  shareBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  shareBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  shareBackdropTap: {
    flex: 1,
  },
  shareSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    paddingBottom: 28,
    gap: 4,
  },
  shareTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E2A38",
    marginBottom: 8,
  },
  shareOption: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  shareOptionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E2A38",
  },
  shareCancel: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  shareCancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#64748B",
  },
});
