/**
 * Stage 6.11A/B — HouzzatPRO website template system (static catalog).
 *
 * CATEGORY → TEMPLATE → THEME
 * Persistence: WorkspaceBranding.themeId stores namespaced
 *   "{templateId}:{themeKey}" (e.g. default-signature:mint,
 *   agent-signature:editorial).
 * No DB catalog tables — future templates add code entries only.
 */

export const TEMPLATE_CATEGORIES = [
  "DEFAULT",
  "AGENT",
  "TEAM",
  "BROKERAGE",
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const DEFAULT_TEMPLATE_ID = "default-signature" as const;
export const AGENT_SIGNATURE_TEMPLATE_ID = "agent-signature" as const;

/** Implemented templates (selectable). */
export const IMPLEMENTED_TEMPLATE_IDS = [
  DEFAULT_TEMPLATE_ID,
  AGENT_SIGNATURE_TEMPLATE_ID,
] as const;

export type ImplementedTemplateId = (typeof IMPLEMENTED_TEMPLATE_IDS)[number];

/** Future template ids (catalog-ready; not selectable yet). */
export const RESERVED_TEMPLATE_IDS = [
  "team-signature",
  "brokerage-signature",
] as const;

export const DEFAULT_THEME_KEYS = [
  "mint",
  "light-blue",
  "dark-blue",
  "purple",
  "professional-red",
  "beige",
] as const;

export type DefaultThemeKey = (typeof DEFAULT_THEME_KEYS)[number];

export const AGENT_SIGNATURE_THEME_KEYS = [
  "editorial",
  "navy",
  "forest",
  "slate",
  "burgundy",
  "bronze",
] as const;
export type AgentSignatureThemeKey = (typeof AGENT_SIGNATURE_THEME_KEYS)[number];

/** Brand color triple written to WorkspaceBranding + consumed by TenantThemeStyle. */
export type TemplateThemePalette = {
  primary: string;
  secondary: string;
  accent: string;
  /** Preview-only surface hint (not persisted as a column). */
  surfaceTint: string;
};

export type TemplateThemeDefinition = {
  key: string;
  /** Persistable id: default-signature:mint | agent-signature:editorial */
  id: string;
  label: string;
  description: string;
  palette: TemplateThemePalette;
};

export type TemplateDefinition = {
  id: ImplementedTemplateId;
  category: TemplateCategory;
  /** Owner-facing category label (e.g. "Agent Branded"). */
  categoryLabel: string;
  label: string;
  description: string;
  selectable: true;
  themes: readonly TemplateThemeDefinition[];
};

export function buildThemeId(
  templateId: ImplementedTemplateId,
  themeKey: string,
): string {
  return `${templateId}:${themeKey}`;
}

export function parseThemeId(raw: string | null | undefined): {
  templateId: string;
  themeKey: string;
} | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const idx = trimmed.indexOf(":");
  if (idx <= 0 || idx === trimmed.length - 1) return null;
  const templateId = trimmed.slice(0, idx);
  const themeKey = trimmed.slice(idx + 1);
  if (!/^[a-z0-9-]+$/.test(templateId) || !/^[a-z0-9-]+$/.test(themeKey)) {
    return null;
  }
  return { templateId, themeKey };
}
