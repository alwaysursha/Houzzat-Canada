"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import {
  History,
  Monitor,
  RotateCcw,
  Save,
  Smartphone,
  Upload,
} from "lucide-react";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import {
  buildEmailTemplatePreviewHtml,
  type EmailTemplatePreviewBrand,
  type EmailTemplatePreviewMode,
} from "@/lib/email/workspace-templates/preview";
import { isWorkspaceEmailTemplateType } from "@/lib/email/workspace-templates/registry";
import type {
  EmailTemplateContentFields,
  WorkspaceEmailTemplateType,
} from "@/lib/email/workspace-templates/types";
import { cn } from "@/lib/utils";

export type EmailTemplateCatalogRow = {
  type: WorkspaceEmailTemplateType;
  label: string;
  description: string;
  editableFields: string[];
  allowedVariables: string[];
  protectedElements: string[];
  systemDefaults: {
    subject: string;
    introText: string;
    ctaText: string;
  };
  hasDraft: boolean;
  hasPublished: boolean;
  publishedVersionNumber: number | null;
  publishedAt: string | null;
  draftUpdatedAt: string | null;
  resolvedSource: "system" | "workspace_published";
};

type EditorForm = {
  subject: string;
  introText: string;
  bodyParagraphs: string;
  ctaText: string;
  primaryColor: string;
};

type VersionRow = {
  id: string;
  versionNumber: number;
  publishedAt: string;
  content: EmailTemplateContentFields;
};

function emptyForm(): EditorForm {
  return {
    subject: "",
    introText: "",
    bodyParagraphs: "",
    ctaText: "",
    primaryColor: "",
  };
}

function formFromContent(
  content: EmailTemplateContentFields | null | undefined,
  defaults: EmailTemplateCatalogRow["systemDefaults"],
): EditorForm {
  return {
    subject: content?.subject ?? defaults.subject ?? "",
    introText: content?.introText ?? defaults.introText ?? "",
    bodyParagraphs: (content?.bodySections.paragraphs ?? []).join("\n\n"),
    ctaText: content?.ctaText ?? defaults.ctaText ?? "",
    primaryColor: content?.style.primaryColor ?? "",
  };
}

function formToPayload(form: EditorForm): {
  subject: string | null;
  introText: string | null;
  bodySections: { paragraphs: string[] } | null;
  ctaText: string | null;
  style: { primaryColor: string | null } | null;
} {
  const paragraphs = form.bodyParagraphs
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    subject: form.subject.trim() || null,
    introText: form.introText.trim() || null,
    bodySections: paragraphs.length ? { paragraphs } : null,
    ctaText: form.ctaText.trim() || null,
    style: form.primaryColor.trim()
      ? { primaryColor: form.primaryColor.trim() }
      : null,
  };
}

function contentFromForm(form: EditorForm): EmailTemplateContentFields {
  const payload = formToPayload(form);
  return {
    subject: payload.subject,
    introText: payload.introText,
    bodySections: payload.bodySections ?? {},
    ctaText: payload.ctaText,
    style: payload.style?.primaryColor
      ? { primaryColor: payload.style.primaryColor }
      : {},
  };
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function serializeForm(form: EditorForm): string {
  return JSON.stringify(form);
}

function insertAtCursor(
  ref: RefObject<HTMLTextAreaElement | HTMLInputElement | null>,
  value: string,
  token: string,
  onChange: (next: string) => void,
) {
  const el = ref.current;
  if (!el) {
    onChange(`${value}${token}`);
    return;
  }
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
  onChange(next);
  requestAnimationFrame(() => {
    el.focus();
    const pos = start + token.length;
    el.setSelectionRange(pos, pos);
  });
}

export function EmailTemplatesAdminClient({
  initialTemplates,
  initialType,
  brand,
}: {
  initialTemplates: EmailTemplateCatalogRow[];
  initialType: string | null;
  brand: EmailTemplatePreviewBrand;
}) {
  const router = useRouter();
  const { confirm, toast } = useSiteAlert();
  const [templates, setTemplates] =
    useState<EmailTemplateCatalogRow[]>(initialTemplates);
  const [selectedType, setSelectedType] =
    useState<WorkspaceEmailTemplateType | null>(() => {
      if (initialType && isWorkspaceEmailTemplateType(initialType)) {
        return initialType;
      }
      return initialTemplates[0]?.type ?? null;
    });
  const [form, setForm] = useState<EditorForm>(emptyForm);
  const [baseline, setBaseline] = useState("");
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState<
    null | "save" | "publish" | "restore" | "history"
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewMode, setPreviewMode] =
    useState<EmailTemplatePreviewMode>("desktop");
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [activeField, setActiveField] = useState<
    "subject" | "introText" | "bodyParagraphs" | "ctaText"
  >("introText");

  const subjectRef = useRef<HTMLInputElement>(null);
  const introRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const ctaRef = useRef<HTMLInputElement>(null);
  const loadSeqRef = useRef(0);

  const selected = useMemo(
    () => templates.find((t) => t.type === selectedType) ?? null,
    [templates, selectedType],
  );

  const dirty = baseline !== "" && serializeForm(form) !== baseline;

  const previewHtml = useMemo(() => {
    if (!selectedType) return "";
    return buildEmailTemplatePreviewHtml({
      templateType: selectedType,
      content: contentFromForm(form),
      brand,
      mode: previewMode,
    });
  }, [selectedType, form, brand, previewMode]);

  const loadDetail = useCallback(async (type: WorkspaceEmailTemplateType) => {
    const seq = ++loadSeqRef.current;
    setLoadingDetail(true);
    setError(null);
    setVersions(null);
    try {
      const res = await fetch(
        `/api/admin/email-templates/${encodeURIComponent(type)}`,
        { credentials: "same-origin" },
      );
      if (seq !== loadSeqRef.current) return;
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        master?: { defaults: EmailTemplateCatalogRow["systemDefaults"] };
        record?: {
          draft: EmailTemplateContentFields;
          draftUpdatedAt?: string | null;
          published?: EmailTemplateContentFields | null;
          publishedVersionNumber?: number | null;
          publishedAt?: string | null;
        } | null;
      } | null;
      if (seq !== loadSeqRef.current) return;
      if (!res.ok) {
        setError(data?.error ?? "Could not load template");
        return;
      }
      const defaults = data?.master?.defaults ?? {
        subject: "",
        introText: "",
        ctaText: "",
      };
      // Edit draft when present; otherwise start from system defaults.
      const next = formFromContent(data?.record?.draft ?? null, defaults);
      setForm(next);
      setBaseline(serializeForm(next));
    } finally {
      if (seq === loadSeqRef.current) setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedType) return;
    void loadDetail(selectedType);
  }, [selectedType, loadDetail]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function selectTemplate(type: WorkspaceEmailTemplateType) {
    if (type === selectedType) return;
    if (dirty) {
      const ok = await confirm({
        title: "Unsaved changes",
        message:
          "You have unsaved draft edits. Leave this template without saving?",
        confirmLabel: "Discard changes",
        cancelLabel: "Stay",
        destructive: true,
      });
      if (!ok) return;
    }
    setSuccess(null);
    setError(null);
    setSelectedType(type);
    router.replace(`/admin/email-templates?type=${encodeURIComponent(type)}`, {
      scroll: false,
    });
  }

  async function refreshCatalog() {
    const res = await fetch("/api/admin/email-templates", {
      credentials: "same-origin",
    });
    const data = (await res.json().catch(() => null)) as {
      templates?: EmailTemplateCatalogRow[];
      error?: string;
    } | null;
    if (res.ok && data?.templates) {
      setTemplates(
        data.templates.map((item) => ({
          ...item,
          publishedAt:
            typeof item.publishedAt === "string"
              ? item.publishedAt
              : item.publishedAt
                ? new Date(item.publishedAt as unknown as string).toISOString()
                : null,
          draftUpdatedAt:
            typeof item.draftUpdatedAt === "string"
              ? item.draftUpdatedAt
              : item.draftUpdatedAt
                ? new Date(item.draftUpdatedAt as unknown as string).toISOString()
                : null,
        })),
      );
    }
  }

  async function saveDraft() {
    if (!selectedType) return;
    setBusy("save");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/admin/email-templates/${encodeURIComponent(selectedType)}`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formToPayload(form)),
        },
      );
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "Could not save draft");
        toast({ message: data?.error ?? "Could not save draft", tone: "error" });
        return;
      }
      setBaseline(serializeForm(form));
      setSuccess("Draft saved. Live emails are unchanged until you publish.");
      toast({ message: "Draft saved", tone: "success" });
      await refreshCatalog();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!selectedType) return;
    const ok = await confirm({
      title: "Publish template?",
      message:
        "Publishing creates a new version for this workspace. Live senders are not wired yet — drafts still never affect outgoing mail until a future cutover.",
      confirmLabel: "Publish",
      cancelLabel: "Cancel",
    });
    if (!ok) return;

    setBusy("publish");
    setError(null);
    setSuccess(null);
    try {
      if (dirty) {
        const saveRes = await fetch(
          `/api/admin/email-templates/${encodeURIComponent(selectedType)}`,
          {
            method: "PUT",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formToPayload(form)),
          },
        );
        const saveData = (await saveRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        if (!saveRes.ok) {
          setError(saveData?.error ?? "Could not save draft before publish");
          toast({
            message: saveData?.error ?? "Could not save draft before publish",
            tone: "error",
          });
          return;
        }
        setBaseline(serializeForm(form));
      }

      const res = await fetch(
        `/api/admin/email-templates/${encodeURIComponent(selectedType)}/publish`,
        { method: "POST", credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "Could not publish");
        toast({ message: data?.error ?? "Could not publish", tone: "error" });
        return;
      }
      setSuccess("Published version saved for this workspace.");
      toast({ message: "Template published", tone: "success" });
      await refreshCatalog();
      await loadDetail(selectedType);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function restoreDefault() {
    if (!selectedType) return;
    const ok = await confirm({
      title: "Restore system default?",
      message:
        "This clears the published override so resolution falls back to HouzzatPRO system defaults. Your draft is kept.",
      confirmLabel: "Restore default",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (!ok) return;

    setBusy("restore");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `/api/admin/email-templates/${encodeURIComponent(selectedType)}/restore`,
        { method: "POST", credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "Could not restore");
        toast({ message: data?.error ?? "Could not restore", tone: "error" });
        return;
      }
      setSuccess("Published override cleared. System default is active for resolution.");
      toast({ message: "System default restored", tone: "success" });
      await refreshCatalog();
      await loadDetail(selectedType);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function loadHistory() {
    if (!selectedType) return;
    setBusy("history");
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/email-templates/${encodeURIComponent(selectedType)}/versions`,
        { credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => null)) as {
        versions?: Array<{
          id: string;
          versionNumber: number;
          publishedAt: string | Date;
          content: EmailTemplateContentFields;
        }>;
        error?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "Could not load history");
        return;
      }
      setVersions(
        (data?.versions ?? []).map((v) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          publishedAt:
            typeof v.publishedAt === "string"
              ? v.publishedAt
              : new Date(v.publishedAt).toISOString(),
          content: v.content,
        })),
      );
    } finally {
      setBusy(null);
    }
  }

  function insertVariable(name: string) {
    const token = `{{${name}}}`;
    if (activeField === "subject") {
      insertAtCursor(subjectRef, form.subject, token, (next) =>
        setForm((f) => ({ ...f, subject: next })),
      );
      return;
    }
    if (activeField === "introText") {
      insertAtCursor(introRef, form.introText, token, (next) =>
        setForm((f) => ({ ...f, introText: next })),
      );
      return;
    }
    if (activeField === "bodyParagraphs") {
      insertAtCursor(bodyRef, form.bodyParagraphs, token, (next) =>
        setForm((f) => ({ ...f, bodyParagraphs: next })),
      );
      return;
    }
    insertAtCursor(ctaRef, form.ctaText, token, (next) =>
      setForm((f) => ({ ...f, ctaText: next })),
    );
  }

  function onColorChange(e: ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, primaryColor: e.target.value }));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
      <aside className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">
          Template library
        </p>
        <ul className="space-y-2">
          {templates.map((item) => {
            const active = item.type === selectedType;
            return (
              <li key={item.type}>
                <button
                  type="button"
                  onClick={() => void selectTemplate(item.type)}
                  className={cn(
                    "w-full rounded-2xl border px-3.5 py-3 text-left transition",
                    active
                      ? "border-[color:var(--tenant-primary,#0f766e)] bg-[color:color-mix(in_srgb,var(--tenant-primary,#0f766e)_10%,white)] shadow-sm"
                      : "border-line bg-white hover:border-ink/20",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">
                      {item.label}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        item.hasPublished
                          ? "bg-emerald-100 text-emerald-800"
                          : item.hasDraft
                            ? "bg-amber-100 text-amber-900"
                            : "bg-ink/5 text-ink/50",
                      )}
                    >
                      {item.hasPublished
                        ? `v${item.publishedVersionNumber ?? "?"}`
                        : item.hasDraft
                          ? "Draft"
                          : "System"}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-ink/55">
                    {item.description}
                  </p>
                  <p className="mt-2 text-[11px] text-ink/40">
                    {item.hasDraft
                      ? `Draft updated ${formatWhen(item.draftUpdatedAt)}`
                      : "Using system default"}
                    {item.hasPublished
                      ? ` · Published ${formatWhen(item.publishedAt)}`
                      : ""}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="min-w-0 space-y-4">
        {!selected ? (
          <p className="text-sm text-ink/55">Select a template to edit.</p>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-display text-2xl text-ink">
                  {selected.label}
                </h2>
                <p className="mt-1 text-sm text-ink/55">{selected.description}</p>
                {dirty ? (
                  <p className="mt-2 text-xs font-semibold text-amber-800">
                    Unsaved changes
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy !== null || loadingDetail}
                  onClick={() => void saveDraft()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold text-ink shadow-sm disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  Save draft
                </button>
                <button
                  type="button"
                  disabled={busy !== null || loadingDetail}
                  onClick={() => void publish()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[color:var(--tenant-primary,#0f766e)] px-3 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  Publish
                </button>
                <button
                  type="button"
                  disabled={busy !== null || loadingDetail}
                  onClick={() => void restoreDefault()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold text-ink shadow-sm disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Restore default
                </button>
                <button
                  type="button"
                  disabled={busy !== null || loadingDetail}
                  onClick={() => void loadHistory()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold text-ink shadow-sm disabled:opacity-50"
                >
                  <History className="h-4 w-4" />
                  History
                </button>
              </div>
            </div>

            {error ? (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
              >
                {error}
              </div>
            ) : null}
            {success ? (
              <div
                role="status"
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
              >
                {success}
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">
                  Editor
                </p>
                {loadingDetail ? (
                  <p className="text-sm text-ink/50">Loading template…</p>
                ) : (
                  <>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                        Subject
                      </span>
                      <input
                        ref={subjectRef}
                        value={form.subject}
                        onFocus={() => setActiveField("subject")}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, subject: e.target.value }))
                        }
                        maxLength={200}
                        className="w-full rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none focus:border-ink/30"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                        Introduction
                      </span>
                      <textarea
                        ref={introRef}
                        value={form.introText}
                        onFocus={() => setActiveField("introText")}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, introText: e.target.value }))
                        }
                        rows={3}
                        maxLength={2000}
                        className="w-full resize-y rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none focus:border-ink/30"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                        Body text
                      </span>
                      <textarea
                        ref={bodyRef}
                        value={form.bodyParagraphs}
                        onFocus={() => setActiveField("bodyParagraphs")}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            bodyParagraphs: e.target.value,
                          }))
                        }
                        rows={6}
                        placeholder="Separate paragraphs with a blank line"
                        className="w-full resize-y rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none focus:border-ink/30"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                        CTA label
                      </span>
                      <input
                        ref={ctaRef}
                        value={form.ctaText}
                        onFocus={() => setActiveField("ctaText")}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, ctaText: e.target.value }))
                        }
                        maxLength={80}
                        className="w-full rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none focus:border-ink/30"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                        Accent color
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={
                            /^#[0-9A-Fa-f]{6}$/.test(form.primaryColor)
                              ? form.primaryColor
                              : brand.primaryColor || "#0F766E"
                          }
                          onChange={onColorChange}
                          className="h-10 w-12 cursor-pointer rounded border border-line bg-white"
                          aria-label="Accent color picker"
                        />
                        <input
                          value={form.primaryColor}
                          onChange={onColorChange}
                          placeholder={brand.primaryColor || "#0F766E"}
                          className="w-full rounded-xl border border-line px-3 py-2 font-mono text-sm text-ink outline-none focus:border-ink/30"
                        />
                      </div>
                      <span className="text-[11px] text-ink/40">
                        Leave blank to use tenant brand primary.
                      </span>
                    </label>

                    <div className="space-y-2 border-t border-line pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">
                        Insert variable
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.allowedVariables.map((name) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => insertVariable(name)}
                            className="rounded-lg border border-line bg-ink/[0.03] px-2 py-1 font-mono text-[11px] text-ink/80 hover:bg-ink/[0.06]"
                          >
                            {`{{${name}}}`}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-ink/40">
                        Only approved variables are accepted. Arbitrary HTML is
                        blocked.
                      </p>
                    </div>
                  </>
                )}
              </section>

              <section className="space-y-3 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">
                    Branded preview
                  </p>
                  <div className="flex gap-1 rounded-xl border border-line p-0.5">
                    <button
                      type="button"
                      onClick={() => setPreviewMode("desktop")}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold",
                        previewMode === "desktop"
                          ? "bg-ink text-white"
                          : "text-ink/60",
                      )}
                    >
                      <Monitor className="h-3.5 w-3.5" />
                      Desktop
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode("mobile")}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold",
                        previewMode === "mobile"
                          ? "bg-ink text-white"
                          : "text-ink/60",
                      )}
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                      Mobile
                    </button>
                  </div>
                </div>
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-950">
                  Sample data only — not a real lead. Preview never loads CRM
                  records from this or any other workspace.
                </p>
                <div
                  className={cn(
                    "mx-auto overflow-hidden rounded-xl border border-line bg-[#ecfdf5]",
                    previewMode === "mobile" ? "max-w-[390px]" : "max-w-full",
                  )}
                >
                  <iframe
                    title="Email template preview"
                    sandbox=""
                    srcDoc={previewHtml}
                    className="h-[520px] w-full bg-white"
                  />
                </div>
              </section>
            </div>

            {versions ? (
              <section className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-xl text-ink">
                    Published version history
                  </h3>
                  <button
                    type="button"
                    onClick={() => setVersions(null)}
                    className="text-xs font-semibold text-ink/50 hover:text-ink"
                  >
                    Close
                  </button>
                </div>
                {versions.length === 0 ? (
                  <p className="mt-3 text-sm text-ink/55">
                    No published versions yet for this template.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-line">
                    {versions.map((v) => (
                      <li key={v.id} className="py-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold text-ink">
                            Version {v.versionNumber}
                          </span>
                          <span className="text-xs text-ink/45">
                            {formatWhen(v.publishedAt)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-ink/70">
                          {v.content.subject || "(no subject override)"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            <p className="text-[11px] text-ink/40">
              Protected system elements (unsubscribe, CASL, MLS facts, legal
              sender ID) cannot be overridden. Drafts never affect live
              outgoing emails.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
