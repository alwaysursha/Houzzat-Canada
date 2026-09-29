import { BrandLogoMark } from "@/components/tenancy/BrandLogoMark";
import { TenantTextLogo } from "@/components/tenancy/TenantTextLogo";
import { cn } from "@/lib/utils";

/**
 * The public website header brand: optional tenant mark plus the text logo.
 * The platform site is text-only. Other tenants include their logo or initial.
 */
export function TenantHeaderBrand({
  displayName,
  logoUrl = null,
  primaryColor = "#0F6B4C",
  showLogoMark = false,
  textClassName = "text-2xl",
}: {
  displayName: string;
  logoUrl?: string | null;
  primaryColor?: string;
  showLogoMark?: boolean;
  textClassName?: string;
}) {
  const name = displayName.trim();
  if (!name) return null;
  return (
    <span className={cn("flex min-w-0 items-center", showLogoMark && "gap-2")}>
      {showLogoMark ? (
        <BrandLogoMark
          displayName={name}
          logoUrl={logoUrl ?? null}
          primaryColor={primaryColor}
          size="sm"
        />
      ) : null}
      <TenantTextLogo name={name} className={textClassName} />
    </span>
  );
}
