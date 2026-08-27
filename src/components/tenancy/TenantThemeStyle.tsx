import { buildTenantThemeCss } from "@/lib/tenancy/brand-theme-css";
import type { WorkspaceBrandColors } from "@/lib/tenancy/brand-dto";

/** Per-request tenant theme — skipped for Houzzat (globals.css defaults apply). */
export function TenantThemeStyle({
  colors,
  isHouzzatWorkspace,
}: {
  colors: WorkspaceBrandColors;
  isHouzzatWorkspace: boolean;
}) {
  if (isHouzzatWorkspace) {
    return null;
  }
  const css = buildTenantThemeCss(colors);
  return <style data-tenant-theme="workspace">{css}</style>;
}
