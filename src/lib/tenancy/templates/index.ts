/**
 * Stage 6.11A/B/E.1 — static template catalog + themeId resolution.
 */
import { AGENT_SIGNATURE_THEMES } from "./agent-signature-themes";
import { DEFAULT_SIGNATURE_THEMES } from "./default-signature-themes";
import { TEAM_SIGNATURE_THEMES } from "./team-signature-themes";
import {
  AGENT_SIGNATURE_TEMPLATE_ID,
  DEFAULT_TEMPLATE_ID,
  IMPLEMENTED_TEMPLATE_IDS,
  RESERVED_TEMPLATE_IDS,
  TEAM_SIGNATURE_TEMPLATE_ID,
  TEMPLATE_CATEGORIES,
  buildThemeId,
  parseThemeId,
  type ImplementedTemplateId,
  type TemplateCategory,
  type TemplateDefinition,
  type TemplateThemeDefinition,
  type TemplateThemePalette,
} from "./types";

export {
  AGENT_SIGNATURE_TEMPLATE_ID,
  DEFAULT_TEMPLATE_ID,
  TEAM_SIGNATURE_TEMPLATE_ID,
  IMPLEMENTED_TEMPLATE_IDS,
  RESERVED_TEMPLATE_IDS,
  TEMPLATE_CATEGORIES,
  DEFAULT_THEME_KEYS,
  AGENT_SIGNATURE_THEME_KEYS,
  TEAM_SIGNATURE_THEME_KEYS,
  buildThemeId,
  parseThemeId,
} from "./types";
export type {
  AgentSignatureThemeKey,
  DefaultThemeKey,
  TeamSignatureThemeKey,
  ImplementedTemplateId,
  TemplateCategory,
  TemplateDefinition,
  TemplateThemeDefinition,
  TemplateThemePalette,
} from "./types";

const DEFAULT_TEMPLATE: TemplateDefinition = {
  id: DEFAULT_TEMPLATE_ID,
  category: "DEFAULT",
  categoryLabel: "Default",
  label: "Default",
  description:
    "The current HouzzatPRO tenant website — same layout and features, six visual themes.",
  selectable: true,
  presentationReady: true,
  themes: DEFAULT_SIGNATURE_THEMES,
};

const AGENT_SIGNATURE_TEMPLATE: TemplateDefinition = {
  id: AGENT_SIGNATURE_TEMPLATE_ID,
  category: "AGENT",
  categoryLabel: "Agent Branded",
  label: "Agent Signature",
  description:
    "High-end personal agent brand website — editorial photography, agent-first hero, and premium presentation.",
  selectable: true,
  presentationReady: true,
  themes: AGENT_SIGNATURE_THEMES,
};

/**
 * Stage 6.11E.2 — presentation ready for design review.
 * OWNER selectable remains false until physical review + roster model.
 */
const TEAM_SIGNATURE_TEMPLATE: TemplateDefinition = {
  id: TEAM_SIGNATURE_TEMPLATE_ID,
  category: "TEAM",
  categoryLabel: "Team Branded",
  label: "Team Signature",
  description:
    "Premium team-brand-first website — collective brand, local market presence, and team services.",
  selectable: false,
  presentationReady: true,
  themes: TEAM_SIGNATURE_THEMES,
};

const TEMPLATES_BY_ID: Record<ImplementedTemplateId, TemplateDefinition> = {
  [DEFAULT_TEMPLATE_ID]: DEFAULT_TEMPLATE,
  [AGENT_SIGNATURE_TEMPLATE_ID]: AGENT_SIGNATURE_TEMPLATE,
  [TEAM_SIGNATURE_TEMPLATE_ID]: TEAM_SIGNATURE_TEMPLATE,
};

const THEMES_BY_ID = new Map<string, TemplateThemeDefinition>([
  ...DEFAULT_SIGNATURE_THEMES.map((theme) => [theme.id, theme] as const),
  ...AGENT_SIGNATURE_THEMES.map((theme) => [theme.id, theme] as const),
  ...TEAM_SIGNATURE_THEMES.map((theme) => [theme.id, theme] as const),
]);

/** OWNER-selectable templates for onboarding Website Design. */
export function listSelectableTemplates(): readonly TemplateDefinition[] {
  return IMPLEMENTED_TEMPLATE_IDS.map((id) => TEMPLATES_BY_ID[id]).filter(
    (template) => template.selectable,
  );
}

/** All catalog-implemented templates (including non-selectable foundations). */
export function listImplementedTemplates(): readonly TemplateDefinition[] {
  return IMPLEMENTED_TEMPLATE_IDS.map((id) => TEMPLATES_BY_ID[id]);
}

export function getTemplate(
  templateId: string,
): TemplateDefinition | null {
  if (
    (IMPLEMENTED_TEMPLATE_IDS as readonly string[]).includes(templateId)
  ) {
    return TEMPLATES_BY_ID[templateId as ImplementedTemplateId];
  }
  return null;
}

export function getThemeById(
  themeId: string | null | undefined,
): TemplateThemeDefinition | null {
  if (!themeId) return null;
  return THEMES_BY_ID.get(themeId.trim()) ?? null;
}

export function isValidThemeId(themeId: string | null | undefined): boolean {
  return getThemeById(themeId) != null;
}

/**
 * Resolve palette from persisted themeId.
 * Invalid / unknown / null → null (caller keeps existing brand colors).
 */
export function resolveThemePalette(
  themeId: string | null | undefined,
): TemplateThemePalette | null {
  return getThemeById(themeId)?.palette ?? null;
}

/**
 * Template id from persisted themeId for public layout switching.
 * null/unknown → Default.
 * Templates with presentationReady=false → Default (unfinished must not activate).
 */
export function resolveTemplateIdFromThemeId(
  themeId: string | null | undefined,
): ImplementedTemplateId {
  const parsed = parseThemeId(themeId);
  if (!parsed) return DEFAULT_TEMPLATE_ID;
  const template = getTemplate(parsed.templateId);
  if (!template || !template.presentationReady) return DEFAULT_TEMPLATE_ID;
  return template.id;
}

/** Category for a template id (implemented or reserved). */
export function categoryForTemplateId(
  templateId: string,
): TemplateCategory | null {
  const implemented = getTemplate(templateId);
  if (implemented) return implemented.category;
  if (templateId.startsWith("agent")) return "AGENT";
  if (templateId.startsWith("team")) return "TEAM";
  if (templateId.startsWith("brokerage")) return "BROKERAGE";
  if (templateId === "default-signature" || templateId.startsWith("default")) {
    return "DEFAULT";
  }
  return null;
}

export type OnboardingThemeOption = {
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

export type OnboardingTemplateOption = {
  id: ImplementedTemplateId;
  label: string;
  description: string;
  category: TemplateCategory;
  categoryLabel: string;
  themes: OnboardingThemeOption[];
};

/** Public onboarding catalog — selectable templates only. */
export function listOnboardingTemplateOptions(): OnboardingTemplateOption[] {
  return listSelectableTemplates().map(toOnboardingTemplateOption);
}

/**
 * OWNER Website Design options for configuration/QA.
 * Includes selectable catalog plus presentation-ready Team Signature while it
 * remains commercially non-selectable. Does not expose other non-selectable
 * templates (e.g. future Brokerage).
 */
export function listOwnerWebsiteDesignTemplateOptions(): OnboardingTemplateOption[] {
  const byId = new Map<ImplementedTemplateId, OnboardingTemplateOption>();
  for (const template of listSelectableTemplates()) {
    byId.set(template.id, toOnboardingTemplateOption(template));
  }
  const team = getTemplate(TEAM_SIGNATURE_TEMPLATE_ID);
  if (team?.presentationReady) {
    byId.set(team.id, toOnboardingTemplateOption(team));
  }
  return IMPLEMENTED_TEMPLATE_IDS.map((id) => byId.get(id)).filter(
    (option): option is OnboardingTemplateOption => option != null,
  );
}

function toOnboardingTemplateOption(
  template: TemplateDefinition,
): OnboardingTemplateOption {
  return {
    id: template.id,
    label: template.label,
    description: template.description,
    category: template.category,
    categoryLabel: template.categoryLabel,
    themes: template.themes.map((theme) => ({
      id: theme.id,
      label: theme.label,
      description: theme.description,
      swatch: { ...theme.palette },
    })),
  };
}

/** @deprecated Prefer listOnboardingTemplateOptions — kept for 6.11A callers. */
export function listDefaultThemeOptionsForOnboarding(): OnboardingThemeOption[] {
  return DEFAULT_SIGNATURE_THEMES.map((theme) => ({
    id: theme.id,
    label: theme.label,
    description: theme.description,
    swatch: { ...theme.palette },
  }));
}

/**
 * True when themeId is a valid, presentation-ready Team Signature theme
 * usable by the public resolver. Does NOT require selectable === true.
 */
export function isValidConfiguredTeamSignatureTheme(
  themeId: string | null | undefined,
): boolean {
  if (!themeId?.trim()) return false;
  const theme = getThemeById(themeId);
  if (!theme) return false;
  const parsed = parseThemeId(theme.id);
  if (!parsed || parsed.templateId !== TEAM_SIGNATURE_TEMPLATE_ID) {
    return false;
  }
  const template = getTemplate(parsed.templateId);
  if (!template?.presentationReady) return false;
  if (!template.themes.some((t) => t.id === theme.id)) return false;
  return resolveTemplateIdFromThemeId(theme.id) === TEAM_SIGNATURE_TEMPLATE_ID;
}

/**
 * Category from persisted theme for Website Setup evaluation.
 * Uses presentationReady resolution (Team included while selectable=false).
 * Invalid / null theme → DEFAULT.
 */
export function resolveOnboardingCategoryFromThemeId(
  themeId: string | null | undefined,
): TemplateCategory {
  const templateId = resolveTemplateIdFromThemeId(themeId);
  const template = getTemplate(templateId);
  if (!template?.presentationReady) return "DEFAULT";
  return template.category;
}

/**
 * Preview-only themes: presentationReady templates (incl. non-selectable Team).
 * Must NOT be used for persistence / apply.
 */
export function requireValidPreviewableThemeId(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new Error("INVALID_THEME_ID");
  }
  const theme = getThemeById(raw);
  if (!theme) {
    throw new Error("INVALID_THEME_ID");
  }
  const parsed = parseThemeId(theme.id);
  if (!parsed) {
    throw new Error("INVALID_THEME_ID");
  }
  const template = getTemplate(parsed.templateId);
  if (!template?.presentationReady) {
    throw new Error("INVALID_THEME_ID");
  }
  return theme.id;
}

/** Fail-closed parse for OWNER mutation (selectable templates only). */
export function requireValidSelectableThemeId(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new Error("INVALID_THEME_ID");
  }
  const theme = getThemeById(raw);
  if (!theme) {
    throw new Error("INVALID_THEME_ID");
  }
  const parsed = parseThemeId(theme.id);
  if (!parsed) {
    throw new Error("INVALID_THEME_ID");
  }
  const template = getTemplate(parsed.templateId);
  if (!template?.selectable) {
    throw new Error("INVALID_THEME_ID");
  }
  return theme.id;
}

/**
 * OWNER Website Design persistence gate (6.11E.8B).
 * - Selectable templates: unchanged (commercial catalog).
 * - Team Signature only: presentationReady Team themes allowed while
 *   selectable=false (pre-launch QA). No generic non-selectable bypass.
 */
export function requireValidOwnerPersistableThemeId(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new Error("INVALID_THEME_ID");
  }
  const theme = getThemeById(raw);
  if (!theme) {
    throw new Error("INVALID_THEME_ID");
  }
  const parsed = parseThemeId(theme.id);
  if (!parsed) {
    throw new Error("INVALID_THEME_ID");
  }
  const template = getTemplate(parsed.templateId);
  if (!template) {
    throw new Error("INVALID_THEME_ID");
  }
  if (template.selectable) {
    return theme.id;
  }
  if (
    template.id === TEAM_SIGNATURE_TEMPLATE_ID &&
    template.presentationReady &&
    template.category === "TEAM" &&
    template.themes.some((t) => t.id === theme.id)
  ) {
    return theme.id;
  }
  throw new Error("INVALID_THEME_ID");
}

/** True when OWNER Apply may persist this themeId (UI hint). */
export function isOwnerPersistableThemeId(
  themeId: string | null | undefined,
): boolean {
  try {
    requireValidOwnerPersistableThemeId(themeId);
    return true;
  } catch {
    return false;
  }
}

/** @deprecated Prefer requireValidSelectableThemeId */
export function requireValidDefaultThemeId(raw: unknown): string {
  const id = requireValidSelectableThemeId(raw);
  const parsed = parseThemeId(id);
  if (!parsed || parsed.templateId !== DEFAULT_TEMPLATE_ID) {
    throw new Error("INVALID_THEME_ID");
  }
  return id;
}

export function isReservedFutureTemplateId(templateId: string): boolean {
  return (RESERVED_TEMPLATE_IDS as readonly string[]).includes(templateId);
}

export function isAgentSignatureTemplateId(
  templateId: string | null | undefined,
): boolean {
  return templateId === AGENT_SIGNATURE_TEMPLATE_ID;
}

export function isTeamSignatureTemplateId(
  templateId: string | null | undefined,
): boolean {
  return templateId === TEAM_SIGNATURE_TEMPLATE_ID;
}

export { AGENT_SIGNATURE_DEMO } from "./agent-signature-demo";
export { TEAM_SIGNATURE_DEMO } from "./team-signature-demo";
export { TEAM_SIGNATURE_THEMES } from "./team-signature-themes";
export { formatCommunityDisplayName } from "./format-community-display-name";
export {
  resolveAgentSignatureView,
  type AgentSignatureView,
} from "./resolve-agent-signature-view";
export {
  resolveTeamSignatureView,
  type TeamSignatureView,
  type TeamSignatureMemberPlaceholder,
} from "./resolve-team-signature-view";
