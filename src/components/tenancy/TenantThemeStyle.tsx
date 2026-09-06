import { buildTenantThemeCss } from "@/lib/tenancy/brand-theme-css";
import type { WorkspaceBrandColors } from "@/lib/tenancy/brand-dto";
import { mixHexWithWhite } from "@/lib/tenancy/tenant-theme-tokens";
import {
  AGENT_SIGNATURE_TEMPLATE_ID,
  DEFAULT_TEMPLATE_ID,
  type ImplementedTemplateId,
} from "@/lib/tenancy/templates";

/** Per-request tenant theme — skipped for Houzzat Default (globals.css). */
export function TenantThemeStyle({
  colors,
  isHouzzatWorkspace,
  templateId = DEFAULT_TEMPLATE_ID,
}: {
  colors: WorkspaceBrandColors;
  isHouzzatWorkspace: boolean;
  templateId?: ImplementedTemplateId;
}) {
  // Houzzat Default keeps globals.css. Premium templates inject tokens.
  if (isHouzzatWorkspace && templateId === DEFAULT_TEMPLATE_ID) {
    return null;
  }
  let css = buildTenantThemeCss(colors);
  if (templateId === AGENT_SIGNATURE_TEMPLATE_ID) {
    const surfaceSoft = mixHexWithWhite(colors.surface, 0.35);
    const surfaceMuted = mixHexWithWhite(colors.primary, 0.92);
    css += `
:root{
--as-ink:${colors.primary};
--as-ink-deep:${colors.secondary};
--as-accent:${colors.accent};
--as-surface:${colors.surface};
--as-surface-soft:${surfaceSoft};
--as-surface-muted:${surfaceMuted};
--as-cream:${colors.surface};
}
body{
background:var(--as-surface);
}
`;
  }
  return <style data-tenant-theme="workspace">{css}</style>;
}
