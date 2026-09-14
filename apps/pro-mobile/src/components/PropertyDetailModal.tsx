/**
 * Stage 5.4 — Native property detail overlay (Houzzat consumer layout parity).
 * Opens instantly with card preview; fetches full detail in background.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import { propertyDetailCache } from "../lib/lead-tab-cache";
import {
  formatListingAddress,
  formatListingBeds,
  formatListingPrice,
  unwrapPropertyDetail,
} from "../lib/property-response";
import type { MobileListingCard, MobilePropertyDetail } from "../types/property";
import { ShortlistButton } from "./ShortlistButton";

type PropertyDetailModalProps = {
  visible: boolean;
  preview: MobileListingCard | null;
  workspaceId: string | undefined;
  saved: boolean;
  savedPending: boolean;
  onClose: () => void;
  onToggleShortlist: (mlsNumber: string) => void;
  onSavedChange?: (mlsNumber: string, saved: boolean) => void;
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
}: PropertyDetailModalProps) {
  /**
   * Keep last card while Modal animates closed. Never unmount <Modal> when
   * parent clears preview in the same update as visible=false — that leaves a
   * ghost native modal host that eats taps while scroll still works.
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

  const loadDetail = useCallback(async () => {
    if (!workspaceId || !mlsNumber) return;
    const gen = ++fetchGen.current;
    const key = detailCacheKey(workspaceId, mlsNumber);

    const hit = propertyDetailCache.get(key);
    if (hit?.detail) {
      setDetail(hit.detail);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await mobileApiClient.get<unknown>(
        `/properties/${encodeURIComponent(mlsNumber)}`,
      );
      if (gen !== fetchGen.current) return;
      if (!res.ok) {
        setError(res.message || "Could not load property");
        setLoading(false);
        return;
      }
      const parsed = unwrapPropertyDetail(res.data);
      if (!parsed) {
        setError("Could not load property");
        setLoading(false);
        return;
      }
      setDetail(parsed.detail);
      propertyDetailCache.set(key, {
        detail: parsed.detail,
        saved: parsed.saved,
        timestamp: Date.now(),
      });
      onSavedChange?.(mlsNumber, parsed.saved);
    } catch (err: unknown) {
      if (gen !== fetchGen.current) return;
      setError(err instanceof Error ? err.message : "Could not load property");
    } finally {
      if (gen === fetchGen.current) setLoading(false);
    }
  }, [workspaceId, mlsNumber, onSavedChange]);

  useEffect(() => {
    if (!visible || !mlsNumber) return;
    void loadDetail();
  }, [visible, mlsNumber, loadDetail]);

  useEffect(() => {
    if (visible) return;
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {!card ? (
        <View style={styles.root} />
      ) : (
      <View style={styles.root}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.75}>
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
      </View>
      )}
    </Modal>
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
    paddingBottom: 32,
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
});
