/**
 * Stage 5.0 — Native Global Tasks (web Instant Shell Tasks tab + /agent/tasks).
 *
 * Visual authority: AgentMobileInstantShell tasks tab (cards + compact create)
 * + SSR Overdue / Upcoming grouping from /agent/tasks.
 *
 * Data: GET/POST /api/mobile/v2/tasks
 *        PATCH /api/mobile/v2/tasks/[taskId]
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import { unwrapCreatedTask, unwrapTasksList } from "../lib/task-response";
import {
  clearGlobalTasksCache,
  globalTaskCache,
  invalidateLeadTasksCacheForLead,
} from "../lib/lead-tab-cache";
import { useAuth } from "../state/AuthContext";
import type { AgentTaskType, MobileGlobalTask } from "../types/api";

export { clearGlobalTasksCache };

const TASK_TYPES: AgentTaskType[] = ["CALL", "EMAIL", "TODO"];

function defaultDueLocalValue(): string {
  const d = new Date();
  d.setHours(d.getHours() + 2);
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

function formatDue(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch {
    return iso;
  }
}

function leadLabel(task: MobileGlobalTask): string | null {
  if (!task.lead) return null;
  return (
    task.lead.customer.name?.trim() ||
    task.lead.customer.email?.trim() ||
    "Lead"
  );
}

type GlobalTasksScreenProps = {
  onOpenLead?: (leadId: string) => void;
};

export function GlobalTasksScreen({ onOpenLead }: GlobalTasksScreenProps) {
  const { activeWorkspace } = useAuth();
  const workspaceId = activeWorkspace?.id;
  const cacheKey = workspaceId ? `${workspaceId}:global-tasks` : "";
  const cached = cacheKey ? globalTaskCache.get(cacheKey) : undefined;

  const [tasks, setTasks] = useState<MobileGlobalTask[]>(
    (cached?.tasks as MobileGlobalTask[] | undefined) ?? [],
  );
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [taskType, setTaskType] = useState<AgentTaskType>("CALL");
  const [title, setTitle] = useState("");
  const [dueLocal, setDueLocal] = useState(defaultDueLocalValue);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  /** Invalidate in-flight list GETs so they cannot restore a just-completed task. */
  const fetchGenRef = useRef(0);
  /** Task ids dismissed locally until a later GET confirms they are gone. */
  const dismissedIdsRef = useRef<Set<string>>(new Set());

  const persistCache = useCallback(
    (list: MobileGlobalTask[]) => {
      if (!cacheKey) return;
      globalTaskCache.set(cacheKey, { tasks: list, timestamp: Date.now() });
    },
    [cacheKey],
  );

  const fetchTasks = useCallback(
    async (opts?: { background?: boolean }) => {
      const gen = ++fetchGenRef.current;
      if (!opts?.background) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const res = await mobileApiClient.get<unknown>("/tasks");
        if (gen !== fetchGenRef.current) return;
        if (!res.ok) {
          setError(res.message || "Could not load tasks");
          return;
        }
        const raw = unwrapTasksList(res.data) as MobileGlobalTask[];
        const dismissed = dismissedIdsRef.current;
        for (const id of [...dismissed]) {
          if (!raw.some((t) => t.id === id)) dismissed.delete(id);
        }
        const list = raw.filter((t) => !dismissed.has(t.id));
        setTasks(list);
        persistCache(list);
      } catch (err: unknown) {
        if (gen !== fetchGenRef.current) return;
        setError(err instanceof Error ? err.message : "Could not load tasks");
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
    dismissedIdsRef.current.clear();
    const entry = cacheKey ? globalTaskCache.get(cacheKey) : undefined;
    if (entry?.tasks) {
      setTasks(entry.tasks as MobileGlobalTask[]);
      setLoading(false);
    }
    void fetchTasks({ background: Boolean(entry) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tab mount / workspace change
  }, [workspaceId]);

  const { overdue, upcoming } = useMemo(() => {
    const now = Date.now();
    const open = tasks.filter((t) => t.status === "OPEN");
    return {
      overdue: open.filter((t) => new Date(t.dueAt).getTime() < now),
      upcoming: open.filter((t) => new Date(t.dueAt).getTime() >= now),
    };
  }, [tasks]);

  const openCount = overdue.length + upcoming.length;

  const handleCreate = async () => {
    if (createPending) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setCreateError("Title is required");
      return;
    }
    const dueAt = localInputToIso(dueLocal);
    if (!dueAt) {
      setCreateError("Invalid due date");
      return;
    }
    setCreatePending(true);
    setCreateError(null);
    try {
      const res = await mobileApiClient.post<unknown>("/tasks", {
        type: taskType,
        title: trimmed,
        dueAt,
      });
      if (!res.ok) {
        setCreateError(res.message || "Could not create task");
        return;
      }
      const created = unwrapCreatedTask(res.data) as MobileGlobalTask | null;
      if (created) {
        setTasks((prev) => {
          const next = [created, ...prev.filter((t) => t.id !== created.id)].sort(
            (a, b) =>
              new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
          );
          persistCache(next);
          return next;
        });
        invalidateLeadTasksCacheForLead(workspaceId, created.leadId);
      } else {
        void fetchTasks({ background: true });
      }
      setTitle("");
      setDueLocal(defaultDueLocalValue());
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Could not create task");
    } finally {
      setCreatePending(false);
    }
  };

  const handleComplete = async (task: MobileGlobalTask) => {
    if (mutatingId) return;
    setMutatingId(task.id);
    setError(null);
    // Drop any in-flight list response that still contains this OPEN task.
    fetchGenRef.current += 1;
    dismissedIdsRef.current.add(task.id);
    const previous = tasks;
    setTasks((prev) => {
      const next = prev.filter((t) => t.id !== task.id);
      persistCache(next);
      return next;
    });
    try {
      // Prefer Stage 4.6 lead-scoped PATCH when linked — same AgentTask row.
      const endpoint = task.leadId
        ? `/leads/${encodeURIComponent(task.leadId)}/tasks/${encodeURIComponent(task.id)}`
        : `/tasks/${encodeURIComponent(task.id)}`;
      const res = await mobileApiClient.patch<unknown>(endpoint, {
        status: "DONE",
      });
      if (!res.ok) {
        dismissedIdsRef.current.delete(task.id);
        setTasks(previous);
        persistCache(previous);
        setError(res.message || "Could not complete task");
        return;
      }
      invalidateLeadTasksCacheForLead(workspaceId, task.leadId);
    } catch (err: unknown) {
      dismissedIdsRef.current.delete(task.id);
      setTasks(previous);
      persistCache(previous);
      setError(err instanceof Error ? err.message : "Could not complete task");
    } finally {
      setMutatingId(null);
    }
  };

  const renderTaskCard = (task: MobileGlobalTask) => {
    const label = leadLabel(task);
    const overdueTask = new Date(task.dueAt).getTime() < Date.now();
    return (
      <View key={task.id} style={styles.card}>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>{task.title}</Text>
          {label && task.leadId ? (
            <TouchableOpacity
              onPress={() => onOpenLead?.(task.leadId!)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Open lead ${label}`}
            >
              <Text style={styles.cardLead} numberOfLines={1}>
                Lead: {label}
              </Text>
            </TouchableOpacity>
          ) : label ? (
            <Text style={styles.cardLeadMuted} numberOfLines={1}>
              Lead: {label}
            </Text>
          ) : null}
          <Text
            style={[
              styles.cardDue,
              overdueTask ? styles.cardDueOverdue : null,
            ]}
          >
            Due: {formatDue(task.dueAt)}
            {task.type ? ` · ${task.type}` : ""}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.doneBtn,
            mutatingId === task.id && styles.doneBtnDisabled,
          ]}
          onPress={() => void handleComplete(task)}
          disabled={mutatingId === task.id}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Mark task done"
        >
          <Text style={styles.doneBtnText}>
            {mutatingId === task.id ? "…" : "Done"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderGroup = (heading: string, items: MobileGlobalTask[]) => (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>
        {heading} · {items.length}
      </Text>
      {items.length === 0 ? (
        <View style={styles.emptyGroup}>
          <Text style={styles.emptyGroupText}>None</Text>
        </View>
      ) : (
        <View style={styles.cardList}>{items.map(renderTaskCard)}</View>
      )}
    </View>
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void fetchTasks({ background: true })}
          tintColor="#0F766E"
        />
      }
    >
      <View style={styles.headerRow}>
        <Text style={styles.screenTitle}>Tasks & Reminders</Text>
        <Text style={styles.openCount}>{openCount} open</Text>
      </View>

      <View style={styles.createBox}>
        <View style={styles.typeRow}>
          {TASK_TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.typeChip, taskType === t && styles.typeChipActive]}
              onPress={() => setTaskType(t)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.typeChipText,
                  taskType === t && styles.typeChipTextActive,
                ]}
              >
                {t === "TODO" ? "To-do" : t.charAt(0) + t.slice(1).toLowerCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Follow up…"
          placeholderTextColor="#94A3B8"
          editable={!createPending}
        />
        <TextInput
          style={styles.dueInput}
          value={dueLocal}
          onChangeText={setDueLocal}
          placeholder="YYYY-MM-DDTHH:mm"
          placeholderTextColor="#94A3B8"
          editable={!createPending}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.addBtn, createPending && styles.addBtnDisabled]}
          onPress={() => void handleCreate()}
          disabled={createPending}
          activeOpacity={0.85}
        >
          <Text style={styles.addBtnText}>{createPending ? "…" : "Add"}</Text>
        </TouchableOpacity>
        {createError ? (
          <Text style={styles.errorText}>{createError}</Text>
        ) : null}
      </View>

      {loading && tasks.length === 0 ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#0F766E" />
          <Text style={styles.loadingText}>Loading tasks…</Text>
        </View>
      ) : null}

      {error && tasks.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => void fetchTasks()} activeOpacity={0.8}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!loading && openCount === 0 && !error ? (
        <View style={styles.caughtUp}>
          <Text style={styles.caughtUpText}>
            All caught up! No tasks scheduled.
          </Text>
        </View>
      ) : null}

      {openCount > 0 ? (
        <>
          {renderGroup("Overdue", overdue)}
          {renderGroup("Upcoming", upcoming)}
        </>
      ) : null}

      {error && tasks.length > 0 ? (
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
    gap: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1E2A38",
  },
  openCount: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  createBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    gap: 8,
  },
  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  typeChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
  },
  typeChipActive: {
    borderColor: "#0F766E",
    backgroundColor: "#ECFDF5",
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  typeChipTextActive: {
    color: "#0F766E",
  },
  titleInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: "#1E2A38",
    backgroundColor: "#FFFFFF",
  },
  dueInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: "#1E2A38",
    backgroundColor: "#FFFFFF",
  },
  addBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#0F766E",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addBtnDisabled: {
    opacity: 0.5,
  },
  addBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  group: {
    gap: 8,
  },
  groupTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E2A38",
  },
  emptyGroup: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyGroupText: {
    fontSize: 13,
    color: "#94A3B8",
  },
  cardList: {
    gap: 8,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E2A38",
  },
  cardLead: {
    fontSize: 12,
    color: "#0F766E",
    fontWeight: "600",
  },
  cardLeadMuted: {
    fontSize: 12,
    color: "#64748B",
  },
  cardDue: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
    color: "#D97706",
  },
  cardDueOverdue: {
    color: "#DC2626",
  },
  doneBtn: {
    backgroundColor: "#0F766E",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  doneBtnDisabled: {
    opacity: 0.5,
  },
  doneBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  loadingBox: {
    paddingVertical: 28,
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: "#64748B",
  },
  emptyBox: {
    paddingVertical: 24,
    alignItems: "center",
    gap: 8,
  },
  caughtUp: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  caughtUpText: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
  },
  errorText: {
    fontSize: 13,
    color: "#DC2626",
    textAlign: "center",
  },
  retryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2B6CB0",
  },
});
