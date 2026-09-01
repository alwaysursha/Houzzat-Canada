/**
 * Stage 4.6 — Native Task & Reminders tab (web CustomerProfile + TaskForm parity).
 *
 * Visual authority: CustomerProfile tab="reminders" + TaskForm compact.
 * Data: GET/POST /api/mobile/v2/leads/[leadId]/tasks
 *        PATCH /api/mobile/v2/leads/[leadId]/tasks/[taskId]
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { mobileApiClient } from "../api/client";
import type {
  AgentTaskStatus,
  AgentTaskType,
  BackendEnvelope,
  LeadTasksResponseData,
  MobileLeadTask,
} from "../types/api";

const taskCache = new Map<string, { tasks: MobileLeadTask[]; timestamp: number }>();

export function clearLeadTasksCache(workspaceId?: string) {
  if (!workspaceId) {
    taskCache.clear();
    return;
  }
  for (const key of taskCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) {
      taskCache.delete(key);
    }
  }
}

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
  // Accept datetime-local "YYYY-MM-DDTHH:mm" or full ISO.
  const normalized =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed) ? `${trimmed}:00` : trimmed;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatDue(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-CA");
  } catch {
    return iso;
  }
}

function isOverdue(task: MobileLeadTask): boolean {
  return task.status === "OPEN" && new Date(task.dueAt).getTime() < Date.now();
}

type TasksRemindersTabProps = {
  leadId: string;
  workspaceId: string | undefined;
  /** Total task count for Lead Detail counts.tasks consistency. */
  onTaskCountChange?: (totalCount: number) => void;
};

export function TasksRemindersTab({
  leadId,
  workspaceId,
  onTaskCountChange,
}: TasksRemindersTabProps) {
  const cacheKey = workspaceId ? `${workspaceId}:${leadId}:tasks` : "";
  const cached = cacheKey ? taskCache.get(cacheKey) : undefined;

  const [tasks, setTasks] = useState<MobileLeadTask[]>(cached?.tasks ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const [taskType, setTaskType] = useState<AgentTaskType>("CALL");
  const [title, setTitle] = useState("");
  const [dueLocal, setDueLocal] = useState(defaultDueLocalValue);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  const publishCount = useCallback(
    (list: MobileLeadTask[]) => {
      onTaskCountChange?.(list.length);
    },
    [onTaskCountChange],
  );

  const persistCache = useCallback(
    (list: MobileLeadTask[]) => {
      if (!cacheKey) return;
      taskCache.set(cacheKey, { tasks: list, timestamp: Date.now() });
    },
    [cacheKey],
  );

  const fetchTasks = useCallback(
    async (quiet = false) => {
      if (!quiet && !cached) setLoading(true);
      setError(null);
      try {
        const res = await mobileApiClient.get<
          BackendEnvelope<LeadTasksResponseData> & {
            ok?: boolean;
            tasks?: MobileLeadTask[];
          }
        >(`/leads/${encodeURIComponent(leadId)}/tasks`);

        if (!res.ok) {
          setError(res.message || "Could not load tasks");
          return;
        }

        const payload = res.data as {
          tasks?: MobileLeadTask[];
          data?: { tasks?: MobileLeadTask[] };
        };
        const list = payload.tasks ?? payload.data?.tasks ?? [];
        setTasks(list);
        persistCache(list);
        publishCount(list);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Could not load tasks");
      } finally {
        setLoading(false);
      }
    },
    [cached, leadId, persistCache, publishCount],
  );

  useEffect(() => {
    if (cached?.tasks) {
      publishCount(cached.tasks);
    }
    void fetchTasks(Boolean(cached));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch on lead change
  }, [leadId, workspaceId]);

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed || createPending) return;
    const dueAt = localInputToIso(dueLocal);
    if (!dueAt) {
      setCreateError("Enter a valid due date (YYYY-MM-DDTHH:mm)");
      return;
    }
    setCreatePending(true);
    setCreateError(null);
    try {
      const res = await mobileApiClient.post<{
        ok: boolean;
        task?: MobileLeadTask;
        message?: string;
      }>(`/leads/${encodeURIComponent(leadId)}/tasks`, {
        type: taskType,
        title: trimmed,
        dueAt,
      });

      if (!res.ok) {
        setCreateError(res.message || "Could not create task");
        return;
      }

      const created = (res.data as { task?: MobileLeadTask })?.task;
      if (created) {
        setTasks((prev) => {
          const next = [created, ...prev.filter((t) => t.id !== created.id)].sort(
            (a, b) => {
              if (a.status !== b.status) {
                return a.status === "OPEN" ? -1 : 1;
              }
              return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
            },
          );
          persistCache(next);
          publishCount(next);
          return next;
        });
      } else {
        void fetchTasks(true);
      }
      setTitle("");
      setDueLocal(defaultDueLocalValue());
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Could not create task");
    } finally {
      setCreatePending(false);
    }
  };

  const handleSetStatus = async (task: MobileLeadTask, status: AgentTaskStatus) => {
    if (mutatingId) return;
    setMutatingId(task.id);
    const previous = tasks;
    // Optimistic
    setTasks((prev) => {
      const next = prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status,
              completedAt:
                status === "DONE"
                  ? new Date().toISOString()
                  : status === "OPEN"
                    ? null
                    : t.completedAt,
            }
          : t,
      );
      persistCache(next);
      publishCount(next);
      return next;
    });

    try {
      const res = await mobileApiClient.patch<{
        ok: boolean;
        task?: MobileLeadTask;
        message?: string;
      }>(
        `/leads/${encodeURIComponent(leadId)}/tasks/${encodeURIComponent(task.id)}`,
        { status },
      );

      if (!res.ok) {
        setTasks(previous);
        persistCache(previous);
        publishCount(previous);
        setError(res.message || "Could not update task");
        return;
      }

      const updated = (res.data as { task?: MobileLeadTask })?.task;
      if (updated) {
        setTasks((prev) => {
          const next = prev.map((t) => (t.id === updated.id ? updated : t));
          persistCache(next);
          publishCount(next);
          return next;
        });
      }
    } catch (err: unknown) {
      setTasks(previous);
      persistCache(previous);
      publishCount(previous);
      setError(err instanceof Error ? err.message : "Could not update task");
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Set reminder</Text>
        <View style={styles.formRow}>
          {(["CALL", "EMAIL", "TODO"] as const).map((t) => {
            const active = taskType === t;
            return (
              <TouchableOpacity
                key={t}
                style={[styles.typeChip, active && styles.typeChipActive]}
                onPress={() => setTaskType(t)}
                activeOpacity={0.8}
              >
                <Text style={active ? styles.typeChipTextActive : styles.typeChipText}>
                  {t === "TODO" ? "To-do" : t === "CALL" ? "Call" : "Email"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.formRow}>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Follow up…"
            placeholderTextColor="#94A3B8"
            editable={!createPending}
          />
        </View>
        <View style={styles.formRow}>
          <TextInput
            style={styles.dueInput}
            value={dueLocal}
            onChangeText={setDueLocal}
            placeholder="YYYY-MM-DDTHH:mm"
            placeholderTextColor="#94A3B8"
            editable={!createPending}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[styles.addBtn, (createPending || !title.trim()) && styles.addBtnDisabled]}
            disabled={createPending || !title.trim()}
            onPress={() => void handleCreate()}
            activeOpacity={0.85}
          >
            <Text style={styles.addBtnText}>{createPending ? "…" : "Add"}</Text>
          </TouchableOpacity>
        </View>
        {createError ? <Text style={styles.errorText}>{createError}</Text> : null}
      </View>

      {loading && tasks.length === 0 ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#1E2A38" />
          <Text style={styles.loadingText}>Loading reminders…</Text>
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

      {!loading && tasks.length === 0 && !error ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No reminders yet.</Text>
        </View>
      ) : null}

      {tasks.map((task) => {
        const overdue = isOverdue(task);
        const pending = mutatingId === task.id;
        return (
          <View key={task.id} style={styles.taskCard}>
            <View style={styles.taskHeader}>
              <Text style={styles.taskTitle} numberOfLines={2}>
                {task.title}
              </Text>
              <View style={styles.taskHeaderRight}>
                <View
                  style={[
                    styles.statusBadge,
                    task.status === "OPEN"
                      ? styles.statusOpen
                      : styles.statusDone,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      task.status === "OPEN"
                        ? styles.statusOpenText
                        : styles.statusDoneText,
                    ]}
                  >
                    {task.status}
                  </Text>
                </View>
                {task.status === "OPEN" ? (
                  <TouchableOpacity
                    disabled={pending}
                    onPress={() => void handleSetStatus(task, "DONE")}
                    activeOpacity={0.75}
                    style={styles.doneBtn}
                  >
                    <Text style={styles.doneBtnText}>
                      {pending ? "…" : "Done"}
                    </Text>
                  </TouchableOpacity>
                ) : task.status === "DONE" ? (
                  <TouchableOpacity
                    disabled={pending}
                    onPress={() => void handleSetStatus(task, "OPEN")}
                    activeOpacity={0.75}
                    style={styles.doneBtn}
                  >
                    <Text style={styles.reopenBtnText}>
                      {pending ? "…" : "Reopen"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            <Text style={[styles.taskMeta, overdue && styles.taskMetaOverdue]}>
              {task.type}
              {" · due "}
              {formatDue(task.dueAt)}
              {overdue ? " · Overdue" : ""}
            </Text>
            {task.body ? (
              <Text style={styles.taskBody} numberOfLines={3}>
                {task.body}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
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
    marginBottom: 10,
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
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
  typeChipTextActive: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1E2A38",
  },
  titleInput: {
    flex: 1,
    minWidth: 160,
    borderWidth: 1,
    borderColor: "#D8DEE6",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: "#1E2A38",
    backgroundColor: "#FFFFFF",
  },
  dueInput: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderColor: "#D8DEE6",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: "#1E2A38",
    backgroundColor: "#FFFFFF",
  },
  addBtn: {
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
  },
  retryText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: "#0F766E",
  },
  taskCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  taskHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  taskHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  taskTitle: {
    flex: 1,
    minWidth: 120,
    fontSize: 14,
    fontWeight: "600",
    color: "#1E2A38",
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusOpen: {
    backgroundColor: "#FEF3C7",
  },
  statusDone: {
    backgroundColor: "#F1F5F9",
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  statusOpenText: {
    color: "#78350F",
  },
  statusDoneText: {
    color: "#475569",
  },
  doneBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  doneBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F766E",
  },
  reopenBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
  },
  taskMeta: {
    marginTop: 6,
    fontSize: 12,
    color: "#64748B",
  },
  taskMetaOverdue: {
    color: "#B91C1C",
    fontWeight: "600",
  },
  taskBody: {
    marginTop: 6,
    fontSize: 12,
    color: "#334155",
  },
});
