import { cn } from "@/lib/utils";

/**
 * Tenant name as the site header renders it: display font, tight tracking,
 * ink color. Size is the only thing callers vary.
 */
export function TenantTextLogo({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span className={cn("font-display tracking-tight text-ink", className)}>
      {name}
    </span>
  );
}
