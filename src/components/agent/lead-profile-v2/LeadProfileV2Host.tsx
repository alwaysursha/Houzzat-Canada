"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CallOutcomeDialog } from "@/components/agent/CallOutcomeDialog";
import { newCallOutcomeRequestId } from "@/lib/agent/call-outcome-presentation";
import { LeadProfileV2ActivityPanel } from "@/components/agent/lead-profile-v2/LeadProfileV2ActivityPanel";
import { LeadProfileV2AppointmentsPanel } from "@/components/agent/lead-profile-v2/LeadProfileV2AppointmentsPanel";
import { LeadProfileV2ConversationsPanel } from "@/components/agent/lead-profile-v2/LeadProfileV2ConversationsPanel";
import { LeadProfileV2EngagementPanel } from "@/components/agent/lead-profile-v2/LeadProfileV2EngagementPanel";
import { LeadProfileV2ActionRail, LeadProfileV2Rail } from "@/components/agent/lead-profile-v2/LeadProfileV2Rail";
import { LeadProfileV2Chrome } from "@/components/agent/lead-profile-v2/LeadProfileV2Chrome";
import { LeadProfileV2InfoPanel } from "@/components/agent/lead-profile-v2/LeadProfileV2InfoPanel";
import { LeadProfileV2NoteComposer } from "@/components/agent/lead-profile-v2/LeadProfileV2NoteComposer";
import { LeadProfileV2RemindersPanel } from "@/components/agent/lead-profile-v2/LeadProfileV2RemindersPanel";
import {
  LeadProfileV2Tabs,
  type LeadProfileV2TabId,
} from "@/components/agent/lead-profile-v2/LeadProfileV2Tabs";
import { useLeadProfileV2Alerts } from "@/components/agent/lead-profile-v2/hooks/useLeadProfileV2Alerts";
import { useLeadProfileV2Appointments } from "@/components/agent/lead-profile-v2/hooks/useLeadProfileV2Appointments";
import { useLeadProfileV2Chat } from "@/components/agent/lead-profile-v2/hooks/useLeadProfileV2Chat";
import { useLeadProfileV2Emails } from "@/components/agent/lead-profile-v2/hooks/useLeadProfileV2Emails";
import { useLeadProfileV2EngagementOverview } from "@/components/agent/lead-profile-v2/hooks/useLeadProfileV2EngagementOverview";
import { useLeadProfileV2AreaMonitors } from "@/components/agent/lead-profile-v2/hooks/useLeadProfileV2AreaMonitors";
import { useLeadProfileV2ListingNotes } from "@/components/agent/lead-profile-v2/hooks/useLeadProfileV2ListingNotes";
import { useLeadProfileV2LookingFor } from "@/components/agent/lead-profile-v2/hooks/useLeadProfileV2LookingFor";
import { useLeadProfileV2NextReminder } from "@/components/agent/lead-profile-v2/hooks/useLeadProfileV2NextReminder";
import { useLeadProfileV2RoutePlanner } from "@/components/agent/lead-profile-v2/hooks/useLeadProfileV2RoutePlanner";
import { useLeadProfileV2PropertyWatches } from "@/components/agent/lead-profile-v2/hooks/useLeadProfileV2PropertyWatches";
import { useLeadProfileV2Rail } from "@/components/agent/lead-profile-v2/hooks/useLeadProfileV2Rail";
import { useLeadProfileV2SavedHomes } from "@/components/agent/lead-profile-v2/hooks/useLeadProfileV2SavedHomes";
import { useLeadProfileV2SavedSearches } from "@/components/agent/lead-profile-v2/hooks/useLeadProfileV2SavedSearches";
import { useLeadProfileV2Tasks } from "@/components/agent/lead-profile-v2/hooks/useLeadProfileV2Tasks";
import { useLeadProfileV2Timeline } from "@/components/agent/lead-profile-v2/hooks/useLeadProfileV2Timeline";
import {
  type V2ChatSurface,
  v2ChatIsOpen,
} from "@/lib/agent/lead-profile-v2/chat-query";
import { fetchV2Json } from "@/lib/agent/lead-profile-v2/fetch-json";
import { applyV2ContactMutationRefresh } from "@/lib/agent/lead-profile-v2/contact-refresh-query";
import { applyV2ConversationsEmailSentRefresh } from "@/lib/agent/lead-profile-v2/conversations-email-refresh-query";
import {
  applyV2IdentityLeadWriteRefresh,
  applyV2TaskAffectingLeadWriteRefresh,
} from "@/lib/agent/lead-profile-v2/lead-write-refresh-query";
import { selectV2LookingFor } from "@/lib/agent/lead-profile-v2/looking-for-query";
import { applyV2NoteCreateRefresh } from "@/lib/agent/lead-profile-v2/note-composer-query";
import {
  applyV2MatchboardUpdatedRefresh,
  applyV2SavedSearchEditorUpdatedRefresh,
} from "@/lib/agent/lead-profile-v2/saved-search-rail-refresh-query";
import {
  createLeadProfileV2Session,
  isV2AbortError,
} from "@/lib/agent/lead-profile-v2/request-gate";
import type { LeadProfileV2Shell } from "@/lib/agent/lead-profile-v2/types";
import type { PurchaseTimeframeValue } from "@/lib/agent/timeframe";
import { cn } from "@/lib/utils";

export function LeadProfileV2Host({
  leadId,
  variant = "modal",
  onClose,
  onNavigateLead,
  leadIds,
}: {
  leadId: string;
  variant?: "page" | "modal";
  onClose?: () => void;
  onNavigateLead?: (leadId: string) => void;
  leadIds?: string[];
}) {
  const [data, setData] = useState<LeadProfileV2Shell | null>(null);
  const [error, setError] = useState<{ leadId: string; message: string } | null>(
    null,
  );
  const [tab, setTab] = useState<LeadProfileV2TabId>("activity");
  const [conversationSurface, setConversationSurface] =
    useState<V2ChatSurface>("chat");
  const [conversationSurfaceLeadId, setConversationSurfaceLeadId] =
    useState(leadId);
  if (leadId !== conversationSurfaceLeadId) {
    setConversationSurfaceLeadId(leadId);
    setConversationSurface("chat");
  }
  const [refreshing, setRefreshing] = useState(false);
  const [callOutcomeLeadId, setCallOutcomeLeadId] = useState(leadId);
  const [callOutcomeRequestId, setCallOutcomeRequestId] = useState<string | null>(
    null,
  );
  const callReturnFocusRef = useRef<HTMLElement | null>(null);
  if (leadId !== callOutcomeLeadId) {
    setCallOutcomeLeadId(leadId);
    setCallOutcomeRequestId(null);
  }
  const beginCallOutcome = useCallback((target: HTMLElement) => {
    callReturnFocusRef.current = target;
    setCallOutcomeRequestId((current) => current ?? newCallOutcomeRequestId());
  }, []);
  const [editingContact, setEditingContact] = useState<
    "phone" | "email" | "address" | null
  >(null);
  const [contactDraft, setContactDraft] = useState("");
  const [contactPending, setContactPending] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [reminderPending, setReminderPending] = useState<
    "phone" | "email" | null
  >(null);
  const [profileFlagPending, setProfileFlagPending] = useState<
    "buyer" | "seller" | "timeframe" | null
  >(null);
  const session = useMemo(() => createLeadProfileV2Session(), []);
  const timeline = useLeadProfileV2Timeline(session, leadId);
  const reloadDefaultTimeline = timeline.reloadDefault;
  const rail = useLeadProfileV2Rail(
    session,
    leadId,
    data != null && data.lead.id === leadId,
  );
  const reloadRail = rail.reload;
  const lookingForResource = useLeadProfileV2LookingFor(
    session,
    leadId,
    data != null && data.lead.id === leadId,
  );
  const reloadLookingFor = lookingForResource.reload;
  const nextReminderResource = useLeadProfileV2NextReminder(
    session,
    leadId,
    data != null && data.lead.id === leadId,
  );
  const reloadNextReminder = nextReminderResource.reload;
  const tasks = useLeadProfileV2Tasks(session, leadId, tab === "reminders");
  const reloadTasks = tasks.reload;
  const invalidateTasks = tasks.invalidate;
  const appointments = useLeadProfileV2Appointments(
    session,
    leadId,
    tab === "appointments",
  );
  const reloadAppointments = appointments.reload;
  const invalidateAppointments = appointments.invalidate;
  const emails = useLeadProfileV2Emails(
    session,
    leadId,
    tab === "conversations",
  );
  const reloadEmails = emails.reload;
  const invalidateEmails = emails.invalidate;
  const chatOpen = v2ChatIsOpen({ tab, conversationSurface });
  const chat = useLeadProfileV2Chat(session, leadId, chatOpen);
  const reloadChat = chat.reload;
  const invalidateChat = chat.invalidate;
  const engagement = useLeadProfileV2EngagementOverview(
    session,
    leadId,
    tab === "engagement",
  );
  const reloadEngagementOverview = engagement.reload;
  const invalidateEngagementOverview = engagement.invalidate;
  const savedSearches = useLeadProfileV2SavedSearches(
    session,
    leadId,
    tab === "engagement",
  );
  const reloadSavedSearches = savedSearches.reload;
  const invalidateSavedSearches = savedSearches.invalidate;
  const savedHomes = useLeadProfileV2SavedHomes(
    session,
    leadId,
    tab === "engagement",
  );
  const reloadSavedHomes = savedHomes.reload;
  const invalidateSavedHomes = savedHomes.invalidate;
  const propertyWatches = useLeadProfileV2PropertyWatches(
    session,
    leadId,
    tab === "engagement",
  );
  const reloadPropertyWatches = propertyWatches.reload;
  const invalidatePropertyWatches = propertyWatches.invalidate;
  const areaMonitors = useLeadProfileV2AreaMonitors(
    session,
    leadId,
    tab === "engagement",
  );
  const reloadAreaMonitors = areaMonitors.reload;
  const invalidateAreaMonitors = areaMonitors.invalidate;
  const routePlanner = useLeadProfileV2RoutePlanner(
    session,
    leadId,
    tab === "engagement",
  );
  const reloadRoutePlanner = routePlanner.reload;
  const invalidateRoutePlanner = routePlanner.invalidate;
  const listingNotes = useLeadProfileV2ListingNotes(
    session,
    leadId,
    tab === "engagement",
  );
  const reloadListingNotes = listingNotes.reload;
  const invalidateListingNotes = listingNotes.invalidate;
  const alerts = useLeadProfileV2Alerts(
    session,
    leadId,
    tab === "engagement",
  );
  const reloadAlerts = alerts.reload;
  const invalidateAlerts = alerts.invalidate;
  const leadIdRef = useRef(leadId);

  useLayoutEffect(() => {
    leadIdRef.current = leadId;
    return () => {
      session.abortAll();
    };
  }, [leadId, session]);

  const applyShell = useCallback(
    async (targetLeadId: string, signal: AbortSignal) => {
      const json = await fetchV2Json<LeadProfileV2Shell>(
        `/api/agent/leads-v2/${targetLeadId}/shell`,
        "/api/agent/leads-v2/[id]/shell",
        signal,
      );
      if (signal.aborted || targetLeadId !== leadIdRef.current) return;
      setData(json);
      setError(null);
    },
    [],
  );

  const reload = useCallback(() => {
    session.request("shell", leadId, async (id, signal) => {
      try {
        await applyShell(id, signal);
      } catch (err) {
        if (isV2AbortError(err) || signal.aborted) return;
        if (id !== leadIdRef.current) return;
        setError({
          leadId: id,
          message: err instanceof Error ? err.message : "Failed to load",
        });
      }
    });
  }, [applyShell, leadId, session]);

  useEffect(() => {
    reload();
    return () => {
      session.abort("shell");
    };
  }, [leadId, reload, session]);

  const onUpdated = useCallback(() => {
    applyV2IdentityLeadWriteRefresh({
      reloadShell: reload,
      reloadTimeline: reloadDefaultTimeline,
      reloadRail,
    });
  }, [reload, reloadDefaultTimeline, reloadRail]);

  const onContactMutated = useCallback(() => {
    applyV2ContactMutationRefresh({
      reloadShell: reload,
      reloadTimeline: reloadDefaultTimeline,
    });
  }, [reload, reloadDefaultTimeline]);

  const onTaskAffectingLeadWrite = useCallback(() => {
    applyV2TaskAffectingLeadWriteRefresh({
      tab,
      reloadShell: reload,
      reloadTimeline: reloadDefaultTimeline,
      reloadRail,
      reloadNextReminder,
      reloadTasks,
      invalidateTasks,
    });
  }, [
    invalidateTasks,
    reload,
    reloadDefaultTimeline,
    reloadNextReminder,
    reloadRail,
    reloadTasks,
    tab,
  ]);

  const refreshProfile = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    session.request("shell", leadId, async (id, signal) => {
      try {
        await applyShell(id, signal);
      } catch (err) {
        if (isV2AbortError(err) || signal.aborted) return;
        if (id !== leadIdRef.current) return;
        setError({
          leadId: id,
          message: err instanceof Error ? err.message : "Failed to load",
        });
      } finally {
        if (id === leadIdRef.current) setRefreshing(false);
      }
    });
    reloadDefaultTimeline();
    reloadRail();
    reloadLookingFor();
    reloadNextReminder();
    if (tab === "reminders") reloadTasks();
    else invalidateTasks();
    if (tab === "appointments") reloadAppointments();
    else invalidateAppointments();
    if (tab === "conversations") {
      reloadEmails();
      if (conversationSurface === "chat") reloadChat();
      else invalidateChat();
    } else {
      invalidateEmails();
      invalidateChat();
    }
    if (tab === "engagement") {
      reloadEngagementOverview();
      reloadSavedSearches();
      reloadSavedHomes();
      reloadPropertyWatches();
      reloadAreaMonitors();
      reloadRoutePlanner();
      reloadListingNotes();
      reloadAlerts();
    } else {
      invalidateEngagementOverview();
      invalidateSavedSearches();
      invalidateSavedHomes();
      invalidatePropertyWatches();
      invalidateAreaMonitors();
      invalidateRoutePlanner();
      invalidateListingNotes();
      invalidateAlerts();
    }
  }, [
    applyShell,
    conversationSurface,
    invalidateAlerts,
    invalidateAppointments,
    invalidateAreaMonitors,
    invalidateChat,
    invalidateEmails,
    invalidateEngagementOverview,
    invalidateListingNotes,
    invalidatePropertyWatches,
    invalidateRoutePlanner,
    invalidateSavedHomes,
    invalidateSavedSearches,
    invalidateTasks,
    leadId,
    refreshing,
    reloadAppointments,
    reloadAreaMonitors,
    reloadAlerts,
    reloadChat,
    reloadDefaultTimeline,
    reloadEmails,
    reloadEngagementOverview,
    reloadListingNotes,
    reloadLookingFor,
    reloadNextReminder,
    reloadPropertyWatches,
    reloadRail,
    reloadRoutePlanner,
    reloadSavedHomes,
    reloadSavedSearches,
    reloadTasks,
    session,
    tab,
  ]);

  const onTaskCreated = useCallback(() => {
    reloadTasks();
    reloadNextReminder();
    reloadDefaultTimeline();
  }, [reloadDefaultTimeline, reloadNextReminder, reloadTasks]);

  const onNotePinned = useCallback(() => {
    reloadTasks();
    reloadDefaultTimeline();
  }, [reloadDefaultTimeline, reloadTasks]);

  const onNoteCreated = useCallback(() => {
    applyV2NoteCreateRefresh({
      tab,
      reloadTimeline: reloadDefaultTimeline,
      reloadTasks,
      invalidateTasks,
    });
  }, [invalidateTasks, reloadDefaultTimeline, reloadTasks, tab]);

  const onEmailSent = useCallback(() => {
    applyV2ConversationsEmailSentRefresh({
      tab,
      reloadEmails,
      reloadTimeline: reloadDefaultTimeline,
      reloadRail,
      reloadEngagementOverview,
      invalidateEngagementOverview,
    });
  }, [
    invalidateEngagementOverview,
    reloadDefaultTimeline,
    reloadEmails,
    reloadEngagementOverview,
    reloadRail,
    tab,
  ]);

  const onMatchboardUpdated = useCallback(() => {
    applyV2MatchboardUpdatedRefresh({
      reloadEngagementOverview,
      reloadSavedSearches,
      reloadLookingFor,
      reloadTimeline: reloadDefaultTimeline,
      invalidateEmails,
      reloadRail,
    });
  }, [
    invalidateEmails,
    reloadDefaultTimeline,
    reloadEngagementOverview,
    reloadLookingFor,
    reloadRail,
    reloadSavedSearches,
  ]);

  const onSavedSearchUpdated = useCallback(() => {
    applyV2SavedSearchEditorUpdatedRefresh({
      reloadSavedSearches,
      reloadEngagementOverview,
      reloadLookingFor,
      reloadTimeline: reloadDefaultTimeline,
    });
  }, [
    reloadDefaultTimeline,
    reloadEngagementOverview,
    reloadLookingFor,
    reloadSavedSearches,
  ]);

  function startEditContact(field: "phone" | "email" | "address") {
    const customer = data?.lead.customer;
    setEditingContact(field);
    setContactDraft(
      field === "phone"
        ? (customerPhone(customer) ?? "")
        : field === "email"
          ? (customer?.email ?? "")
          : (customer?.homeAddress ?? ""),
    );
    setContactError(null);
  }

  function cancelEditContact() {
    setEditingContact(null);
    setContactDraft("");
    setContactError(null);
  }

  async function saveContact() {
    if (!editingContact || !data?.lead.customer) return;
    setContactPending(true);
    setContactError(null);
    try {
      const trimmed = contactDraft.trim();
      const payload =
        editingContact === "phone"
          ? { leadId, phone: trimmed }
          : editingContact === "email"
            ? { leadId, email: trimmed }
            : { leadId, address: trimmed };
      const res = await fetch("/api/agent/leads/contact", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not update contact");
      onContactMutated();
      cancelEditContact();
    } catch (err) {
      setContactError(
        err instanceof Error ? err.message : "Could not update contact",
      );
    } finally {
      setContactPending(false);
    }
  }

  async function requestContactUpdate(channel: "phone" | "email") {
    if (!data?.lead.customer) return;
    setReminderPending(channel);
    setContactError(null);
    try {
      const res = await fetch("/api/agent/leads/contact-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, channel }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not request update");
      onContactMutated();
    } catch (err) {
      setContactError(
        err instanceof Error ? err.message : "Could not request update",
      );
    } finally {
      setReminderPending(null);
    }
  }

  async function toggleProfileFlag(flag: "buyer" | "seller") {
    if (!data?.lead.customer || profileFlagPending) return;
    const next =
      flag === "buyer"
        ? !data.lead.customer.isBuyer
        : !data.lead.customer.isSeller;
    setProfileFlagPending(flag);
    setData((prev) => {
      if (!prev?.lead.customer) return prev;
      return {
        ...prev,
        lead: {
          ...prev.lead,
          customer: {
            ...prev.lead.customer,
            isBuyer: flag === "buyer" ? next : prev.lead.customer.isBuyer,
            isSeller: flag === "seller" ? next : prev.lead.customer.isSeller,
          },
        },
      };
    });
    try {
      const res = await fetch("/api/agent/leads/profile-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          ...(flag === "buyer" ? { isBuyer: next } : { isSeller: next }),
        }),
      });
      if (!res.ok) {
        reload();
        return;
      }
      onUpdated();
    } catch {
      reload();
    } finally {
      setProfileFlagPending(null);
    }
  }

  async function setPurchaseTimeframe(next: PurchaseTimeframeValue | null) {
    if (!data?.lead.customer || profileFlagPending) return;
    setProfileFlagPending("timeframe");
    setData((prev) => {
      if (!prev?.lead.customer) return prev;
      return {
        ...prev,
        lead: {
          ...prev.lead,
          customer: {
            ...prev.lead.customer,
            purchaseTimeframe: next,
          },
        },
      };
    });
    try {
      const res = await fetch("/api/agent/leads/profile-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          purchaseTimeframe: next,
        }),
      });
      if (!res.ok) {
        reload();
        return;
      }
      onUpdated();
    } catch {
      reload();
    } finally {
      setProfileFlagPending(null);
    }
  }

  const name =
    data?.lead.customer?.name ||
    data?.lead.customer?.email ||
    data?.lead.source.replaceAll("_", " ") ||
    "Lead";
  const errorMessage =
    error && error.leadId === leadId ? error.message : null;
  const loading = errorMessage
    ? false
    : !data || data.lead.id !== leadId;

  const navIndex =
    leadIds && leadIds.length > 1 ? leadIds.indexOf(leadId) : -1;
  const prevLeadId = navIndex > 0 ? leadIds![navIndex - 1]! : null;
  const nextLeadId =
    navIndex >= 0 && navIndex < (leadIds?.length ?? 0) - 1
      ? leadIds![navIndex + 1]!
      : null;
  const showLeadNav =
    Boolean(onNavigateLead) && navIndex >= 0 && (leadIds?.length ?? 0) > 1;

  const shellClass =
    variant === "modal"
      ? "flex h-full max-h-none w-full max-w-[1280px] flex-col overflow-hidden rounded-none border-0 bg-white shadow-none sm:max-h-[min(960px,96vh)] sm:rounded-xl sm:border sm:border-[#c9d2dc] sm:shadow-[0_24px_70px_rgb(15_23_42/0.35)]"
      : "flex h-full min-h-0 w-full flex-col overflow-hidden bg-white";

  function renderTabBody() {
    if (!data) return null;
    switch (tab) {
      case "info":
        return (
          <LeadProfileV2InfoPanel
            data={data}
            rail={rail.panel}
            savedSearchLabel={
              lookingForResource.panel?.savedSearchLabel ?? null
            }
            profileFlagPending={profileFlagPending}
            onTimeframe={(next) => void setPurchaseTimeframe(next)}
          />
        );
      case "activity":
        return (
          <LeadProfileV2ActivityPanel
            rows={timeline.rows}
            hasMore={timeline.hasMore}
            scope={timeline.scope}
            busy={timeline.busy}
            filters={timeline.filters}
            emptyMessage={timeline.emptyMessage}
            onFiltersChange={timeline.onFiltersChange}
            onLoadMore={timeline.loadMore}
            onViewAll={timeline.viewAll}
          />
        );
      case "reminders":
        return (
          <LeadProfileV2RemindersPanel
            leadId={leadId}
            panel={tasks.panel}
            loading={tasks.loading}
            error={tasks.error}
            onTaskCreated={onTaskCreated}
            onNotePinned={onNotePinned}
          />
        );
      case "appointments":
        return (
          <LeadProfileV2AppointmentsPanel
            panel={appointments.panel}
            loading={appointments.loading}
            error={appointments.error}
          />
        );
      case "conversations":
        return (
          <LeadProfileV2ConversationsPanel
            leadId={leadId}
            defaultTo={data.lead.customer?.email ?? null}
            consented={data.permissions.consented}
            surface={conversationSurface}
            onSurfaceChange={setConversationSurface}
            panel={emails.panel}
            loading={emails.loading}
            error={emails.error}
            onEmailSent={onEmailSent}
            onLoadMore={emails.loadMore}
            chat={{
              panel: chat.panel,
              loading: chat.loading,
              error: chat.error,
              busy: chat.busy,
              sending: chat.sending,
              sendError: chat.sendError,
              onRetry: chat.reload,
              onLoadOlder: chat.loadOlder,
              onSend: chat.send,
            }}
          />
        );
      case "engagement":
        return (
          <LeadProfileV2EngagementPanel
            leadId={leadId}
            consented={data.permissions.consented}
            customerEmail={data.lead.customer?.email ?? null}
            panel={engagement.panel}
            loading={engagement.loading}
            error={engagement.error}
            savedSearches={savedSearches.panel}
            savedSearchesLoading={savedSearches.loading}
            savedSearchesError={savedSearches.error}
            savedHomes={savedHomes.panel}
            savedHomesLoading={savedHomes.loading}
            savedHomesError={savedHomes.error}
            propertyWatches={propertyWatches.panel}
            propertyWatchesLoading={propertyWatches.loading}
            propertyWatchesError={propertyWatches.error}
            areaMonitors={areaMonitors.panel}
            areaMonitorsLoading={areaMonitors.loading}
            areaMonitorsError={areaMonitors.error}
            routePlanner={routePlanner.panel}
            routePlannerLoading={routePlanner.loading}
            routePlannerError={routePlanner.error}
            listingNotes={listingNotes.panel}
            listingNotesLoading={listingNotes.loading}
            listingNotesError={listingNotes.error}
            alerts={alerts.panel}
            alertsLoading={alerts.loading}
            alertsError={alerts.error}
            onMatchboardUpdated={onMatchboardUpdated}
            onSavedSearchUpdated={onSavedSearchUpdated}
          />
        );
      default: {
        const _exhaustive: never = tab;
        return _exhaustive;
      }
    }
  }

  return (
    <div
      className={cn(
        "relative w-full",
        variant === "modal" && "flex h-full items-stretch",
        variant === "page" &&
          "h-[calc(100dvh-7.25rem-env(safe-area-inset-bottom))] lg:h-dvh",
      )}
    >
      {variant === "modal" && data ? (
        <LeadProfileV2ActionRail
          phone={data.lead.customer?.phone}
          phoneE164={data.lead.customer?.phoneE164}
          email={data.lead.customer?.email}
          onCall={beginCallOutcome}
        />
      ) : null}

      <div role="region" aria-label={name} className={shellClass}>
        {variant === "modal" ? (
          <LeadProfileV2Chrome
            name={name}
            loading={loading}
            refreshing={refreshing}
            onClose={onClose}
            onRefresh={() => void refreshProfile()}
            showLeadNav={showLeadNav}
            prevLeadId={prevLeadId}
            nextLeadId={nextLeadId}
            onNavigateLead={onNavigateLead}
          />
        ) : null}

        {errorMessage ? (
          <p className="m-6 rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-700">
            {errorMessage}
          </p>
        ) : loading || !data ? (
          <p className="py-16 text-center text-sm text-[#94a3b8]">
            Loading profile…
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[380px_minmax(0,1fr)]">
            <LeadProfileV2Rail
              leadId={leadId}
              data={data}
              rail={rail.panel}
              lookingFor={selectV2LookingFor({
                engagementBuyerIntent: engagement.panel?.buyerIntent ?? null,
                firstPaint: lookingForResource.panel,
              })}
              nextReminder={nextReminderResource.panel?.nextReminder ?? null}
              variant={variant}
              editingContact={editingContact}
              contactDraft={contactDraft}
              contactPending={contactPending}
              contactError={contactError}
              reminderPending={reminderPending}
              profileFlagPending={profileFlagPending}
              onEditContact={startEditContact}
              onChangeDraft={setContactDraft}
              onSaveContact={() => void saveContact()}
              onCancelEdit={cancelEditContact}
              onRequestUpdate={(channel) => void requestContactUpdate(channel)}
              onToggleBuyer={() => void toggleProfileFlag("buyer")}
              onToggleSeller={() => void toggleProfileFlag("seller")}
              onUpdated={onUpdated}
              onClaimUpdated={onTaskAffectingLeadWrite}
              onPipelineUpdated={onTaskAffectingLeadWrite}
              onReassignUpdated={onUpdated}
              onOpenEngagement={() => setTab("engagement")}
              onCall={beginCallOutcome}
            />
            <section className="flex min-w-0 flex-col bg-[#f7f9fb] lg:min-h-0 lg:overflow-hidden">
              <LeadProfileV2NoteComposer
                leadId={leadId}
                onCreated={onNoteCreated}
              />
              <LeadProfileV2Tabs tab={tab} onChange={setTab} />
              <div className="flex min-h-0 flex-col space-y-4 px-4 py-4 sm:px-5 lg:flex-1 lg:overflow-y-auto">
                {renderTabBody()}
              </div>
            </section>
          </div>
        )}
      </div>
      {callOutcomeRequestId && data?.lead.customer?.phone ? (
        <CallOutcomeDialog
          leadId={leadId}
          customerName={name}
          phoneLabel={data.lead.customer.phone}
          clientRequestId={callOutcomeRequestId}
          returnFocusRef={callReturnFocusRef}
          onClose={() => setCallOutcomeRequestId(null)}
          onSaved={() => {
            setCallOutcomeRequestId(null);
            onTaskAffectingLeadWrite();
          }}
        />
      ) : null}
    </div>
  );
}

function customerPhone(
  customer: LeadProfileV2Shell["lead"]["customer"] | undefined,
): string | null {
  return customer?.phone ?? null;
}
