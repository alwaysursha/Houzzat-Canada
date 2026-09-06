/**
 * Stage 6.11A/B — static template catalog + themeId resolution.
 */
import { AGENT_SIGNATURE_THEMES } from "./agent-signature-themes";
import { DEFAULT_SIGNATURE_THEMES } from "./default-signature-themes";
import {
  AGENT_SIGNATURE_TEMPLATE_ID,
  DEFAULT_TEMPLATE_ID,
  IMPLEMENTED_TEMPLATE_IDS,
  RESERVED_TEMPLATE_IDS,
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
  IMPLEMENTED_TEMPLATE_IDS,
  RESERVED_TEMPLATE_IDS,
  TEMPLATE_CATEGORIES,
  DEFAULT_THEME_KEYS,
  AGENT_SIGNATURE_THEME_KEYS,
  buildThemeId,
  parseThemeId,
} from "./types";
export type {
  AgentSignatureThemeKey,
  DefaultThemeKey,
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
  themes: AGENT_SIGNATURE_THEMES,
};

const TEMPLATES_BY_ID: Record<ImplementedTemplateId, TemplateDefinition> = {
  [DEFAULT_TEMPLATE_ID]: DEFAULT_TEMPLATE,
  [AGENT_SIGNATURE_TEMPLATE_ID]: AGENT_SIGNATURE_TEMPLATE,
};

const THEMES_BY_ID = new Map<string, TemplateThemeDefinition>([
  ...DEFAULT_SIGNATURE_THEMES.map((theme) => [theme.id, theme] as const),
  ...AGENT_SIGNATURE_THEMES.map((theme) => [theme.id, theme] as const),
]);

/** Selectable templates for OWNER onboarding. */
export function listSelectableTemplates(): readonly TemplateDefinition[] {
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

/** Template id from persisted themeId; null/unknown → Default fallback for layout. */
export function resolveTemplateIdFromThemeId(
  themeId: string | null | undefined,
): ImplementedTemplateId {
  const parsed = parseThemeId(themeId);
  if (!parsed) return DEFAULT_TEMPLATE_ID;
  const template = getTemplate(parsed.templateId);
  return template?.id ?? DEFAULT_TEMPLATE_ID;
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

/** Public onboarding catalog — labels only, no reserved Team/Brokerage yet. */
export function listOnboardingTemplateOptions(): OnboardingTemplateOption[] {
  return listSelectableTemplates().map((template) => ({
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
  }));
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

/** Fail-closed parse for OWNER mutation (any selectable template theme). */
export function requireValidSelectableThemeId(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new Error("INVALID_THEME_ID");
  }
  const theme = getThemeById(raw);
  if (!theme) {
    throw new Error("INVALID_THEME_ID");
  }
  const parsed = parseThemeId(theme.id);
  if (!parsed || !getTemplate(parsed.templateId)) {
    throw new Error("INVALID_THEME_ID");
  }
  return theme.id;
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

export { AGENT_SIGNATURE_DEMO } from "./agent-signature-demo";
export { formatCommunityDisplayName } from "./format-community-display-name";
export {
  resolveAgentSignatureView,
  type AgentSignatureView,
} from "./resolve-agent-signature-view";
