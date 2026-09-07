"use client";

import { useEffect, useMemo, useState } from "react";
import { BrandAssetsSection } from "@/components/onboarding/BrandAssetsSection";
import {
  ProfessionalIdentitySection,
  type ProfessionalIdentityFields,
} from "@/components/onboarding/ProfessionalIdentitySection";
import { TeamRosterSection } from "@/components/onboarding/TeamRosterSection";
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
    brokerageRegisteredName: string | null;
    brokerageFax: string | null;
    brokeragePhone: string | null;
    brokerageAddress: string | null;
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

const EMPTY_IDENTITY: ProfessionalIdentityFields = {
  agentRegisteredName: "",
  agentDesignation: "",
  agentCellPhone: "",
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
    brokerageRegisteredName: row?.brokerageRegisteredName ?? "",
    brokerageFax: row?.brokerageFax ?? "",
    brokeragePhone: row?.brokeragePhone ?? "",
    brokerageAddress: row?.brokerageAddress ?? "",
  };
}

/**
 * Stage 6.10C.1 / 6.11A / 6.11B — host-bound OWNER onboarding.
 * Website Design: Default + Agent Branded (Agent Signature).
 */
export function OwnerOnboardingClient() {
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

  async function load() {
    setLoading(true);
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
      if (first) {
        setDisplayName(first.displayName ?? first.name);
        setContactEmail(first.contactEmail ?? "");
        setContactPhone(first.contactPhone ?? "");
        setReplyToEmail(first.replyToEmail ?? first.contactEmail ?? "");
        setSenderDisplayName(first.senderDisplayName ?? first.displayName ?? "");
        setSelectedTemplateId(first.templateId);
        setSelectedThemeId(first.themeId);
        setBrandAssets(
          first.brandAssets ?? {
            agentProfilePhotoUrl: null,
            logoUrl: null,
            brokerageLogoUrl: null,
            faviconUrl: null,
          },
        );
        setBrandingStatus(first.onboarding.brandingStatus ?? "NOT_STARTED");
        setProfessionalIdentity(identityFromRow(first.professionalIdentity));
        setProfessionalIdentityStatus(
          first.onboarding.professionalIdentityStatus ?? "NOT_STARTED",
        );
      }
    } catch {
      setError("Network error loading onboarding.");
      setItem(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

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

  function onSelectTemplate(template: TemplateOption) {
    setSelectedTemplateId(template.id);
    const keep =
      selectedThemeId &&
      template.themes.some((t) => t.id === selectedThemeId);
    if (!keep) {
      setSelectedThemeId(template.themes[0]?.id ?? null);
    }
  }

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    if (!item) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "business_profile",
          workspaceId: item.workspaceId,
          displayName,
          contactEmail,
          contactPhone,
          replyToEmail,
          senderDisplayName,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        message?: string;
      };
      if (!res.ok || !body.ok) {
        setError(body.message ?? "Unable to save.");
        return;
      }
      setMessage("Business profile saved.");
      await load();
    } catch {
      setError("Network error while saving.");
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
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "template_theme",
          workspaceId: item.workspaceId,
          themeId: selectedThemeId,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        message?: string;
      };
      if (!res.ok || !body.ok) {
        setError(body.message ?? "Unable to save theme.");
        return;
      }
      setMessage("Website design saved.");
      await load();
    } catch {
      setError("Network error while saving theme.");
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
        <h2 className="text-lg font-medium text-slate-900">Business profile</h2>
        <label className="block text-sm text-slate-700">
          Business display name
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm text-slate-700">
          Contact email
          <input
            type="email"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm text-slate-700">
          Business phone
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
          />
        </label>
        <label className="block text-sm text-slate-700">
          Reply-to email
          <input
            type="email"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={replyToEmail}
            onChange={(e) => setReplyToEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm text-slate-700">
          Sender display name
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={senderDisplayName}
            onChange={(e) => setSenderDisplayName(e.target.value)}
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
          void load();
        }}
      />

      <TeamRosterSection workspaceId={item.workspaceId} />

      <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
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
                    onClick={() => setSelectedThemeId(theme.id)}
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
