/**
 * Stage 5.5 — Native Shortlist (canonical SavedListing list).
 *
 * Reuses Stage 5.4 property cards, detail modal, and shortlist mutations.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { PropertyDetailModal } from "../components/PropertyDetailModal";
import {
  LISTING_IMAGE_LIMIT,
  PropertyListingCard,
} from "../components/PropertyListingCard";
import { mobileApiClient } from "../api/client";
import { usePropertySavedListings } from "../hooks/usePropertySavedListings";
import {
  clearShortlistListCache,
  shortlistListCache,
} from "../lib/lead-tab-cache";
import {
  buildShortlistListQuery,
  unwrapShortlistList,
} from "../lib/property-response";
import { useAuth } from "../state/AuthContext";
import type { MobileListingCard } from "../types/property";

type ShortlistScreenProps = {
  onBack: () => void;
  onBrowseProperties?: () => void;
  onPlanViewings?: (mlsNumbers: string[]) => void;
};

/** Exported for cross-screen cache invalidation after shortlist mutations. */
export function invalidateShortlistListForWorkspace(workspaceId: string | undefined) {
  clearShortlistListCache(workspaceId);
}

export function ShortlistScreen({
  onBack,
  onBrowseProperties,
  onPlanViewings,
}: ShortlistScreenProps) {
  const { activeWorkspace } = useAuth();
  const workspaceId = activeWorkspace?.id;
  const cacheKey = workspaceId ? `${workspaceId}:shortlist` : "";
  const cached = cacheKey ? shortlistListCache.get(cacheKey) : undefined;

  const [listings, setListings] = useState<MobileListingCard[]>(
    cached?.listings ?? [],
  );
  const [total, setTotal] = useState(cached?.total ?? 0);
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? false);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailListing, setDetailListing] = useState<MobileListingCard | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const fetchGenRef = useRef(0);

  const {
    isSaved,
    toggleSaved,
    pendingMls,
    setSavedLocal,
  } = usePropertySavedListings(workspaceId);

  const persistCache = useCallback(
    (
      items: MobileListingCard[],
      meta: { total: number; hasMore: boolean; offset: number },
    ) => {
      if (!cacheKey) return;
      shortlistListCache.set(cacheKey, {
        listings: items,
        total: meta.total,
        hasMore: meta.hasMore,
        offset: meta.offset,
        timestamp: Date.now(),
      });
    },
    [cacheKey],
  );

  const loadPage = useCallback(
    async (opts?: {
      background?: boolean;
      append?: boolean;
      offset?: number;
    }) => {
      const gen = ++fetchGenRef.current;
      const offset = opts?.offset ?? 0;
      const append = opts?.append ?? false;

      if (!opts?.background && !append) setLoading(true);
      else if (append) setLoadingMore(true);
      else setRefreshing(true);
      setError(null);

      try {
        const endpoint = buildShortlistListQuery({ limit: 60, offset });
        const res = await mobileApiClient.get<unknown>(endpoint);
        if (gen !== fetchGenRef.current) return;
        if (!res.ok) {
          setError(res.message || "Could not load shortlist");
          return;
        }
        const parsed = unwrapShortlistList(res.data);
        setListings((prev) => {
          const next = append ? [...prev, ...parsed.listings] : parsed.listings;
          persistCache(next, {
            total: parsed.total,
            hasMore: parsed.hasMore,
            offset: parsed.offset,
          });
          return next;
        });
        setTotal(parsed.total);
        setHasMore(parsed.hasMore);
      } catch (err: unknown) {
        if (gen !== fetchGenRef.current) return;
        setError(err instanceof Error ? err.message : "Could not load shortlist");
      } finally {
        if (gen === fetchGenRef.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [persistCache],
  );

  useEffect(() => {
    setSelected(new Set());
    setStatusMsg(null);
    setDetailOpen(false);
    setDetailListing(null);
    if (cached) {
      setListings(cached.listings);
      setTotal(cached.total);
      setHasMore(cached.hasMore);
      setLoading(false);
      void loadPage({ background: true });
    } else {
      void loadPage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- workspace switch
  }, [workspaceId]);

  const toggleMls = useCallback((mls: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(mls)) next.delete(mls);
      else next.add(mls);
      return next;
    });
  }, []);

  const handleToggleShortlist = useCallback(
    async (mls: string) => {
      const wasSaved = isSaved(mls);
      const ok = await toggleSaved(mls);
      if (!ok) {
        setStatusMsg("Could not update shortlist");
        return;
      }
      setStatusMsg(null);
      if (wasSaved) {
        setListings((prev) => {
          const next = prev.filter((l) => l.mlsNumber !== mls);
          persistCache(next, {
            total: Math.max(0, total - 1),
            hasMore,
            offset: 0,
          });
          return next;
        });
        setTotal((t) => Math.max(0, t - 1));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(mls);
          return next;
        });
        invalidateShortlistListForWorkspace(workspaceId);
      } else {
        invalidateShortlistListForWorkspace(workspaceId);
        void loadPage({ background: true });
      }
    },
    [toggleSaved, isSaved, persistCache, total, hasMore, workspaceId, loadPage],
  );

  const openDetail = useCallback((listing: MobileListingCard) => {
    setDetailListing(listing);
    setDetailOpen(true);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
  }, []);

  useEffect(() => {
    if (detailOpen) return;
    const timer = setTimeout(() => setDetailListing(null), 450);
    return () => clearTimeout(timer);
  }, [detailOpen]);

  const selectAll = useCallback(() => {
    setSelected(new Set(listings.map((l) => l.mlsNumber)));
  }, [listings]);

  const renderItem = useCallback(
    ({ item, index }: { item: MobileListingCard; index: number }) => (
      <PropertyListingCard
        listing={item}
        isSelected={selected.has(item.mlsNumber)}
        showImage={index < LISTING_IMAGE_LIMIT}
        isSaved={isSaved(item.mlsNumber)}
        shortlistPending={pendingMls === item.mlsNumber}
        onOpen={openDetail}
        onToggleSelect={toggleMls}
        onToggleShortlist={(mls) => void handleToggleShortlist(mls)}
      />
    ),
    [selected, openDetail, toggleMls, handleToggleShortlist, isSaved, pendingMls],
  );

  const listEmpty = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator color="#0F766E" size="large" />
          <Text style={styles.centerText}>Loading shortlist…</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => void loadPage()}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyTitle}>No shortlisted properties</Text>
        <Text style={styles.emptyText}>
          Properties you add to Shortlist from search or property detail will appear
          here.
        </Text>
        {onBrowseProperties ? (
          <TouchableOpacity
            style={styles.browseBtn}
            onPress={onBrowseProperties}
            activeOpacity={0.85}
          >
            <Text style={styles.browseBtnText}>Browse Properties</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }, [loading, error, loadPage, onBrowseProperties]);

  const listHeader = useMemo(() => {
    if (listings.length === 0) return null;
    return (
      <View style={styles.listHeader}>
        <Text style={styles.countText}>
          {total} saved home{total === 1 ? "" : "s"}
        </Text>
        {listings.length > 1 ? (
          <TouchableOpacity onPress={selectAll} activeOpacity={0.8}>
            <Text style={styles.selectAllText}>Select all</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }, [listings.length, total, selectAll]);

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.75}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          Shortlist
        </Text>
        <View style={styles.topSpacer} />
      </View>

      {statusMsg ? (
        <View style={styles.statusBanner}>
          <Text style={styles.statusText}>{statusMsg}</Text>
        </View>
      ) : null}

      <FlatList
        style={styles.list}
        data={listings}
        keyExtractor={(item) => item.mlsNumber}
        renderItem={renderItem}
        extraData={{ selected, pendingMls }}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={[
          styles.listContent,
          selected.size > 0 && styles.listContentWithBar,
          listings.length === 0 && styles.listContentEmpty,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadPage({ background: true })}
            tintColor="#0F766E"
          />
        }
        ListFooterComponent={
          hasMore ? (
            <TouchableOpacity
              style={styles.loadMoreBtn}
              onPress={() =>
                void loadPage({
                  append: true,
                  offset: listings.length,
                  background: true,
                })
              }
              disabled={loadingMore}
              activeOpacity={0.85}
            >
              {loadingMore ? (
                <ActivityIndicator color="#0F766E" />
              ) : (
                <Text style={styles.loadMoreText}>Load more</Text>
              )}
            </TouchableOpacity>
          ) : null
        }
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
              <Text style={styles.clearText}>Clear selection</Text>
            </TouchableOpacity>
          </View>
          {onPlanViewings ? (
            <TouchableOpacity
              style={styles.planBtn}
              onPress={() => onPlanViewings([...selected])}
              activeOpacity={0.85}
            >
              <Text style={styles.planBtnText}>Plan Viewings</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <PropertyDetailModal
        visible={detailOpen}
        preview={detailListing}
        workspaceId={workspaceId}
        saved={detailListing ? isSaved(detailListing.mlsNumber) : false}
        savedPending={
          detailListing != null && pendingMls === detailListing.mlsNumber
        }
        onClose={closeDetail}
        onToggleShortlist={(mls) => void handleToggleShortlist(mls)}
        onSavedChange={(mls, saved) => {
          setSavedLocal(mls, saved);
          if (!saved) {
            setListings((prev) => prev.filter((l) => l.mlsNumber !== mls));
            setSelected((prev) => {
              const next = new Set(prev);
              next.delete(mls);
              return next;
            });
          }
        }}
        onAddToViewing={
          onPlanViewings
            ? (mls) => {
                closeDetail();
                onPlanViewings([mls]);
              }
            : undefined
        }
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
  statusBanner: {
    backgroundColor: "#FFF1F2",
    borderBottomWidth: 1,
    borderBottomColor: "#FECDD3",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#BE123C",
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 12,
    paddingBottom: 24,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  listContentWithBar: {
    paddingBottom: 88,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  countText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2B6CB0",
  },
  centerBox: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 10,
  },
  centerText: {
    fontSize: 14,
    color: "#64748B",
  },
  errorBox: {
    margin: 16,
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
  emptyBox: {
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1E2A38",
  },
  emptyText: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
  },
  browseBtn: {
    marginTop: 12,
    backgroundColor: "#0F766E",
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  browseBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  loadMoreBtn: {
    marginTop: 8,
    marginBottom: 16,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2B6CB0",
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
    padding: 14,
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
    fontWeight: "700",
    color: "#2B6CB0",
  },
  planBtn: {
    backgroundColor: "#0F766E",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  planBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
