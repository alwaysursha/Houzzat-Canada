import { cn } from "@/lib/utils";

/** Tenant or Houzzat logo — never cross-fallback between workspaces. */
export function BrandLogoMark({
  displayName,
  logoUrl,
  primaryColor,
  className,
  size = "md",
}: {
  displayName: string;
  logoUrl: string | null;
  primaryColor: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "size-7" : "size-8";

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tenant-provided asset URL
      <img
        src={logoUrl}
        alt=""
        width={size === "sm" ? 28 : 32}
        height={size === "sm" ? 28 : 32}
        className={cn(box, "shrink-0 object-contain", className)}
      />
    );
  }

  const initial = displayName.trim().charAt(0).toUpperCase() || "R";
  return (
    <span
      className={cn(
        box,
        "inline-flex shrink-0 items-center justify-center rounded-md text-sm font-bold text-white",
        className,
      )}
      style={{ backgroundColor: primaryColor }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
