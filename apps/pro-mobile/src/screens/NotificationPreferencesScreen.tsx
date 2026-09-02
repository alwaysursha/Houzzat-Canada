/**
 * Stage 5.10 — Native Notification Preferences (web /agent/notifications parity).
 *
 * Canonical store: User.pushNotificationPrefs (USER GLOBAL).
 * Does not modify CASL / consumer alerts / SMS staff prefs.
 * Does not rewrite Firebase — shows registered device count + OS permission.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import {
  notificationPrefsCache,
  notificationPrefsCacheKey,
} from "../lib/lead-tab-cache";
import {
  type MobileNotificationPreferences,
  type MobileStaffNotificationCategory,
  type StaffCategoryChannel,
  unwrapNotificationPreferences,
} from "../lib/notification-preferences-response";
import {
  getOsNotificationPermissionStatus,
  openAppNotificationSettings,
  type OsNotificationPermissionStatus,
} from "../lib/os-notification-permission";
import { useAuth } from "../state/AuthContext";

type Props = { onBack: () => void };

function ToggleRow({
  label,
  description,
  value,
  disabled,
  onChange,
  mutedHint,
}: {
  label: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  mutedHint?: string | null;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleMeta}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {description ? (
          <Text style={styles.toggleDesc}>{description}</Text>
        ) : null}
        {mutedHint ? <Text style={styles.toggleMuted}>{mutedHint}</Text> : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: "#CBD5E1", true: "#99F6E4" }}
        thumbColor={value ? "#0F766E" : "#F8FAFC"}
      />
    </View>
  );
}

export function NotificationPreferencesScreen({ onBack }: Props) {
  const { user } = useAuth();
  const userId = user?.id;
  const cacheKey = userId ? notificationPrefsCacheKey(userId) : "";
  const cached = cacheKey ? notificationPrefsCache.get(cacheKey) : undefined;

  const [prefs, setPrefs] = useState<MobileNotificationPreferences | null>(
    cached?.prefs ?? null,
  );
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [osPermission, setOsPermission] =
    useState<OsNotificationPermissionStatus>("unsupported");
  const requestGen = useRef(0);

  const refreshOsPermission = useCallback(async () => {
    const status = await getOsNotificationPermissionStatus();
    setOsPermission(status);
  }, []);

  const load = useCallback(
    async (opts?: { soft?: boolean; hasCached?: boolean }) => {
      const soft = opts?.soft === true;
      if (!soft) setLoading(true);
      setRefreshError(null);
      try {
        const res = await mobileApiClient.get<unknown>(
          `/notification-preferences`,
        );
        if (!res.ok) {
          const msg = res.message || "Couldn't load notification settings";
          if (opts?.hasCached) setRefreshError(msg);
          else setError(msg);
          return;
        }
        const next = unwrapNotificationPreferences(res.data);
        if (!next) {
          setError("Invalid preferences response");
          return;
        }
        setPrefs(next);
        setError(null);
        if (cacheKey) {
          notificationPrefsCache.set(cacheKey, {
            prefs: next,
            timestamp: Date.now(),
          });
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Network error loading notification settings";
        if (opts?.hasCached) setRefreshError(msg);
        else setError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [cacheKey],
  );

  useEffect(() => {
    const entry = cacheKey ? notificationPrefsCache.get(cacheKey) : undefined;
    if (entry) {
      setPrefs(entry.prefs);
      setLoading(false);
    }
    void load({ soft: Boolean(entry), hasCached: Boolean(entry) });
    void refreshOsPermission();
  }, [cacheKey, load, refreshOsPermission]);

  const applyToggle = useCallback(
    async (
      item: MobileStaffNotificationCategory,
      channel: StaffCategoryChannel,
      enabled: boolean,
    ) => {
      if (!prefs || pendingKey) return;
      const key = `${item.id}:${channel}`;
      const previous = prefs;
      const gen = ++requestGen.current;

      setPrefs({
        ...prefs,
        categories: prefs.categories.map((c) => {
          if (c.id !== item.id) return c;
          if (channel === "push") return { ...c, pushEnabled: enabled };
          return { ...c, emailEnabled: enabled };
        }),
      });
      setPendingKey(key);

      try {
        const res = await mobileApiClient.patch<unknown>(
          `/notification-preferences`,
          { category: item.id, channel, enabled },
        );
        if (gen !== requestGen.current) return;
        if (!res.ok) {
          setPrefs(previous);
          Alert.alert(
            "Couldn't update",
            res.message || "Please try again.",
          );
          return;
        }
        const next = unwrapNotificationPreferences(res.data);
        if (next) {
          setPrefs(next);
          if (cacheKey) {
            notificationPrefsCache.set(cacheKey, {
              prefs: next,
              timestamp: Date.now(),
            });
          }
        }
      } catch (err: unknown) {
        if (gen !== requestGen.current) return;
        setPrefs(previous);
        Alert.alert(
          "Couldn't update",
          err instanceof Error ? err.message : "Please try again.",
        );
      } finally {
        if (gen === requestGen.current) setPendingKey(null);
      }
    },
    [prefs, pendingKey, cacheKey],
  );

  const onToggle = useCallback(
    (
      item: MobileStaffNotificationCategory,
      channel: StaffCategoryChannel,
      enabled: boolean,
    ) => {
      if (pendingKey) return;
      if (!enabled && item.highStakes) {
        const ch = channel === "push" ? "push" : "email";
        const other =
          channel === "push"
            ? "Email notifications will remain unchanged."
            : "Push notifications will remain unchanged.";
        Alert.alert(
          `Turn off ${item.label} ${ch}?`,
          `${other}\n\nYou can turn this back on anytime.`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Turn off",
              style: "destructive",
              onPress: () => void applyToggle(item, channel, false),
            },
          ],
        );
        return;
      }
      void applyToggle(item, channel, enabled);
    },
    [applyToggle, pendingKey],
  );

  const deviceCount = prefs?.device.registeredDevices ?? 0;
  const pushPrefOn = prefs?.categories.some((c) => c.pushEnabled) ?? false;

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={onBack}
          activeOpacity={0.75}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          Notifications
        </Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load({ soft: true, hasCached: Boolean(prefs) });
              void refreshOsPermission();
            }}
            colors={["#0F6B4C"]}
            tintColor="#0F6B4C"
          />
        }
      >
        <Text style={styles.intro}>
          Choose how you want to be notified. Push and email are independent.
          These settings apply to your account across workspaces.
        </Text>

        {refreshError ? (
          <View style={styles.refreshBanner}>
            <Text style={styles.refreshBannerText}>
              Couldn't refresh notification settings.
            </Text>
            <TouchableOpacity
              onPress={() => void load({ soft: true, hasCached: true })}
            >
              <Text style={styles.refreshRetry}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {loading && !prefs ? (
          <View style={styles.center}>
            <ActivityIndicator color="#0F6B4C" />
            <Text style={styles.muted}>Loading preferences…</Text>
          </View>
        ) : error && !prefs ? (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : prefs ? (
          <>
            <View style={styles.statusCard}>
              <Text style={styles.statusTitle}>Device & permission</Text>
              <Text style={styles.statusLine}>
                Registered HouzzatPRO devices: {deviceCount}
              </Text>
              <Text style={styles.statusLine}>
                Android notification permission:{" "}
                {osPermission === "granted"
                  ? "Allowed"
                  : osPermission === "denied"
                    ? "Denied"
                    : osPermission === "never_asked"
                      ? "Not requested"
                      : "Unavailable"}
              </Text>
              {pushPrefOn && osPermission === "denied" ? (
                <Text style={styles.statusWarn}>
                  Push is enabled in HouzzatPRO, but notifications are disabled
                  for this app on your device.
                </Text>
              ) : null}
              {deviceCount === 0 ? (
                <Text style={styles.statusHint}>
                  Preferences still apply. Lock-screen push requires a
                  registered HouzzatPRO device.
                </Text>
              ) : null}
              {osPermission === "denied" ? (
                <TouchableOpacity
                  style={styles.settingsBtn}
                  onPress={() => void openAppNotificationSettings()}
                >
                  <Text style={styles.settingsBtnText}>
                    Open system notification settings
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <Text style={styles.sectionEyebrow}>Push</Text>
            <View style={styles.card}>
              {prefs.categories.map((item) => (
                <ToggleRow
                  key={`push-${item.id}`}
                  label={item.label}
                  description={item.description}
                  value={item.pushEnabled}
                  disabled={pendingKey === `${item.id}:push`}
                  onChange={(next) => onToggle(item, "push", next)}
                />
              ))}
            </View>

            <Text style={styles.sectionEyebrow}>Email</Text>
            <Text style={styles.emailTo}>
              Staff email: {prefs.staffEmail || "—"}
            </Text>
            <View style={styles.card}>
              {prefs.categories.map((item) => (
                <ToggleRow
                  key={`email-${item.id}`}
                  label={item.label}
                  description={item.description}
                  value={item.emailEnabled}
                  disabled={pendingKey === `${item.id}:email`}
                  onChange={(next) => onToggle(item, "email", next)}
                  mutedHint={
                    !item.emailActive
                      ? "Preference saved · email for this category is not active yet"
                      : null
                  }
                />
              ))}
            </View>

            <Text style={styles.footnote}>
              Communication consent (CASL) is not changed here. Customer email
              alerts are managed separately from staff desk notifications.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F4F7F5" },
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
  topSpacer: { width: 72 },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  intro: {
    fontSize: 14,
    lineHeight: 20,
    color: "#64748B",
  },
  refreshBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshBannerText: { flex: 1, fontSize: 12, color: "#92400E" },
  refreshRetry: { fontSize: 12, fontWeight: "700", color: "#0F6B4C" },
  center: { paddingVertical: 48, alignItems: "center", gap: 10 },
  muted: { fontSize: 13, color: "#64748B" },
  errorTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#B91C1C",
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: "#0F6B4C",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  statusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 6,
  },
  statusTitle: { fontSize: 14, fontWeight: "800", color: "#1E2A38" },
  statusLine: { fontSize: 13, color: "#475569", fontWeight: "600" },
  statusWarn: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: "#B45309",
    fontWeight: "600",
  },
  statusHint: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
  },
  settingsBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "#ECFDF5",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#99F6E4",
  },
  settingsBtnText: { fontSize: 12, fontWeight: "700", color: "#0F766E" },
  sectionEyebrow: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "800",
    color: "#1E2A38",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  emailTo: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  toggleMeta: { flex: 1, gap: 3 },
  toggleLabel: { fontSize: 14, fontWeight: "700", color: "#1E2A38" },
  toggleDesc: { fontSize: 12, lineHeight: 16, color: "#64748B" },
  toggleMuted: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "600",
    marginTop: 2,
  },
  footnote: {
    fontSize: 12,
    lineHeight: 17,
    color: "#94A3B8",
    textAlign: "center",
    paddingHorizontal: 8,
  },
});
