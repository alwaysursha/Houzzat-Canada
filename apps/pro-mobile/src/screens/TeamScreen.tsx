/**
 * Stage 5.13 — Native Team (WorkspaceMember directory + management).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  clearTeamCache,
  teamCache,
  teamCacheKey,
  type MobileTeamCachePayload,
} from "../lib/lead-tab-cache";
import { useAuth } from "../state/AuthContext";

type Props = {
  /** When omitted (primary bottom-nav People tab), hide the back control. */
  onBack?: () => void;
  onOpenStatistics?: () => void;
};

type TeamMember = {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: "OWNER" | "ADMIN" | "AGENT";
  status: "ACTIVE" | "SUSPENDED" | "INVITED";
  isPrimaryAgent: boolean;
  canChangeRole: boolean;
  canSuspend: boolean;
  canReactivate: boolean;
  canRemove: boolean;
  canSetPrimaryAgent: boolean;
  allowedNextRoles: Array<"ADMIN" | "AGENT">;
};

type PendingInvite = {
  inviteId: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  expiresAt: string;
};

type TeamPayload = MobileTeamCachePayload & {
  members: TeamMember[];
  pendingInvites: PendingInvite[];
};

function initials(name: string | null, email: string): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

function unwrapTeam(payload: unknown): TeamPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as { data?: TeamPayload } & TeamPayload;
  const data = root.data ?? root;
  if (!data.members || !data.capabilities) return null;
  return data as TeamPayload;
}

export function TeamScreen({ onBack, onOpenStatistics }: Props) {
  const { activeWorkspace } = useAuth();
  const workspaceId = activeWorkspace?.id ?? "";
  const cacheKey = workspaceId ? teamCacheKey(workspaceId) : "";
  const cached = cacheKey ? teamCache.get(cacheKey)?.team : undefined;

  const [team, setTeam] = useState<TeamPayload | null>(
    (cached as TeamPayload | undefined) ?? null,
  );
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | "OWNER" | "ADMIN" | "AGENT">(
    "ALL",
  );
  const [selected, setSelected] = useState<TeamMember | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "AGENT">("AGENT");
  const [busy, setBusy] = useState(false);

  const applyTeam = useCallback(
    (next: TeamPayload) => {
      setTeam(next);
      if (cacheKey) {
        teamCache.set(cacheKey, { team: next, timestamp: Date.now() });
      }
    },
    [cacheKey],
  );

  const load = useCallback(
    async (soft?: boolean) => {
      if (!soft) setLoading(true);
      setError(null);
      try {
        const res = await mobileApiClient.get<unknown>("/team");
        if (!res.ok) {
          setError(res.message || "Couldn't load team");
          return;
        }
        const data = unwrapTeam(res.data);
        if (!data) {
          setError("Couldn't load team");
          return;
        }
        applyTeam(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [applyTeam],
  );

  useEffect(() => {
    void load(Boolean(cached));
  }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredMembers = useMemo(() => {
    if (!team) return [];
    const q = query.trim().toLowerCase();
    return team.members.filter((m) => {
      if (roleFilter !== "ALL" && m.role !== roleFilter) return false;
      if (!q) return true;
      return (
        (m.name || "").toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q)
      );
    });
  }, [team, query, roleFilter]);

  const transferCandidates = useMemo(() => {
    if (!team || !selected) return [];
    return team.members.filter(
      (m) =>
        m.status === "ACTIVE" &&
        m.userId !== selected.userId &&
        m.membershipId !== selected.membershipId,
    );
  }, [team, selected]);

  const invalidateAndReload = async () => {
    if (workspaceId) clearTeamCache(workspaceId);
    await load(true);
  };

  const runInvite = async () => {
    if (!team?.capabilities.canInvite) return;
    const roles = team.capabilities.allowedInviteRoles;
    const role = roles.includes(inviteRole) ? inviteRole : roles[0];
    if (!role) return;
    setBusy(true);
    try {
      const res = await mobileApiClient.post("/team/invite", {
        email: inviteEmail.trim(),
        role,
      });
      if (!res.ok) {
        Alert.alert("Invite failed", res.message || "Try again");
        return;
      }
      setInviteOpen(false);
      setInviteEmail("");
      Alert.alert("Invitation sent", "They’ll receive an email to join.");
      await invalidateAndReload();
    } finally {
      setBusy(false);
    }
  };

  const patchMember = async (
    membershipId: string,
    body: Record<string, unknown>,
    okTitle: string,
  ) => {
    setBusy(true);
    try {
      const res = await mobileApiClient.patch(`/team/${membershipId}`, body);
      if (!res.ok) {
        Alert.alert("Couldn't update", res.message || "Try again");
        return false;
      }
      const data = unwrapTeam(
        (res.data as { data?: TeamPayload })?.data ?? res.data,
      );
      if (data) applyTeam(data);
      else await invalidateAndReload();
      Alert.alert(okTitle);
      setSelected(null);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const removeMember = (target: TeamMember, transferToUserId: string) => {
    Alert.alert(
      "Remove member?",
      "This permanently removes their workspace membership. Leads, tasks, and appointments will transfer to the selected teammate. CMA and viewing history stay with the original author.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                const res = await mobileApiClient.post(
                  `/team/${target.membershipId}/remove`,
                  { transferToUserId },
                );
                if (!res.ok) {
                  Alert.alert("Couldn't remove", res.message || "Try again");
                  return;
                }
                Alert.alert("Member removed");
                setSelected(null);
                await invalidateAndReload();
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  if (inviteOpen && team) {
    const roles = team.capabilities.allowedInviteRoles;
    return (
      <View style={styles.root}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => setInviteOpen(false)}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle}>Invite Member</Text>
          <View style={styles.topSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            value={inviteEmail}
            onChangeText={setInviteEmail}
            placeholder="colleague@brokerage.com"
            placeholderTextColor="#94A3B8"
          />
          <Text style={styles.label}>Role</Text>
          <View style={styles.row}>
            {roles.map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.chip, inviteRole === r && styles.chipOn]}
                onPress={() => setInviteRole(r)}
              >
                <Text
                  style={[styles.chipText, inviteRole === r && styles.chipTextOn]}
                >
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={styles.primaryBtn}
            disabled={busy || !inviteEmail.trim()}
            onPress={() => void runInvite()}
          >
            <Text style={styles.primaryBtnText}>
              {busy ? "Sending…" : "Send Invitation"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (selected) {
    return (
      <View style={styles.root}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => setSelected(null)}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle}>Member</Text>
          <View style={styles.topSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.avatarLg}>
            <Text style={styles.avatarLgText}>
              {initials(selected.name, selected.email)}
            </Text>
          </View>
          <Text style={styles.detailName}>{selected.name || selected.email}</Text>
          <Text style={styles.meta}>
            {selected.role}
            {selected.isPrimaryAgent ? " · Primary Agent" : ""}
          </Text>
          <Text style={styles.meta}>{selected.email}</Text>
          {selected.phone ? <Text style={styles.meta}>{selected.phone}</Text> : null}
          <Text style={styles.meta}>Status: {selected.status}</Text>

          <Text style={styles.section}>Management</Text>
          {selected.canChangeRole
            ? selected.allowedNextRoles.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={styles.secondaryBtn}
                  disabled={busy}
                  onPress={() =>
                    Alert.alert(
                      "Change role?",
                      `Set ${selected.name || selected.email} to ${r}?`,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Confirm",
                          onPress: () =>
                            void patchMember(
                              selected.membershipId,
                              { action: "change_role", role: r },
                              "Role updated",
                            ),
                        },
                      ],
                    )
                  }
                >
                  <Text style={styles.secondaryBtnText}>Change role → {r}</Text>
                </TouchableOpacity>
              ))
            : null}
          {selected.canSuspend ? (
            <TouchableOpacity
              style={styles.secondaryBtn}
              disabled={busy}
              onPress={() =>
                Alert.alert(
                  "Suspend member?",
                  "Access will be suspended. Assigned leads, tasks, and appointments stay assigned. You can reactivate later.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Suspend",
                      style: "destructive",
                      onPress: () =>
                        void patchMember(
                          selected.membershipId,
                          { action: "suspend" },
                          "Member suspended",
                        ),
                    },
                  ],
                )
              }
            >
              <Text style={styles.secondaryBtnText}>Suspend</Text>
            </TouchableOpacity>
          ) : null}
          {selected.canReactivate ? (
            <TouchableOpacity
              style={styles.secondaryBtn}
              disabled={busy}
              onPress={() =>
                void patchMember(
                  selected.membershipId,
                  { action: "reactivate" },
                  "Member reactivated",
                )
              }
            >
              <Text style={styles.secondaryBtnText}>Reactivate</Text>
            </TouchableOpacity>
          ) : null}
          {selected.canSetPrimaryAgent ? (
            <TouchableOpacity
              style={styles.secondaryBtn}
              disabled={busy}
              onPress={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    const res = await mobileApiClient.post("/team/primary-agent", {
                      userId: selected.userId,
                    });
                    if (!res.ok) {
                      Alert.alert("Couldn't update", res.message || "");
                      return;
                    }
                    Alert.alert("Primary agent updated");
                    setSelected(null);
                    await invalidateAndReload();
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              <Text style={styles.secondaryBtnText}>Set as Primary Agent</Text>
            </TouchableOpacity>
          ) : null}
          {selected.canRemove ? (
            <>
              <Text style={styles.label}>Transfer CRM to (required)</Text>
              {transferCandidates.length === 0 ? (
                <Text style={styles.warn}>
                  No ACTIVE teammate available for transfer.
                </Text>
              ) : (
                transferCandidates.map((t) => (
                  <TouchableOpacity
                    key={t.membershipId}
                    style={styles.secondaryBtn}
                    disabled={busy}
                    onPress={() => removeMember(selected, t.userId)}
                  >
                    <Text style={styles.secondaryBtnText}>
                      Remove → transfer to {t.name || t.email}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        {onBack ? (
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.topSpacer} />
        )}
        <Text style={styles.topTitle}>{onBack ? "Team" : "People"}</Text>
        <View style={styles.topSpacer} />
      </View>

      {loading && !team ? (
        <View style={styles.center}>
          <ActivityIndicator color="#0F6B4C" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(true);
              }}
              colors={["#0F6B4C"]}
            />
          }
        >
          <Text style={styles.headerCount}>
            {team?.memberCount ?? 0} members
            {team?.workspace.name ? ` · ${team.workspace.name}` : ""}
          </Text>

          {team?.capabilities.canInvite ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                const roles = team.capabilities.allowedInviteRoles;
                setInviteRole(roles.includes("AGENT") ? "AGENT" : roles[0]!);
                setInviteOpen(true);
              }}
            >
              <Text style={styles.primaryBtnText}>+ Invite Member</Text>
            </TouchableOpacity>
          ) : null}

          {team?.capabilities.canOpenStatistics && onOpenStatistics ? (
            <TouchableOpacity style={styles.secondaryBtn} onPress={onOpenStatistics}>
              <Text style={styles.secondaryBtnText}>Open Statistics</Text>
            </TouchableOpacity>
          ) : null}

          <TextInput
            style={styles.input}
            placeholder="Search name or email"
            value={query}
            onChangeText={setQuery}
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
          />

          <View style={styles.row}>
            {(["ALL", "OWNER", "ADMIN", "AGENT"] as const).map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.chip, roleFilter === r && styles.chipOn]}
                onPress={() => setRoleFilter(r)}
              >
                <Text
                  style={[styles.chipText, roleFilter === r && styles.chipTextOn]}
                >
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {error ? <Text style={styles.warn}>{error}</Text> : null}

          <Text style={styles.section}>Members</Text>
          {filteredMembers.map((m) => (
            <TouchableOpacity
              key={m.membershipId}
              style={styles.card}
              onPress={() => setSelected(m)}
            >
              <View style={styles.cardRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {initials(m.name, m.email)}
                  </Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{m.name || m.email}</Text>
                  <Text style={styles.meta}>
                    {m.role}
                    {m.isPrimaryAgent ? " · Primary" : ""}
                    {m.status !== "ACTIVE" ? ` · ${m.status}` : ""}
                  </Text>
                  <Text style={styles.meta}>{m.email}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}

          {team?.capabilities.canManageMembers &&
          team.pendingInvites.length > 0 ? (
            <>
              <Text style={styles.section}>Pending invites</Text>
              {team.pendingInvites.map((inv) => (
                <View key={inv.inviteId} style={styles.card}>
                  <Text style={styles.cardTitle}>{inv.email}</Text>
                  <Text style={styles.meta}>
                    {inv.role} · expires{" "}
                    {new Date(inv.expiresAt).toLocaleDateString("en-CA")}
                  </Text>
                  <View style={styles.row}>
                    <TouchableOpacity
                      disabled={busy}
                      onPress={() => {
                        void (async () => {
                          setBusy(true);
                          try {
                            const res = await mobileApiClient.post(
                              `/team/invites/${inv.inviteId}/resend`,
                              {},
                            );
                            if (!res.ok) {
                              Alert.alert("Resend failed", res.message || "");
                              return;
                            }
                            Alert.alert("Invite resent");
                            await invalidateAndReload();
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                    >
                      <Text style={styles.link}>Resend</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={busy}
                      onPress={() => {
                        Alert.alert("Cancel invite?", inv.email, [
                          { text: "Keep", style: "cancel" },
                          {
                            text: "Cancel invite",
                            style: "destructive",
                            onPress: () => {
                              void (async () => {
                                setBusy(true);
                                try {
                                  const res = await mobileApiClient.post(
                                    `/team/invites/${inv.inviteId}/cancel`,
                                    {},
                                  );
                                  if (!res.ok) {
                                    Alert.alert(
                                      "Couldn't cancel",
                                      res.message || "",
                                    );
                                    return;
                                  }
                                  await invalidateAndReload();
                                } finally {
                                  setBusy(false);
                                }
                              })();
                            },
                          },
                        ]);
                      }}
                    >
                      <Text style={styles.linkDanger}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFF",
  },
  backText: { color: "#0F6B4C", fontSize: 16, fontWeight: "600", width: 72 },
  topTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  topSpacer: { width: 72 },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerCount: { fontSize: 14, color: "#64748B", marginBottom: 12 },
  section: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  label: { marginTop: 12, marginBottom: 6, fontSize: 13, color: "#475569" },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFF",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0F172A",
    marginBottom: 10,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: "#0F6B4C" },
  chipText: { fontSize: 12, fontWeight: "600", color: "#334155" },
  chipTextOn: { color: "#FFF" },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: "650", color: "#0F172A" },
  meta: { fontSize: 13, color: "#64748B", marginTop: 2 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontWeight: "700", color: "#0F766E" },
  avatarLg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 12,
  },
  avatarLgText: { fontSize: 22, fontWeight: "700", color: "#0F766E" },
  detailName: {
    textAlign: "center",
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
  },
  primaryBtn: {
    backgroundColor: "#0F6B4C",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFF",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 8,
  },
  secondaryBtnText: { color: "#0F172A", fontWeight: "600", fontSize: 14 },
  link: { color: "#0F6B4C", fontWeight: "600", marginRight: 16, marginTop: 8 },
  linkDanger: { color: "#B91C1C", fontWeight: "600", marginTop: 8 },
  warn: { color: "#B45309", marginBottom: 8 },
});
