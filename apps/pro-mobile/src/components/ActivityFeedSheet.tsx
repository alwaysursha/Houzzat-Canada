/**
 * Native Activity feed + Dialer sheet (web ActivityFeedDrawer / globe icon).
 * Data: GET /api/mobile/v2/activity
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import { withQuery } from "../lib/query-string";

type DeskActivityCategory =
  | "all"
  | "notes"
  | "views_favorites"
  | "agent_actions"
  | "communications"
  | "property_alerts";

type DeskActivityItem = {
  id: string;
  category: Exclude<DeskActivityCategory, "all">;
  type: string;
  actorName: string | null;
  action: string;
  leadId: string;
  leadName: string;
  detail: string | null;
  createdAt: string;
};

type Tab = "activity" | "dialer";

const CATEGORIES: Array<{ id: DeskActivityCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "notes", label: "Notes" },
  { id: "views_favorites", label: "Views & Favorites" },
  { id: "agent_actions", label: "Agent Actions" },
  { id: "communications", label: "Communications" },
  { id: "property_alerts", label: "Property Alerts" },
];

function formatStamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDetail(detail: string | null): string | null {
  if (!detail?.trim()) return null;
  let text = detail.trim();
  text = text.replace(/https?:\/\/[^\s]+/gi, (url) => {
    try {
      const u = new URL(url);
      if (u.pathname.includes("/share/")) return "shared homes link";
      const path =
        u.pathname.length > 28 ? `${u.pathname.slice(0, 28)}…` : u.pathname;
      return u.host + path;
    } catch {
      return "link";
    }
  });
  text = text.replace(
    /\/(?:share\/homes\/)?eyJ[A-Za-z0-9_-]{20,}/g,
    "shared homes link",
  );
  text = text.replace(/[A-Za-z0-9_-]{48,}/g, (token) => `${token.slice(0, 12)}…`);
  if (text.length > 90) text = `${text.slice(0, 87)}…`;
  return text;
}

function toneForItem(item: DeskActivityItem): string {
  const t = item.type.toUpperCase();
  if (t === "CALL_NOTE" || t === "CALL") return "#0284c7";
  if (item.category === "notes" || t.includes("NOTE")) return "#64748b";
  if (t === "APPOINTMENT") return "#e11d48";
  if (t === "EMAIL_OPENED" || t === "PROPERTY_ALERT_OPENED") return "#059669";
  if (
    t === "EMAIL_CLICKED" ||
    t === "PROPERTY_ALERT_CLICKED" ||
    t === "PROPERTY_ALERT_VIEW"
  ) {
    return "#d97706";
  }
  if (
    t === "PROPERTY_ALERT_EMAIL" ||
    t === "DIGEST_EMAIL" ||
    t === "PROPERTY_ALERT"
  ) {
    return "#0891b2";
  }
  if (t.includes("EMAIL") || t === "SHORTLIST_EMAILED" || t === "AGENT_MESSAGE") {
    return "#2563eb";
  }
  if (t === "LISTING_VIEW" || t === "SEARCH" || t === "PAGE_VIEW") return "#475569";
  if (t.includes("SAVE") || t.includes("WATCH") || t.includes("FAVORITE")) {
    return "#e11d48";
  }
  if (item.category === "communications") return "#7c3aed";
  return "#0f766e";
}

function glyphForItem(item: DeskActivityItem): string {
  const t = item.type.toUpperCase();
  if (t === "CALL_NOTE" || t === "CALL") return "☎";
  if (item.category === "notes" || t.includes("NOTE")) return "✎";
  if (t === "APPOINTMENT") return "▦";
  if (t.includes("EMAIL") || t.includes("ALERT") || t === "DIGEST_EMAIL") return "✉";
  if (t.includes("SAVE") || t.includes("WATCH") || t.includes("FAVORITE")) return "♥";
  if (t === "LISTING_VIEW" || t === "SEARCH" || t === "PAGE_VIEW") return "◉";
  return "◈";
}

function unwrapActivityPayload(payload: unknown): {
  items: DeskActivityItem[];
  category: DeskActivityCategory;
  errorMessage?: string;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;

  // HTTP 200 with body-level failure (common mobile envelope).
  if (root.ok === false) {
    const message =
      typeof root.message === "string" && root.message.trim()
        ? root.message.trim()
        : "Failed to load activity";
    return { items: [], category: "all", errorMessage: message };
  }

  const nested =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : null;
  const data = nested ?? root;

  // Nested envelope: { ok:true, data:{ ok:true, data:{ items } } }
  const deep =
    data.data && typeof data.data === "object"
      ? (data.data as Record<string, unknown>)
      : null;
  const bag = deep && ("items" in deep || "activity" in deep) ? deep : data;

  const rawItems = bag.items ?? bag.activity;
  const items = Array.isArray(rawItems)
    ? (rawItems as DeskActivityItem[])
    : rawItems == null && (bag.ok === true || root.ok === true)
      ? []
      : null;
  if (!items) return null;

  const categoryRaw = bag.category ?? data.category ?? root.category;
  const category =
    typeof categoryRaw === "string" &&
    CATEGORIES.some((c) => c.id === categoryRaw)
      ? (categoryRaw as DeskActivityCategory)
      : "all";
  return { items, category };
}

type ActivityFeedSheetProps = {
  visible: boolean;
  onClose: () => void;
  onOpenLead: (leadId: string) => void;
  onCallNew: () => void;
};

export function ActivityFeedSheet({
  visible,
  onClose,
  onOpenLead,
  onCallNew,
}: ActivityFeedSheetProps) {
  const [tab, setTab] = useState<Tab>("activity");
  const [category, setCategory] = useState<DeskActivityCategory>("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const [items, setItems] = useState<DeskActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryLabel = useMemo(
    () => CATEGORIES.find((c) => c.id === category)?.label ?? "All",
    [category],
  );

  const load = useCallback(async (cat: DeskActivityCategory) => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = withQuery("/activity", { category: cat, take: 60 });
      const res = await mobileApiClient.get<unknown>(endpoint);
      if (!res.ok) {
        const msg =
          res.code === "NOT_FOUND"
            ? "Activity API is not deployed yet. Deploy the server, then retry."
            : res.message || "Failed to load activity";
        setError(msg);
        setItems([]);
        return;
      }
      const parsed = unwrapActivityPayload(res.data);
      if (!parsed) {
        setError("Invalid activity response");
        setItems([]);
        return;
      }
      if (parsed.errorMessage) {
        setError(parsed.errorMessage);
        setItems([]);
        return;
      }
      setItems(parsed.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    void load(category);
  }, [visible, category, load]);

  useEffect(() => {
    if (!visible) {
      setTab("activity");
      setMenuOpen(false);
    }
  }, [visible]);

  const renderItem = useCallback(
    ({ item }: { item: DeskActivityItem }) => {
      const actor = item.actorName?.trim() || null;
      const leadIsActor =
        !actor ||
        actor.toLowerCase() === item.leadName.trim().toLowerCase();
      const detail = formatDetail(item.detail);
      const tone = toneForItem(item);

      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => {
            onOpenLead(item.leadId);
            onClose();
          }}
        >
          <View style={[styles.glyph, { backgroundColor: tone }]}>
            <Text style={styles.glyphText}>{glyphForItem(item)}</Text>
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.summary}>
              {leadIsActor ? (
                <Text>
                  <Text style={styles.leadLink}>{item.leadName}</Text>
                  <Text>{` ${item.action}`}</Text>
                </Text>
              ) : (
                <Text>
                  <Text style={styles.actor}>{actor}</Text>
                  <Text>{` ${item.action} `}</Text>
                  <Text style={styles.leadLink}>{item.leadName}</Text>
                </Text>
              )}
              {detail ? <Text style={styles.detail}>{` ${detail}`}</Text> : null}
            </Text>
            <Text style={styles.stamp}>{formatStamp(item.createdAt)}</Text>
          </View>
        </TouchableOpacity>
      );
    },
    [onClose, onOpenLead],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.tabs}>
            <TouchableOpacity
              style={styles.tabBtn}
              onPress={() => setTab("activity")}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabLabel,
                  tab === "activity" && styles.tabLabelActive,
                ]}
              >
                Activity
              </Text>
              {tab === "activity" ? <View style={styles.tabUnderline} /> : null}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.tabBtn}
              onPress={() => setTab("dialer")}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.tabLabel,
                  tab === "dialer" && styles.tabLabelActive,
                ]}
              >
                Dialer
              </Text>
              {tab === "dialer" ? <View style={styles.tabUnderline} /> : null}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {tab === "activity" ? (
            <>
              <View style={styles.filterBar}>
                <TouchableOpacity
                  style={styles.filterBtn}
                  onPress={() => setMenuOpen((v) => !v)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.filterLabel}>{categoryLabel}</Text>
                  <Text style={styles.filterChevron}>
                    {menuOpen ? "▴" : "▾"}
                  </Text>
                </TouchableOpacity>
                {menuOpen ? (
                  <View style={styles.menu}>
                    {CATEGORIES.map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.menuItem,
                          category === cat.id && styles.menuItemActive,
                        ]}
                        onPress={() => {
                          setCategory(cat.id);
                          setMenuOpen(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.menuItemText,
                            category === cat.id && styles.menuItemTextActive,
                          ]}
                        >
                          {cat.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>

              {loading ? (
                <View style={styles.centered}>
                  <ActivityIndicator color="#0D9488" />
                  <Text style={styles.muted}>Loading activity…</Text>
                </View>
              ) : error ? (
                <View style={styles.centered}>
                  <Text style={styles.errorText}>{error}</Text>
                  <TouchableOpacity
                    style={styles.retryBtn}
                    onPress={() => void load(category)}
                  >
                    <Text style={styles.retryText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <FlatList
                  data={items}
                  keyExtractor={(item) => item.id}
                  renderItem={renderItem}
                  contentContainerStyle={
                    items.length === 0
                      ? styles.listEmpty
                      : styles.listContent
                  }
                  ListEmptyComponent={
                    <Text style={styles.muted}>
                      No activity in this category yet.
                    </Text>
                  }
                />
              )}
            </>
          ) : (
            <View style={styles.dialer}>
              <View style={styles.dialerIcon}>
                <Text style={styles.dialerIconText}>☎</Text>
              </View>
              <Text style={styles.dialerTitle}>Dialer</Text>
              <Text style={styles.dialerBody}>
                Power dialer is coming soon. Use Call new for now.
              </Text>
              <TouchableOpacity
                style={styles.callNewBtn}
                onPress={() => {
                  onCallNew();
                  onClose();
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.callNewBtnText}>CALL NEW LEADS</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(11, 18, 32, 0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    height: "88%",
    backgroundColor: "#F4F6F8",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
  },
  tabs: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#D8DEE6",
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    position: "relative",
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  tabLabelActive: {
    color: "#0D9488",
  },
  tabUnderline: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 0,
    height: 2,
    borderRadius: 999,
    backgroundColor: "#0D9488",
  },
  closeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  closeText: {
    fontSize: 16,
    color: "#64748B",
    fontWeight: "600",
  },
  filterBar: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#D8DEE6",
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 2,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#D8DEE6",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  filterChevron: {
    fontSize: 12,
    color: "#64748B",
  },
  menu: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#D8DEE6",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  menuItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  menuItemActive: {
    backgroundColor: "#ECFDF5",
  },
  menuItemText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#334155",
  },
  menuItemTextActive: {
    color: "#0D9488",
    fontWeight: "700",
  },
  listContent: {
    padding: 12,
    paddingBottom: 28,
    gap: 10,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    padding: 24,
  },
  muted: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
  },
  errorText: {
    fontSize: 14,
    color: "#B91C1C",
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#ECFDF5",
  },
  retryText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0D9488",
  },
  card: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  glyph: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  glyphText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  summary: {
    fontSize: 13,
    lineHeight: 18,
    color: "#334155",
  },
  actor: {
    fontWeight: "700",
    color: "#0F172A",
  },
  leadLink: {
    fontWeight: "700",
    color: "#0D9488",
  },
  detail: {
    color: "#0F766E",
  },
  stamp: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "500",
    color: "#94A3B8",
  },
  dialer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 10,
  },
  dialerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  dialerIconText: {
    fontSize: 20,
    color: "#0D9488",
  },
  dialerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  dialerBody: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 8,
  },
  callNewBtn: {
    backgroundColor: "#E11D48",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  callNewBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
});
