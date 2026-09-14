/**
 * Stage 5.4 — Native property detail overlay (Houzzat consumer layout parity).
 * Opens instantly with card preview; fetches full detail in background.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import { propertyDetailCache } from "../lib/lead-tab-cache";
import { pushAndroidBackHandler } from "../lib/android-back-stack";
import {
  formatListingAddress,
  formatListingBeds,
  formatListingPrice,
  unwrapPropertyDetail,
} from "../lib/property-response";
import {
  listingShareInputFromCard,
  listingShareInputFromDetail,
} from "../lib/listing-share";
import type { MobileListingCard, MobilePropertyDetail } from "../types/property";
import { ListingActionsSheet } from "./ListingActionsSheet";
import { ShortlistButton } from "./ShortlistButton";
import { useAuth } from "../state/AuthContext";

type PropertyDetailModalProps = {
  visible: boolean;
  preview: MobileListingCard | null;
  workspaceId: string | undefined;
  saved: boolean;
  savedPending: boolean;
  onClose: () => void;
  onToggleShortlist: (mlsNumber: string) => void;
  onSavedChange?: (mlsNumber: string, saved: boolean) => void;
  /** Opens lead picker / viewings planner with this MLS. */
  onAddToViewing?: (mlsNumber: string) => void;
};

const DEFAULT_GALLERY_WIDTH = 360;

function detailCacheKey(workspaceId: string, mlsNumber: string): string {
  return `${workspaceId}:property:${mlsNumber.toUpperCase()}`;
}

function cardToPreviewDetail(card: MobileListingCard): Partial<MobilePropertyDetail> {
  return {
    mlsNumber: card.mlsNumber,
    listPrice: card.listPrice,
    transactionType: card.transactionType,
    addressLine: card.addressLine,
    unitNumber: card.unitNumber,
    city: card.city,
    community: card.community,
    beds: card.beds,
    baths: card.baths,
    bedsLabel: card.bedsLabel ?? null,
    daysOnMarket: card.daysOnMarket,
    timingLabel: card.timingLabel ?? "",
    primaryImageUrl: card.primaryImageUrl,
    imageUrls: card.primaryImageUrl ? [card.primaryImageUrl] : [],
    status: card.status,
    propertyType: card.propertyType,
  };
}

export function PropertyDetailModal({
  visible,
  preview,
  workspaceId,
  saved,
  savedPending,
  onClose,
  onToggleShortlist,
  onSavedChange,
  onAddToViewing,
}: PropertyDetailModalProps) {
  const { activeWorkspace } = useAuth();
  const workspacePublicOrigin = activeWorkspace?.publicOrigin ?? null;

  /**
   * Keep last card while parent clears preview after close.
   * Uses a View portal (not RN Modal). Android Modal + hardware back leaves a
   * ghost Dialog that eats taps until the screen remounts.
   */
  const heldPreviewRef = useRef<MobileListingCard | null>(preview);
  if (preview) heldPreviewRef.current = preview;
  const card = preview ?? heldPreviewRef.current;

  const mlsNumber = card?.mlsNumber ?? "";
  const cacheKey =
    workspaceId && mlsNumber ? detailCacheKey(workspaceId, mlsNumber) : null;
  const cached = cacheKey ? propertyDetailCache.get(cacheKey) : undefined;

  const [detail, setDetail] = useState<MobilePropertyDetail | null>(
    cached?.detail ?? null,
  );
  const [loading, setLoading] = useState(!cached?.detail);
  const [error, setError] = useState<string | null>(null);
  const [galleryWidth, setGalleryWidth] = useState(DEFAULT_GALLERY_WIDTH);
  const [actionsOpen, setActionsOpen] = useState(false);
  const fetchGen = useRef(0);

  const onGalleryLayout = useCallback(
    (event: { nativeEvent: { layout: { width: number } } }) => {
      const width = event.nativeEvent.layout.width;
      if (width > 0) setGalleryWidth(width);
    },
    [],
  );

  const previewDetail = useMemo(
    () => (card ? cardToPreviewDetail(card) : null),
    [card],
  );

  const display = detail ?? (previewDetail as MobilePropertyDetail | null);

  // Keep latest callback without re-creating loadDetail (avoids fetch storms).
  const onSavedChangeRef = useRef(onSavedChange);
  onSavedChangeRef.current = onSavedChange;
  const savedRef = useRef(saved);
  savedRef.current = saved;

  const loadDetail = useCallback(async () => {
    if (!workspaceId || !mlsNumber) return;
    const gen = ++fetchGen.current;
    const key = detailCacheKey(workspaceId, mlsNumber);
    const hadDetail = Boolean(propertyDetailCache.get(key)?.detail);

    const hit = propertyDetailCache.get(key);
    if (hit?.detail) {
      setDetail(hit.detail);
      setLoading(false);
    } else {
      setLoading(true);
    }
    // Don't clear an existing soft error until a successful refresh.
    if (!hadDetail) setError(null);

    try {
      const res = await mobileApiClient.get<unknown>(
        `/properties/${encodeURIComponent(mlsNumber)}`,
      );
      if (gen !== fetchGen.current) return;
      if (!res.ok) {
        // Keep cached/preview content; only surface hard errors when nothing loaded.
        if (!hadDetail && !propertyDetailCache.get(key)?.detail) {
          setError(res.message || "Could not load property");
        } else {
          setError(res.message || "Could not refresh property");
        }
        setLoading(false);
        return;
      }
      const parsed = unwrapPropertyDetail(res.data);
      if (!parsed) {
        if (!hadDetail) setError("Could not load property");
        setLoading(false);
        return;
      }
      setDetail(parsed.detail);
      setError(null);
      propertyDetailCache.set(key, {
        detail: parsed.detail,
        saved: parsed.saved,
        timestamp: Date.now(),
      });
      // Only notify parent when shortlist state actually changed.
      if (parsed.saved !== savedRef.current) {
        onSavedChangeRef.current?.(mlsNumber, parsed.saved);
      }
    } catch (err: unknown) {
      if (gen !== fetchGen.current) return;
      const msg =
        err instanceof Error ? err.message : "Could not load property";
      setError(msg);
    } finally {
      if (gen === fetchGen.current) setLoading(false);
    }
  }, [workspaceId, mlsNumber]);

  useEffect(() => {
    if (!visible || !mlsNumber) return;
    void loadDetail();
  }, [visible, mlsNumber, loadDetail]);

  useEffect(() => {
    if (visible) return;
    setActionsOpen(false);
    const timer = setTimeout(() => {
      heldPreviewRef.current = null;
      setDetail(null);
      setError(null);
    }, 450);
    return () => clearTimeout(timer);
  }, [visible]);

  const images =
    display?.imageUrls && display.imageUrls.length > 0
      ? display.imageUrls
      : card?.primaryImageUrl
        ? [card.primaryImageUrl]
        : [];

  const shareInput = useMemo(() => {
    if (detail) {
      return listingShareInputFromDetail(detail, {
        publicOrigin: workspacePublicOrigin,
      });
    }
    if (card) {
      return listingShareInputFromCard(card, {
        publicOrigin: workspacePublicOrigin,
      });
    }
    return null;
  }, [detail, card, workspacePublicOrigin]);

  const handleAddToViewing = useCallback(() => {
    if (!mlsNumber || !onAddToViewing) return;
    setActionsOpen(false);
    onAddToViewing(mlsNumber);
  }, [mlsNumber, onAddToViewing]);

  const handleRequestClose = useCallback(() => {
    if (actionsOpen) {
      setActionsOpen(false);
      return;
    }
    onClose();
  }, [actionsOpen, onClose]);

  useEffect(() => {
    if (!visible || Platform.OS !== "android") return;
    return pushAndroidBackHandler(() => {
      handleRequestClose();
      return true;
    });
  }, [visible, handleRequestClose]);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.portal} collapsable={false} pointerEvents="auto">
      {!card ? (
        <View style={styles.root} />
      ) : (
      <View style={styles.root}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleRequestClose} style={styles.closeBtn} activeOpacity={0.75}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Property
          </Text>
          <View style={styles.headerActions}>
            <ShortlistButton
              saved={saved}
              pending={savedPending}
              compact
              onPress={() => onToggleShortlist(mlsNumber)}
            />
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {images.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.gallery}
              onLayout={onGalleryLayout}
            >
              {images.map((uri, idx) => (
                <Image
                  key={`${uri}-${idx}`}
                  source={{ uri }}
                  style={[styles.galleryImage, { width: galleryWidth }]}
                  resizeMode="cover"
                  fadeDuration={0}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.galleryPlaceholder}>
              <Text style={styles.galleryPlaceholderText}>No photos</Text>
            </View>
          )}

          <View style={styles.summaryCard}>
            <View style={styles.priceRow}>
              <Text style={styles.price}>
                {formatListingPrice(
                  display?.listPrice ?? card.listPrice,
                  display?.transactionType ?? card.transactionType,
                )}
              </Text>
              {(display?.timingLabel || card.timingLabel) ? (
                <Text style={styles.timing}>
                  {display?.timingLabel || card.timingLabel}
                </Text>
              ) : null}
            </View>

            <Text style={styles.address}>
              {display
                ? formatListingAddress({
                    addressLine: display.addressLine,
                    unitNumber: display.unitNumber,
                    city: display.city,
                    community: display.community,
                    mlsNumber: display.mlsNumber,
                    status: display.status,
                    transactionType: display.transactionType as "SALE" | "LEASE",
                    propertyType: display.propertyType,
                    listPrice: display.listPrice,
                    soldPrice: display.soldPrice,
                    beds: display.beds,
                    baths: display.baths,
                    sqft: null,
                    primaryImageUrl: display.primaryImageUrl,
                    daysOnMarket: display.daysOnMarket,
                    listedAt: display.listedAt,
                    soldAt: display.soldAt,
                  })
                : formatListingAddress(card)}
            </Text>

            {display?.statusLabel ? (
              <View style={styles.badgeRow}>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>{display.statusLabel}</Text>
                </View>
                {display.propertyTypeLabel ? (
                  <Text style={styles.typeLabel}>{display.propertyTypeLabel}</Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.factsRow}>
              <Text style={styles.fact}>
                {display
                  ? formatListingBeds({
                      beds: display.beds,
                      bedsLabel: display.bedsLabel,
                      mlsNumber: display.mlsNumber,
                      status: display.status,
                      transactionType: display.transactionType as "SALE" | "LEASE",
                      propertyType: display.propertyType,
                      listPrice: display.listPrice,
                      soldPrice: display.soldPrice,
                      baths: display.baths,
                      sqft: null,
                      addressLine: display.addressLine,
                      unitNumber: display.unitNumber,
                      city: display.city,
                      community: display.community,
                      primaryImageUrl: display.primaryImageUrl,
                      daysOnMarket: display.daysOnMarket,
                      listedAt: display.listedAt,
                      soldAt: display.soldAt,
                    })
                  : formatListingBeds(card)}{" "}
                bed
              </Text>
              <Text style={styles.factSep}>·</Text>
              <Text style={styles.fact}>{display?.baths ?? card.baths} bath</Text>
              {display?.parkingSpaces != null && display.parkingSpaces > 0 ? (
                <>
                  <Text style={styles.factSep}>·</Text>
                  <Text style={styles.fact}>{display.parkingSpaces} parking</Text>
                </>
              ) : null}
              {display?.sqftLabel ? (
                <>
                  <Text style={styles.factSep}>·</Text>
                  <Text style={styles.fact}>{display.sqftLabel}</Text>
                </>
              ) : null}
            </View>

            <Text style={styles.mlsLine}>MLS® #{display?.mlsNumber ?? card.mlsNumber}</Text>

            <ShortlistButton
              saved={saved}
              pending={savedPending}
              onPress={() => onToggleShortlist(mlsNumber)}
            />
          </View>

          {loading && !detail ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color="#0F766E" />
              <Text style={styles.loadingText}>Loading details…</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => void loadDetail()}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {detail?.description ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.bodyText}>{detail.description}</Text>
            </View>
          ) : null}

          {detail ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Listing facts</Text>
              <View style={styles.factsGrid}>
                <FactRow label="Days on market" value={String(detail.daysOnMarket)} />
                {detail.yearBuilt ? (
                  <FactRow label="Year built" value={String(detail.yearBuilt)} />
                ) : null}
                {detail.taxes != null ? (
                  <FactRow
                    label="Taxes"
                    value={new Intl.NumberFormat("en-CA", {
                      style: "currency",
                      currency: "CAD",
                      maximumFractionDigits: 0,
                    }).format(detail.taxes)}
                  />
                ) : null}
                {detail.maintenanceFee != null ? (
                  <FactRow
                    label="Maintenance"
                    value={new Intl.NumberFormat("en-CA", {
                      style: "currency",
                      currency: "CAD",
                      maximumFractionDigits: 0,
                    }).format(detail.maintenanceFee)}
                  />
                ) : null}
              </View>
            </View>
          ) : null}

          {detail?.featureSections?.map((section) =>
            section.rows.length > 0 ? (
              <View key={section.id} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <View style={styles.featureGrid}>
                  {section.rows.map((row) => (
                    <View
                      key={`${section.id}-${row.label}`}
                      style={styles.featureCell}
                    >
                      <Text style={styles.featureLabel}>{row.label}</Text>
                      <Text
                        style={[
                          styles.featureValue,
                          row.label === "Virtual Tour" && styles.featureLink,
                        ]}
                        numberOfLines={row.label === "Legal Description" ? 6 : 3}
                      >
                        {row.value}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null,
          )}

          {detail &&
          (detail.brokerageName ||
            detail.brokeragePhone ||
            detail.agentName ||
            detail.agentCellPhone) ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Listing brokerage</Text>
              <View style={styles.brokerageBlock}>
                {detail.brokerageName ? (
                  <Text style={styles.brokerageName}>{detail.brokerageName}</Text>
                ) : null}
                {detail.brokeragePhone ? (
                  <FactRow
                    label="Brokerage number"
                    value={detail.brokeragePhone}
                  />
                ) : null}
                {detail.agentName ? (
                  <FactRow label="Agent name" value={detail.agentName} />
                ) : null}
                {detail.agentCellPhone ? (
                  <FactRow
                    label="Agent cell number"
                    value={detail.agentCellPhone}
                  />
                ) : null}
              </View>
            </View>
          ) : null}

          {detail &&
          Number.isFinite(detail.lat) &&
          Number.isFinite(detail.lng) ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Location</Text>
              <Text style={styles.bodyText}>
                {detail.city}
                {detail.community ? ` · ${detail.community}` : ""}
              </Text>
              <Text style={styles.coordsText}>
                {detail.lat.toFixed(5)}, {detail.lng.toFixed(5)}
              </Text>
            </View>
          ) : null}

          {detail?.mlsDisclaimer ? (
            <View style={styles.disclaimer}>
              <Text style={styles.disclaimerText}>{detail.mlsDisclaimer}</Text>
            </View>
          ) : null}
        </ScrollView>

        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.85}
          onPress={() => setActionsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Listing actions"
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>

        <ListingActionsSheet
          visible={actionsOpen}
          listing={shareInput}
          showAddToViewing={Boolean(onAddToViewing)}
          onClose={() => setActionsOpen(false)}
          onAddToViewing={onAddToViewing ? handleAddToViewing : undefined}
        />
      </View>
      )}
    </View>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  portal: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 400,
    elevation: 400,
    backgroundColor: "#F4F7F5",
  },
  root: {
    flex: 1,
    backgroundColor: "#F4F7F5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 52,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#475569",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    color: "#1E2A38",
    marginHorizontal: 8,
  },
  headerActions: {
    width: 36,
    alignItems: "flex-end",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 96,
  },
  gallery: {
    height: 260,
    backgroundColor: "#EEF2F6",
  },
  galleryImage: {
    height: 260,
  },
  galleryPlaceholder: {
    height: 200,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2F6",
  },
  galleryPlaceholderText: {
    fontSize: 13,
    color: "#94A3B8",
    fontWeight: "600",
  },
  summaryCard: {
    margin: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 10,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  price: {
    flex: 1,
    fontSize: 26,
    fontWeight: "800",
    color: "#0F766E",
  },
  timing: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "right",
    maxWidth: 140,
  },
  address: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1E2A38",
    lineHeight: 24,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  statusBadge: {
    backgroundColor: "#ECFDF5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
  },
  typeLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },
  factsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
  },
  fact: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "600",
  },
  factSep: {
    fontSize: 13,
    color: "#CBD5E1",
  },
  mlsLine: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "600",
  },
  loadingBox: {
    padding: 20,
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: "#64748B",
  },
  errorBox: {
    marginHorizontal: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#FFF1F2",
    borderWidth: 1,
    borderColor: "#FECDD3",
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    color: "#BE123C",
    fontWeight: "600",
  },
  retryText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2B6CB0",
  },
  section: {
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#334155",
  },
  factsGrid: {
    gap: 8,
  },
  featureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 16,
    rowGap: 12,
  },
  featureCell: {
    width: "47%",
    gap: 2,
  },
  featureLabel: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "600",
  },
  featureValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E2A38",
    lineHeight: 18,
  },
  featureLink: {
    color: "#0F766E",
  },
  brokerageBlock: {
    gap: 8,
  },
  brokerageName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E2A38",
    marginBottom: 2,
  },
  factRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  factLabel: {
    fontSize: 13,
    color: "#64748B",
  },
  factValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E2A38",
    flexShrink: 1,
    textAlign: "right",
  },
  coordsText: {
    fontSize: 12,
    color: "#94A3B8",
  },
  disclaimer: {
    marginHorizontal: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
  },
  disclaimerText: {
    fontSize: 11,
    lineHeight: 16,
    color: "#64748B",
  },
  fab: {
    position: "absolute",
    right: 18,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F172A",
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: {
    fontSize: 32,
    fontWeight: "400",
    color: "#FFFFFF",
    marginTop: -2,
    lineHeight: 36,
  },
});
