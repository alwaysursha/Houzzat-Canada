/**
 * Stage 5.3 — Native Properties Search + shortlist email.
 *
 * Web authority: /agent/search (SearchExperience cards list) +
 * EngagementMatchboard multi-select + shortlist email.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ShortlistEmailSheet } from "../components/ShortlistEmailSheet";
import { PropertyDetailModal } from "../components/PropertyDetailModal";
import { ShortlistButton } from "../components/ShortlistButton";
import { mobileApiClient } from "../api/client";
import { usePropertySavedListings } from "../hooks/usePropertySavedListings";
import {
  buildPropertiesSearchQuery,
  formatListingAddress,
  formatListingBeds,
  formatListingPrice,
  unwrapPropertiesSearch,
} from "../lib/property-response";
import { propertySearchCache } from "../lib/lead-tab-cache";
import { useAuth } from "../state/AuthContext";
import {
  DEFAULT_PROPERTY_FILTERS,
  MAX_SHORTLIST_SIZE,
  PROPERTY_TYPE_OPTIONS,
  type MobileListingCard,
  type PropertySearchFilters,
} from "../types/property";

type PropertiesSearchScreenProps = {
  onBack: () => void;
};

const SORT_OPTIONS = [
  { key: "newest", label: "Newest" },
  { key: "price_asc", label: "Price ↑" },
  { key: "price_desc", label: "Price ↓" },
] as const;

/** Max remote photos decoded at once — same strategy as EngagementTab. */
export const LISTING_IMAGE_LIMIT = 12;

const PropertyListingCard = memo(function PropertyListingCard({
  listing,
  isSelected,
  showImage,
  isSaved,
  shortlistPending,
  onOpen,
  onToggleSelect,
  onToggleShortlist,
}: {
  listing: MobileListingCard;
  isSelected: boolean;
  showImage: boolean;
  isSaved: boolean;
  shortlistPending: boolean;
  onOpen: (listing: MobileListingCard) => void;
  onToggleSelect: (mls: string) => void;
  onToggleShortlist: (mls: string) => void;
}) {
  const timing = listing.timingLabel?.trim();

  if (!showImage) {
    return (
      <TouchableOpacity
        style={[styles.cardCompact, isSelected && styles.cardSelected]}
        onPress={() => onOpen(listing)}
        activeOpacity={0.85}
      >
        <TouchableOpacity
          style={[styles.checkBadgeInline, isSelected && styles.checkBadgeOn]}
          onPress={() => onToggleSelect(listing.mlsNumber)}
          activeOpacity={0.85}
        >
          <Text style={[styles.checkBadgeText, isSelected && styles.checkBadgeTextOn]}>
            {isSelected ? "✓" : ""}
          </Text>
        </TouchableOpacity>
        <View style={styles.cardCompactBody}>
          <Text style={styles.cardAddress} numberOfLines={1}>
            {formatListingAddress(listing)}
          </Text>
          <Text style={styles.cardPrice}>
            {formatListingPrice(listing.listPrice, listing.transactionType)}
          </Text>
          <Text style={styles.cardMeta}>
            {formatListingBeds(listing)} bed · {listing.baths} bath · MLS{" "}
            {listing.mlsNumber}
          </Text>
          {timing ? <Text style={styles.cardTiming}>{timing}</Text> : null}
        </View>
        <ShortlistButton
          saved={isSaved}
          pending={shortlistPending}
          compact
          onPress={() => onToggleShortlist(listing.mlsNumber)}
        />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.card, isSelected && styles.cardSelected]}
      onPress={() => onOpen(listing)}
      activeOpacity={0.85}
    >
      <View style={styles.cardImageWrap}>
        {listing.primaryImageUrl ? (
          <Image
            source={{ uri: listing.primaryImageUrl }}
            style={styles.cardImage}
            resizeMode="cover"
            fadeDuration={0}
          />
        ) : (
          <View style={styles.cardImagePlaceholder}>
            <Text style={styles.cardImagePlaceholderText}>No photo</Text>
          </View>
        )}
        <TouchableOpacity
          style={[styles.checkBadge, isSelected && styles.checkBadgeOn]}
          onPress={() => onToggleSelect(listing.mlsNumber)}
          activeOpacity={0.85}
        >
          <Text style={[styles.checkBadgeText, isSelected && styles.checkBadgeTextOn]}>
            {isSelected ? "✓" : ""}
          </Text>
        </TouchableOpacity>
        <View style={styles.shortlistOverlay}>
          <ShortlistButton
            saved={isSaved}
            pending={shortlistPending}
            compact
            onPress={() => onToggleShortlist(listing.mlsNumber)}
          />
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardAddress} numberOfLines={2}>
          {formatListingAddress(listing)}
        </Text>
        <Text style={styles.cardPrice}>
          {formatListingPrice(listing.listPrice, listing.transactionType)}
        </Text>
        <Text style={styles.cardMeta}>
          {formatListingBeds(listing)} bed · {listing.baths} bath · MLS{" "}
          {listing.mlsNumber}
        </Text>
        {timing ? <Text style={styles.cardTiming}>{timing}</Text> : null}
      </View>
    </TouchableOpacity>
  );
});

function filtersQueryKey(q: string, filters: PropertySearchFilters): string {
  return JSON.stringify({ q: q.trim(), ...filters });
}

export function PropertiesSearchScreen({ onBack }: PropertiesSearchScreenProps) {
  const { activeWorkspace } = useAuth();
  const workspaceId = activeWorkspace?.id;
  const cacheKey = workspaceId ? `${workspaceId}:properties` : "";

  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [filters, setFilters] = useState<PropertySearchFilters>(
    DEFAULT_PROPERTY_FILTERS,
  );
  const [draftFilters, setDraftFilters] =
    useState<PropertySearchFilters>(DEFAULT_PROPERTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const queryKey = filtersQueryKey(submittedQuery, filters);
  const cached = cacheKey ? propertySearchCache.get(cacheKey) : undefined;
  const cacheHit = cached?.queryKey === queryKey ? cached : undefined;

  const [listings, setListings] = useState<MobileListingCard[]>(
    cacheHit?.listings ?? [],
  );
  const [loading, setLoading] = useState(!cacheHit);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [emailOpen, setEmailOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [detailListing, setDetailListing] = useState<MobileListingCard | null>(null);

  const {
    isSaved,
    toggleSaved,
    pendingMls,
    setSavedLocal,
  } = usePropertySavedListings(workspaceId);

  const fetchGenRef = useRef(0);

  const persistCache = useCallback(
    (items: MobileListingCard[], key: string) => {
      if (!cacheKey) return;
      propertySearchCache.set(cacheKey, {
        listings: items,
        queryKey: key,
        timestamp: Date.now(),
      });
    },
    [cacheKey],
  );

  const runSearch = useCallback(
    async (opts?: { background?: boolean; q?: string; f?: PropertySearchFilters }) => {
      const gen = ++fetchGenRef.current;
      const q = opts?.q ?? submittedQuery;
      const f = opts?.f ?? filters;
      const key = filtersQueryKey(q, f);

      if (!opts?.background) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const endpoint = buildPropertiesSearchQuery({ q, filters: f });
        const res = await mobileApiClient.get<unknown>(endpoint);
        if (gen !== fetchGenRef.current) return;
        if (!res.ok) {
          setError(res.message || "Could not search properties");
          return;
        }
        const parsed = unwrapPropertiesSearch(res.data);
        setListings(parsed.listings);
        persistCache(parsed.listings, key);
      } catch (err: unknown) {
        if (gen !== fetchGenRef.current) return;
        setError(err instanceof Error ? err.message : "Could not search properties");
      } finally {
        if (gen === fetchGenRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [submittedQuery, filters, persistCache],
  );

  useEffect(() => {
    setSelected(new Set());
    setStatusMsg(null);
    if (cacheHit) {
      setListings(cacheHit.listings);
      setLoading(false);
      void runSearch({ background: true });
    } else {
      void runSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- workspace / filter change
  }, [workspaceId, submittedQuery, filters]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.minPrice.trim()) n++;
    if (filters.maxPrice.trim()) n++;
    if (filters.minBeds.trim()) n++;
    if (filters.minBaths.trim()) n++;
    if (filters.openHouseOnly) n++;
    if (filters.propertyTypes.length > 0) n++;
    if (filters.sort !== "newest") n++;
    return n;
  }, [filters]);

  const toggleMls = useCallback((mls: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(mls)) {
        next.delete(mls);
      } else {
        if (next.size >= MAX_SHORTLIST_SIZE) return prev;
        next.add(mls);
      }
      return next;
    });
  }, []);

  const openDetail = useCallback((listing: MobileListingCard) => {
    setDetailListing(listing);
  }, []);

  const handleToggleShortlist = useCallback(
    (mls: string) => {
      void toggleSaved(mls);
    },
    [toggleSaved],
  );

  const renderListing = useCallback(
    ({ item, index }: { item: MobileListingCard; index: number }) => (
      <PropertyListingCard
        listing={item}
        isSelected={selected.has(item.mlsNumber)}
        showImage={index < LISTING_IMAGE_LIMIT}
        isSaved={isSaved(item.mlsNumber)}
        shortlistPending={pendingMls === item.mlsNumber}
        onOpen={openDetail}
        onToggleSelect={toggleMls}
        onToggleShortlist={handleToggleShortlist}
      />
    ),
    [selected, openDetail, toggleMls, handleToggleShortlist, isSaved, pendingMls],
  );

  const keyExtractor = useCallback(
    (item: MobileListingCard) => item.mlsNumber,
    [],
  );

  const listEmpty = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator color="#0F766E" size="large" />
          <Text style={styles.centerText}>Searching listings…</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => void runSearch()}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.centerBox}>
        <Text style={styles.centerText}>No listings match your search.</Text>
      </View>
    );
  }, [loading, error, runSearch]);

  const handleSubmitSearch = () => {
    setSubmittedQuery(query.trim());
  };

  const applyFilters = () => {
    setFilters(draftFilters);
    setFiltersOpen(false);
  };

  const handleEmailSuccess = () => {
    setSelected(new Set());
    setEmailOpen(false);
  };

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.75}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          Properties
        </Text>
        <View style={styles.topSpacer} />
      </View>

      <View style={styles.controls}>
        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="City, address, MLS…"
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
            returnKeyType="search"
            onSubmitEditing={handleSubmitSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.searchBtn}
            onPress={handleSubmitSearch}
            activeOpacity={0.85}
          >
            <Text style={styles.searchBtnText}>Search</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.chipRow}>
          <TouchableOpacity
            style={[
              styles.chip,
              filters.transactionType === "SALE" && styles.chipActive,
            ]}
            onPress={() =>
              setFilters((f) => ({ ...f, transactionType: "SALE" }))
            }
          >
            <Text
              style={[
                styles.chipText,
                filters.transactionType === "SALE" && styles.chipTextActive,
              ]}
            >
              Buy
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.chip,
              filters.transactionType === "LEASE" && styles.chipActive,
            ]}
            onPress={() =>
              setFilters((f) => ({ ...f, transactionType: "LEASE" }))
            }
          >
            <Text
              style={[
                styles.chipText,
                filters.transactionType === "LEASE" && styles.chipTextActive,
              ]}
            >
              Rent
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, styles.filterChip]}
            onPress={() => {
              setDraftFilters(filters);
              setFiltersOpen(true);
            }}
          >
            <Text style={styles.chipText}>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {statusMsg ? (
        <View style={styles.statusBanner}>
          <Text style={styles.statusText}>{statusMsg}</Text>
        </View>
      ) : null}

      <FlatList
        style={styles.list}
        data={listings}
        keyExtractor={keyExtractor}
        renderItem={renderListing}
        extraData={selected}
        contentContainerStyle={[
          styles.listContent,
          selected.size > 0 && styles.listContentWithBar,
          listings.length === 0 && styles.listContentEmpty,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void runSearch({ background: true })}
            tintColor="#0F766E"
          />
        }
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={listEmpty}
        removeClippedSubviews
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={9}
        showsVerticalScrollIndicator={false}
      />

      {selected.size > 0 ? (
        <View style={styles.selectionBar}>
          <View style={styles.selectionTop}>
            <Text style={styles.selectionCount}>{selected.size} selected</Text>
            <TouchableOpacity onPress={() => setSelected(new Set())}>
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.emailBtn}
            onPress={() => setEmailOpen(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.emailBtnText}>Email to lead</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal
        visible={filtersOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setFiltersOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <TouchableOpacity onPress={() => setFiltersOpen(false)}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.fieldLabel}>Sort</Text>
              <View style={styles.chipRow}>
                {SORT_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.chip,
                      draftFilters.sort === opt.key && styles.chipActive,
                    ]}
                    onPress={() =>
                      setDraftFilters((f) => ({ ...f, sort: opt.key }))
                    }
                  >
                    <Text
                      style={[
                        styles.chipText,
                        draftFilters.sort === opt.key && styles.chipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Price min / max</Text>
              <View style={styles.row2}>
                <TextInput
                  value={draftFilters.minPrice}
                  onChangeText={(v) =>
                    setDraftFilters((f) => ({ ...f, minPrice: v.replace(/\D/g, "") }))
                  }
                  placeholder="Min"
                  keyboardType="numeric"
                  style={styles.fieldInput}
                />
                <TextInput
                  value={draftFilters.maxPrice}
                  onChangeText={(v) =>
                    setDraftFilters((f) => ({ ...f, maxPrice: v.replace(/\D/g, "") }))
                  }
                  placeholder="Max"
                  keyboardType="numeric"
                  style={styles.fieldInput}
                />
              </View>

              <Text style={styles.fieldLabel}>Beds / baths (min)</Text>
              <View style={styles.row2}>
                <TextInput
                  value={draftFilters.minBeds}
                  onChangeText={(v) =>
                    setDraftFilters((f) => ({ ...f, minBeds: v.replace(/\D/g, "") }))
                  }
                  placeholder="Beds"
                  keyboardType="numeric"
                  style={styles.fieldInput}
                />
                <TextInput
                  value={draftFilters.minBaths}
                  onChangeText={(v) =>
                    setDraftFilters((f) => ({ ...f, minBaths: v.replace(/\D/g, "") }))
                  }
                  placeholder="Baths"
                  keyboardType="numeric"
                  style={styles.fieldInput}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.chip,
                  draftFilters.openHouseOnly && styles.chipActive,
                  styles.openHouseChip,
                ]}
                onPress={() =>
                  setDraftFilters((f) => ({
                    ...f,
                    openHouseOnly: !f.openHouseOnly,
                  }))
                }
              >
                <Text
                  style={[
                    styles.chipText,
                    draftFilters.openHouseOnly && styles.chipTextActive,
                  ]}
                >
                  Open house only
                </Text>
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>Property types</Text>
              <View style={styles.chipRow}>
                {PROPERTY_TYPE_OPTIONS.map((opt) => {
                  const on = draftFilters.propertyTypes.includes(opt.key);
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.chip, on && styles.chipActive]}
                      onPress={() =>
                        setDraftFilters((f) => ({
                          ...f,
                          propertyTypes: on
                            ? f.propertyTypes.filter((t) => t !== opt.key)
                            : [...f.propertyTypes, opt.key],
                        }))
                      }
                    >
                      <Text style={[styles.chipText, on && styles.chipTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity style={styles.applyBtn} onPress={applyFilters}>
                <Text style={styles.applyBtnText}>Apply filters</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ShortlistEmailSheet
        visible={emailOpen}
        mlsNumbers={[...selected]}
        onClose={() => setEmailOpen(false)}
        onSuccess={(result) => {
          setStatusMsg(
            `Emailed ${result.count} homes. Share link copied to success message in sheet.`,
          );
          handleEmailSuccess();
        }}
      />

      <PropertyDetailModal
        visible={detailListing != null}
        preview={detailListing}
        workspaceId={workspaceId}
        saved={detailListing ? isSaved(detailListing.mlsNumber) : false}
        savedPending={
          detailListing != null && pendingMls === detailListing.mlsNumber
        }
        onClose={() => setDetailListing(null)}
        onToggleShortlist={handleToggleShortlist}
        onSavedChange={(mls, saved) => setSavedLocal(mls, saved)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F4F7F5",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  controls: {
    padding: 12,
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  searchRow: {
    flexDirection: "row",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D8DEE6",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1E2A38",
    backgroundColor: "#FFFFFF",
  },
  searchBtn: {
    backgroundColor: "#0F766E",
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  searchBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
  },
  chipActive: {
    borderColor: "#2B6CB0",
    backgroundColor: "#EFF6FF",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  chipTextActive: {
    color: "#1E40AF",
  },
  filterChip: {
    marginLeft: 4,
  },
  statusBanner: {
    backgroundColor: "#ECFDF5",
    borderBottomWidth: 1,
    borderBottomColor: "#A7F3D0",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#047857",
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 12,
    gap: 10,
    paddingBottom: 24,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  listContentWithBar: {
    paddingBottom: 120,
  },
  centerBox: {
    paddingVertical: 40,
    alignItems: "center",
    gap: 10,
  },
  centerText: {
    fontSize: 14,
    color: "#64748B",
  },
  errorBox: {
    padding: 16,
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
  card: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
    marginBottom: 10,
  },
  cardCompact: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: 8,
  },
  cardCompactBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cardSelected: {
    borderColor: "#2B6CB0",
    backgroundColor: "#EFF6FF",
  },
  cardImageWrap: {
    width: 84,
    height: 84,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#EEF2F6",
    position: "relative",
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  cardImagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardImagePlaceholderText: {
    fontSize: 10,
    color: "#94A3B8",
    fontWeight: "600",
  },
  checkBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  checkBadgeInline: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 2,
  },
  checkBadgeOn: {
    borderColor: "#2B6CB0",
    backgroundColor: "#2B6CB0",
  },
  checkBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "transparent",
  },
  checkBadgeTextOn: {
    color: "#FFFFFF",
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 2,
  },
  cardAddress: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E2A38",
  },
  cardPrice: {
    fontSize: 14,
    fontWeight: "800",
    color: "#2B6CB0",
  },
  cardMeta: {
    fontSize: 11,
    color: "#64748B",
  },
  cardTiming: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 2,
  },
  shortlistOverlay: {
    position: "absolute",
    bottom: 6,
    right: 6,
  },
  selectionBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#93C5FD",
    padding: 12,
    gap: 10,
    shadowColor: "#0F172A",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  selectionTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectionCount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E2A38",
  },
  clearText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  emailBtn: {
    backgroundColor: "#2B6CB0",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  emailBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    maxHeight: "85%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1E2A38",
  },
  modalClose: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748B",
  },
  modalBody: {
    padding: 16,
    gap: 10,
    paddingBottom: 28,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 4,
  },
  row2: {
    flexDirection: "row",
    gap: 8,
  },
  fieldInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D8DEE6",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1E2A38",
  },
  openHouseChip: {
    alignSelf: "flex-start",
    marginTop: 4,
  },
  applyBtn: {
    marginTop: 12,
    backgroundColor: "#0F766E",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  applyBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
