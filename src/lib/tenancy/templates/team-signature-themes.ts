/**
 * Stage 6.11E.1 — six Team Signature (team-signature) theme palettes.
 * Reuses Default theme family values; separate themeId namespace.
 * Does not alter Default or Agent Signature palettes.
 */
import { DEFAULT_SIGNATURE_THEMES } from "./default-signature-themes";
import {
  TEAM_SIGNATURE_TEMPLATE_ID,
  buildThemeId,
  type TemplateThemeDefinition,
} from "./types";

/**
 * Same labels / colors as Default; ids are team-signature:{key}.
 * primary / secondary / accent are #RRGGBB (validated brand colors).
 */
export const TEAM_SIGNATURE_THEMES: readonly TemplateThemeDefinition[] =
  DEFAULT_SIGNATURE_THEMES.map((theme) => ({
    key: theme.key,
    id: buildThemeId(TEAM_SIGNATURE_TEMPLATE_ID, theme.key),
    label: theme.label,
    description: theme.description,
    palette: { ...theme.palette },
  }));
