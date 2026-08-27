/**
 * Stage 3K.5.5.1 — coherent tenant theme injection (non-Houzzat workspaces only).
 */
import type { WorkspaceBrandColors } from "@/lib/tenancy/brand-dto";
import { deriveTenantThemeTokens } from "@/lib/tenancy/tenant-theme-tokens";

/**
 * Full palette override — maps legacy Houzzat token names to tenant colors so
 * existing `bg-canopy`, `bg-mist`, `text-canopy` utilities harmonize.
 */
export function buildTenantThemeCss(colors: WorkspaceBrandColors): string {
  const t = deriveTenantThemeTokens(colors);

  return `:root{
--ink:${t.ink};
--canopy:${t.primary};
--canopy-deep:${t.primaryStrong};
--mist:${t.mist};
--surface:${t.surface};
--line:${t.line};
--signal:${t.accent};
--background:${t.background};
--tenant-primary:${t.primary};
--tenant-primary-strong:${t.primaryStrong};
--tenant-accent:${t.accent};
--tenant-accent-soft:${t.accentSoft};
--tenant-surface-tint:${t.mist};
--tenant-border:${t.border};
--tenant-ring:${t.ring};
--tenant-link:${t.link};
--tenant-button:${t.button};
--tenant-button-hover:${t.buttonHover};
--tenant-primary-rgb:${t.primaryRgb};
--tenant-accent-rgb:${t.accentRgb};
}
body{
background:
radial-gradient(1600px 1100px at 8% -12%,rgb(var(--tenant-primary-rgb)/0.12),rgb(var(--tenant-primary-rgb)/0) 72%),
radial-gradient(1400px 1000px at 92% -8%,rgb(var(--tenant-accent-rgb)/0.1),rgb(var(--tenant-accent-rgb)/0) 70%),
var(--mist);
}
::selection{
background:rgb(var(--tenant-primary-rgb)/0.22);
}`;
}
