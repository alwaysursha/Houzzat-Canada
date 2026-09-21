"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandAssetsSection } from "@/components/onboarding/BrandAssetsSection";
import {
  OnboardingDraftFlushProvider,
  OnboardingDraftStatus,
  useOnboardingDraftAutosave,
  useOnboardingDraftFlush,
} from "@/components/onboarding/onboarding-draft-flush";
import {
  ProfessionalIdentitySection,
  type ProfessionalIdentityFields,
} from "@/components/onboarding/ProfessionalIdentitySection";
import { TeamRosterSection } from "@/components/onboarding/TeamRosterSection";
import { WebsiteDomainSection } from "@/components/onboarding/WebsiteDomainSection";
import { buildTenantThemeCss } from "@/lib/tenancy/brand-theme-css";

type ThemeOption = {
  id: string;
  label: string;
  description: string;
  swatch: {
    primary: string;
    secondary: string;
    accent: string;
    surfaceTint: string;
  };
};

type TemplateOption = {
  id: string;
  label: string;
  description: string;
  category: "DEFAULT" | "AGENT" | "TEAM" | "BROKERAGE";
  categoryLabel: string;
  themes: ThemeOption[];
};

type BrandAssets = {
  agentProfilePhotoUrl: string | null;
  logoUrl: string | null;
  brokerageLogoUrl: string | null;
  faviconUrl: string | null;
};

type WorkspaceRow = {
  workspaceId: string;
  name: string;
  displayName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  replyToEmail: string | null;
  senderDisplayName: string | null;
  themeId: string | null;
  templateCategory: string;
  templateId: string;
  templateLabel: string;
  templateOptions: TemplateOption[];
  themeOptions: ThemeOption[];
  brandAssets: BrandAssets;
  professionalIdentity: {
    agentRegisteredName: string | null;
    agentDesignation: string | null;
    agentCellPhone: string | null;
    recoLicenseNumber: string | null;
    recoLicenseExpiresAt: string | null;
    brokerageRegisteredName: string | null;
    brokerageFax: string | null;
    brokeragePhone: string | null;
    brokerageAddress: string | null;
  };
  teamSignatureDataReadiness?: {
    ready: boolean;
    missingLabels: string[];
    sections?: {
      business: boolean;
      branding: boolean;
      brokerage: boolean;
      roster: boolean;
      leader: boolean;
    };
  };
  onboarding: {
    templateThemeStatus: string;
    businessProfileStatus: string;
    emailIdentityStatus: string;
    brandingStatus: string;
    professionalIdentityStatus: string;
    websiteSetupComplete?: boolean;
    websiteSetupMissingFields?: string[];
  };
};

type BusinessProfileDraft = {
  displayName: string;
  contactEmail: string;
  contactPhone: string;
  replyToEmail: string;
  senderDisplayName: string;
};

const EMPTY_IDENTITY: ProfessionalIdentityFields = {
  agentRegisteredName: "",
  agentDesignation: "",
  agentCellPhone: "",
  recoLicenseNumber: "",
  recoLicenseExpiresAt: "",
  brokerageRegisteredName: "",
  brokerageFax: "",
  brokeragePhone: "",
  brokerageAddress: "",
};

function identityFromRow(
  row: WorkspaceRow["professionalIdentity"] | null | undefined,
): ProfessionalIdentityFields {
  return {
    agentRegisteredName: row?.agentRegisteredName ?? "",
    agentDesignation: row?.agentDesignation ?? "",
    agentCellPhone: row?.agentCellPhone ?? "",
    recoLicenseNumber: row?.recoLicenseNumber ?? "",
    recoLicenseExpiresAt: row?.recoLicenseExpiresAt ?? "",
    brokerageRegisteredName: row?.brokerageRegisteredName ?? "",
    brokerageFax: row?.brokerageFax ?? "",
    brokeragePhone: row?.brokeragePhone ?? "",
    brokerageAddress: row?.brokerageAddress ?? "",
  };
}

async function postOnboarding(body: Record<string, unknown>) {
  const res = await fetch("/api/onboarding", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok?: boolean; message?: string };
  if (!res.ok || !json.ok) {
    throw new Error(json.message ?? "Unable to save.");
  }
}

/**
 * Stage 6.10C.1 / 6.11A / 6.11B — host-bound OWNER onboarding.
 * Website Design: Default + Agent Branded (Agent Signature).
 */
export function OwnerOnboardingClient() {
  return (
    <OnboardingDraftFlushProvider>
      <OwnerOnboardingForm />
    </OnboardingDraftFlushProvider>
  );
}

function OwnerOnboardingForm() {
  const [item, setItem] = useState<WorkspaceRow | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [senderDisplayName, setSenderDisplayName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [brandAssets, setBrandAssets] = useState<BrandAssets>({
    agentProfilePhotoUrl: null,
    logoUrl: null,
    brokerageLogoUrl: null,
    faviconUrl: null,
  });
  const [brandingStatus, setBrandingStatus] = useState("NOT_STARTED");
  const [professionalIdentity, setProfessionalIdentity] =
    useState<ProfessionalIdentityFields>(EMPTY_IDENTITY);
  const [professionalIdentityStatus, setProfessionalIdentityStatus] =
    useState("NOT_STARTED");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  const [startingPreview, setStartingPreview] = useState(false);

  const workspaceIdRef = useRef<string | null>(null);
  const businessDirtyRef = useRef(false);
  const themeDirtyRef = useRef(false);
  const businessFieldsRef = useRef<BusinessProfileDraft>({
    displayName: "",
    contactEmail: "",
    contactPhone: "",
    replyToEmail: "",
    senderDisplayName: "",
  });
  const selectedThemeIdRef = useRef<string | null>(null);
  const hasLoadedRef = useRef(false);

  const { flushAll } = useOnboardingDraftFlush();

  const persistBusinessDraft = useCallback(async (payload: BusinessProfileDraft) => {
    const workspaceId = workspaceIdRef.current;
    if (!workspaceId) return;
    await postOnboarding({
      action: "business_profile",
      draft: true,
      workspaceId,
      ...payload,
    });
    if (
      JSON.stringify(payload) === JSON.stringify(businessFieldsRef.current)
    ) {
      businessDirtyRef.current = false;
    }
  }, []);

  const persistThemeDraft = useCallback(async (themeId: string) => {
    const workspaceId = workspaceIdRef.current;
    if (!workspaceId || !themeId) return;
    await postOnboarding({
      action: "template_theme",
      draft: true,
      workspaceId,
      themeId,
    });
    if (selectedThemeIdRef.current === themeId) {
      themeDirtyRef.current = false;
    }
  }, []);

  const businessDraft = useOnboardingDraftAutosave<BusinessProfileDraft>({
    flushId: "business-profile",
    save: persistBusinessDraft,
  });
  const themeDraft = useOnboardingDraftAutosave<string>({
    flushId: "template-theme",
    save: persistThemeDraft,
  });
  const businessDraftRef = useRef(businessDraft);
  const themeDraftRef = useRef(themeDraft);
  businessDraftRef.current = businessDraft;
  themeDraftRef.current = themeDraft;

  const load = useCallback(async (opts?: { preserveLocalForms?: boolean }) => {
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        headers: { Accept: "application/json" },
      });
      const body = (await res.json()) as {
        ok: boolean;
        message?: string;
        data?: { items: WorkspaceRow[] };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.message ?? "Unable to load onboarding.");
        setItem(null);
        return;
      }
      const first = body.data.items[0] ?? null;
      setItem(first);
      if (!first) return;
      workspaceIdRef.current = first.workspaceId;
      setBrandAssets(
        first.brandAssets ?? {
          agentProfilePhotoUrl: null,
          logoUrl: null,
          brokerageLogoUrl: null,
          faviconUrl: null,
        },
      );
      setBrandingStatus(first.onboarding.brandingStatus ?? "NOT_STARTED");
      setProfessionalIdentityStatus(
        first.onboarding.professionalIdentityStatus ?? "NOT_STARTED",
      );
      setProfessionalIdentity(identityFromRow(first.professionalIdentity));

      const preserveBusiness =
        opts?.preserveLocalForms === true ||
        businessDirtyRef.current ||
        businessDraftRef.current.hasUnsavedWork();
      if (!preserveBusiness) {
        const nextBusiness: BusinessProfileDraft = {
          displayName: first.displayName ?? first.name,
          contactEmail: first.contactEmail ?? "",
          contactPhone: first.contactPhone ?? "",
          replyToEmail: first.replyToEmail ?? first.contactEmail ?? "",
          senderDisplayName:
            first.senderDisplayName ?? first.displayName ?? "",
        };
        businessFieldsRef.current = nextBusiness;
        setDisplayName(nextBusiness.displayName);
        setContactEmail(nextBusiness.contactEmail);
        setContactPhone(nextBusiness.contactPhone);
        setReplyToEmail(nextBusiness.replyToEmail);
        setSenderDisplayName(nextBusiness.senderDisplayName);
      }

      const preserveTheme =
        opts?.preserveLocalForms === true ||
        themeDirtyRef.current ||
        themeDraftRef.current.hasUnsavedWork();
      if (!preserveTheme) {
        setSelectedTemplateId(first.templateId);
        setSelectedThemeId(first.themeId);
        selectedThemeIdRef.current = first.themeId;
      }
    } catch {
      setError("Network error loading onboarding.");
      setItem(null);
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onHide = () => {
      void flushAll();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flushAll]);

  const selectedTemplate = useMemo(() => {
    if (!item || !selectedTemplateId) return null;
    return (
      item.templateOptions.find((t) => t.id === selectedTemplateId) ?? null
    );
  }, [item, selectedTemplateId]);

  const themeOptions = selectedTemplate?.themes ?? [];

  const previewTheme = useMemo(() => {
    if (!selectedThemeId) return null;
    return themeOptions.find((t) => t.id === selectedThemeId) ?? null;
  }, [themeOptions, selectedThemeId]);

  const previewCss = useMemo(() => {
    if (!previewTheme) return null;
    return buildTenantThemeCss({
      primary: previewTheme.swatch.primary,
      secondary: previewTheme.swatch.secondary,
      accent: previewTheme.swatch.accent,
      surface: "#FFFFFF",
      ink: "#14201C",
    });
  }, [previewTheme]);

  function patchBusiness<K extends keyof BusinessProfileDraft>(
    key: K,
    value: BusinessProfileDraft[K],
  ) {
    const next = { ...businessFieldsRef.current, [key]: value };
    businessFieldsRef.current = next;
    businessDirtyRef.current = true;
    if (key === "displayName") setDisplayName(value);
    if (key === "contactEmail") setContactEmail(value);
    if (key === "contactPhone") setContactPhone(value);
    if (key === "replyToEmail") setReplyToEmail(value);
    if (key === "senderDisplayName") setSenderDisplayName(value);
    businessDraft.schedule(next);
  }

  function applyThemeSelection(template: TemplateOption, themeId: string | null) {
    setSelectedTemplateId(template.id);
    setSelectedThemeId(themeId);
    selectedThemeIdRef.current = themeId;
    if (!themeId) return;
    themeDirtyRef.current = true;
    themeDraft.schedule(themeId);
  }

  function onSelectTemplate(template: TemplateOption) {
    const keep =
      selectedThemeId &&
      template.themes.some((t) => t.id === selectedThemeId);
    const nextThemeId = keep
      ? selectedThemeId
      : (template.themes[0]?.id ?? null);
    applyThemeSelection(template, nextThemeId);
  }

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    if (!item) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await postOnboarding({
        action: "business_profile",
        workspaceId: item.workspaceId,
        displayName,
        contactEmail,
        contactPhone,
        replyToEmail,
        senderDisplayName,
      });
      businessDirtyRef.current = false;
      setMessage("Business profile saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save.");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveTheme() {
    if (!item || !selectedThemeId) return;
    setSavingTheme(true);
    setError(null);
    setMessage(null);
    try {
      await postOnboarding({
        action: "template_theme",
        workspaceId: item.workspaceId,
        themeId: selectedThemeId,
      });
      themeDirtyRef.current = false;
      setMessage("Website design saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save theme.");
    } finally {
      setSavingTheme(false);
    }
  }

  async function onPreviewSite() {
    if (!item || !selectedThemeId) return;
    setStartingPreview(true);
    setError(null);
    setMessage(null);
    try {
      await flushAll();
      const res = await fetch("/api/onboarding/template-preview", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "start",
          workspaceId: item.workspaceId,
          themeId: selectedThemeId,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        message?: string;
        data?: { redirectTo?: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.message ?? "Unable to start preview.");
        setStartingPreview(false);
        return;
      }
      window.location.assign(body.data?.redirectTo ?? "/");
    } catch {
      setError("Network error while starting preview.");
      setStartingPreview(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-600">Loading onboarding…</p>;
  }

  if (error && !item) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!item) {
    return (
      <p className="text-sm text-slate-600">
        No OWNER workspace available for this hostname.
      </p>
    );
  }

  const themeComplete = item.onboarding.templateThemeStatus === "COMPLETE";
  // Server-side overall completion only — do not invent from local component state.
  const websiteSetupComplete = item.onboarding.websiteSetupComplete === true;
  const websiteSetupMissingFields =
    item.onboarding.websiteSetupMissingFields ?? [];
  const categories = Array.from(
    new Map(
      item.templateOptions.map((t) => [
        t.category,
        { category: t.category, label: t.categoryLabel },
      ]),
    ).values(),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {previewCss ? (
        <style data-onboarding-theme-preview="true">{previewCss}</style>
      ) : null}

      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Workspace setup</h1>
        <p className="mt-2 text-sm text-slate-600">
          Complete business details and choose a website look for{" "}
          <span className="font-medium text-slate-800">
            {item.displayName ?? item.name}
          </span>
          .
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Website Setup:{" "}
          <span className="font-medium text-slate-700">
            {websiteSetupComplete ? "COMPLETE" : "INCOMPLETE"}
          </span>
          {!websiteSetupComplete ? (
            <span className="text-amber-700">
              {" "}
              — live site and CRM stay available while setup is incomplete.
            </span>
          ) : null}
        </p>
        {!websiteSetupComplete && websiteSetupMissingFields.length > 0 ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="font-semibold">Missing:</p>
            <ul className="mt-1 list-disc pl-4">
              {websiteSetupMissingFields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <form
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
        onSubmit={onSave}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-medium text-slate-900">Business profile</h2>
          <OnboardingDraftStatus status={businessDraft.status} />
        </div>
        <label className="block text-sm text-slate-700">
          Business display name
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={displayName}
            onChange={(e) => patchBusiness("displayName", e.target.value)}
            required
          />
        </label>
        <label className="block text-sm text-slate-700">
          Contact email
          <input
            type="email"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={contactEmail}
            onChange={(e) => patchBusiness("contactEmail", e.target.value)}
            required
          />
        </label>
        <label className="block text-sm text-slate-700">
          Business phone
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={contactPhone}
            onChange={(e) => patchBusiness("contactPhone", e.target.value)}
          />
        </label>
        <label className="block text-sm text-slate-700">
          Reply-to email
          <input
            type="email"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={replyToEmail}
            onChange={(e) => patchBusiness("replyToEmail", e.target.value)}
          />
        </label>
        <label className="block text-sm text-slate-700">
          Sender display name
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={senderDisplayName}
            onChange={(e) =>
              patchBusiness("senderDisplayName", e.target.value)
            }
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--canopy, #0F6B4C)" }}
        >
          {saving ? "Saving…" : "Save business profile"}
        </button>
      </form>

      <ProfessionalIdentitySection
        workspaceId={item.workspaceId}
        status={professionalIdentityStatus}
        initial={professionalIdentity}
        brokerageLogoUrl={brandAssets.brokerageLogoUrl}
        templateCategory={item.templateCategory}
        onSaved={() => {
          void load();
        }}
      />

      <BrandAssetsSection
        workspaceId={item.workspaceId}
        templateCategory={item.templateCategory}
        brandingStatus={brandingStatus}
        assets={brandAssets}
        onAssetsChange={(next, status) => {
          setBrandAssets(next);
          setBrandingStatus(status);
          void load({ preserveLocalForms: true });
        }}
      />

      <TeamRosterSection
        workspaceId={item.workspaceId}
        teamSignatureDataReadiness={item.teamSignatureDataReadiness ?? null}
        onRosterChange={() => {
          void load({ preserveLocalForms: true });
        }}
      />

      <WebsiteDomainSection workspaceId={item.workspaceId} />

      <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-slate-900">Website design</h2>
            <p className="mt-1 text-sm text-slate-600">
              Choose a category, then a template. Themes control color identity.
            </p>
            {themeComplete ? (
              <p className="mt-2 text-xs font-medium text-emerald-700">
                Design selection complete
                {item.templateLabel ? ` · ${item.templateLabel}` : ""}
                {item.themeId
                  ? ` · ${item.themeOptions.find((t) => t.id === item.themeId)?.label ?? ""}`
                  : ""}
              </p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                Selecting a design finishes this step (does not complete overall
                onboarding).
              </p>
            )}
          </div>
          <OnboardingDraftStatus status={themeDraft.status} />
        </div>

        <div>
          <h3 className="text-sm font-medium text-slate-800">Category</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {categories.map((cat) => {
              const templatesInCat = item.templateOptions.filter(
                (t) => t.category === cat.category,
              );
              const selected = templatesInCat.some(
                (t) => t.id === selectedTemplateId,
              );
              return (
                <button
                  key={cat.category}
                  type="button"
                  onClick={() => {
                    const first = templatesInCat[0];
                    if (first) onSelectTemplate(first);
                  }}
                  className={[
                    "rounded-xl border p-4 text-left transition",
                    selected
                      ? "border-[color:var(--canopy,#0F6B4C)] ring-2 ring-[color:var(--canopy,#0F6B4C)]"
                      : "border-slate-200 hover:border-slate-300",
                  ].join(" ")}
                  aria-pressed={selected}
                >
                  <div className="text-sm font-semibold text-slate-900">
                    {cat.label}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {templatesInCat.map((t) => t.label).join(" · ")}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {selectedTemplate ? (
          <div>
            <h3 className="text-sm font-medium text-slate-800">Template</h3>
            <div className="mt-2 grid gap-3">
              {item.templateOptions
                .filter((t) => t.category === selectedTemplate.category)
                .map((template) => {
                  const selected = selectedTemplateId === template.id;
                  const isAgent = template.id === "agent-signature";
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => onSelectTemplate(template)}
                      className={[
                        "rounded-xl border p-4 text-left transition",
                        selected
                          ? "border-[color:var(--canopy,#0F6B4C)] ring-2 ring-[color:var(--canopy,#0F6B4C)]"
                          : "border-slate-200 hover:border-slate-300",
                      ].join(" ")}
                      aria-pressed={selected}
                    >
                      <div
                        className="mb-3 h-20 overflow-hidden rounded-lg border border-black/5"
                        style={{
                          background: isAgent
                            ? `linear-gradient(135deg,${template.themes[0]?.swatch.surfaceTint ?? "#F7F3EC"} 0%,${template.themes[0]?.swatch.accent ?? "#8B6914"} 45%,${template.themes[0]?.swatch.primary ?? "#1C1917"} 100%)`
                            : "linear-gradient(135deg,#EEF3F0 0%,#D5E0DA 50%,#0F6B4C 100%)",
                        }}
                      />
                      <div className="text-sm font-semibold text-slate-900">
                        {template.label}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {template.description}
                      </p>
                      {selected ? (
                        <p className="mt-2 text-xs font-medium text-slate-700">
                          Selected
                        </p>
                      ) : null}
                    </button>
                  );
                })}
            </div>
          </div>
        ) : null}

        {themeOptions.length > 0 ? (
          <div>
            <h3 className="text-sm font-medium text-slate-800">
              {selectedTemplate?.id === "agent-signature"
                ? "Accent theme"
                : "Color theme"}
            </h3>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {themeOptions.map((theme) => {
                const selected = selectedThemeId === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => {
                      if (!selectedTemplate) return;
                      applyThemeSelection(selectedTemplate, theme.id);
                    }}
                    className={[
                      "rounded-xl border p-3 text-left transition",
                      selected
                        ? "border-[color:var(--canopy,#0F6B4C)] ring-2 ring-[color:var(--canopy,#0F6B4C)]"
                        : "border-slate-200 hover:border-slate-300",
                    ].join(" ")}
                    aria-pressed={selected}
                  >
                    <div
                      className="mb-3 h-14 overflow-hidden rounded-lg border border-black/5"
                      style={{ backgroundColor: theme.swatch.surfaceTint }}
                    >
                      <div className="flex h-full">
                        <div
                          className="w-1/2"
                          style={{ backgroundColor: theme.swatch.primary }}
                        />
                        <div className="flex w-1/2 flex-col">
                          <div
                            className="h-1/2"
                            style={{ backgroundColor: theme.swatch.secondary }}
                          />
                          <div
                            className="h-1/2"
                            style={{ backgroundColor: theme.swatch.accent }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-medium text-slate-900">
                      {theme.label}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {theme.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {previewTheme ? (
          <div
            className="rounded-xl border border-slate-200 p-4"
            style={{ backgroundColor: previewTheme.swatch.surfaceTint }}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Live preview
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: previewTheme.swatch.primary }}
              >
                Primary button
              </button>
              <span
                className="text-sm font-medium underline"
                style={{ color: previewTheme.swatch.primary }}
              >
                Sample link
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-700">
              {selectedTemplate?.id === "agent-signature"
                ? "Agent Signature uses a distinct premium layout — colors refine the identity."
                : "Default keeps the current website structure — only the visual identity changes."}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={startingPreview || !selectedThemeId}
            onClick={() => void onPreviewSite()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            {startingPreview ? "Opening preview…" : "Preview"}
          </button>
          <button
            type="button"
            disabled={savingTheme || !selectedThemeId}
            onClick={() => void onSaveTheme()}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--canopy, #0F6B4C)" }}
          >
            {savingTheme ? "Saving design…" : "Save website design"}
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Preview opens your live site with this design for you only — it does
          not save or change what visitors see.
        </p>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
    </div>
  );
}
